import { WebSocketServer, WebSocket } from "ws";
import { createServer, IncomingMessage, ServerResponse, Server as HttpServer } from "http";
import { URL } from "url";
import { PlayerRegistry, RegisteredAgent } from "../registry/player-registry";
import { ProfileStore } from "../registry/profile-store";
import { VerificationStore } from "../registry/verification-store";
import { ApiKeyStore } from "../registry/api-key-store";
import {
  TURN_TIMEOUT_MS,
  MAX_TIMEOUTS,
  SIT_OUT_REMOVAL_MS,
} from "../protocol/constants";
import {
  AgentMessage,
  ServerMessage,
  WSEnvelope,
  CardData,
  PlayerInfo,
  ValidActionInfo,
} from "../protocol/messages";
import { PlayerAction, BettingRound } from "../poker/types";

export type WSMessageType =
  | "game_state"
  | "agent_thinking"
  | "player_action"
  | "community_cards"
  | "showdown"
  | "hand_complete"
  | "transaction"
  | "new_hand"
  | "blinds_posted"
  | "register_ack"
  | "register_error"
  | "your_turn"
  | "action_result"
  | "player_joined"
  | "player_left"
  | "timeout_warning"
  | "error";

interface PendingTurn {
  resolve: (action: { action: PlayerAction; amount: number; reasoning: string; timedOut: boolean }) => void;
  timer: NodeJS.Timeout;
}

// Rate limit: track registration attempts per IP
interface RateLimitEntry {
  count: number;
  resetAt: number;
}

const RATE_LIMIT_MAX = 10;
const RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000; // 1 hour

export class GameServer {
  private httpServer: HttpServer;
  private wss: WebSocketServer;
  private spectators: Set<WebSocket> = new Set();
  private registry: PlayerRegistry;
  private profileStore: ProfileStore | null = null;
  private pendingTurns: Map<string, PendingTurn> = new Map();
  private sitOutTimers: Map<string, NodeJS.Timeout> = new Map();
  private handInProgress: boolean = false;
  private pendingJoins: Map<string, RegisteredAgent> = new Map();
  private startTime: number = Date.now();
  private handCount: number = 0;
  private verificationStore: VerificationStore | null = null;
  private apiKeyStore: ApiKeyStore | null = null;
  private rateLimits: Map<string, RateLimitEntry> = new Map();

  // Callbacks for game loop integration
  onAgentRegistered?: (agent: RegisteredAgent) => void;
  onAgentLeft?: (agent: RegisteredAgent, reason: string) => void;
  onAgentVerified?: (agentId: string, seat: number) => void;

  constructor(port: number, registry: PlayerRegistry, profileStore?: ProfileStore, verificationStore?: VerificationStore, apiKeyStore?: ApiKeyStore) {
    this.registry = registry;
    this.profileStore = profileStore || null;
    this.verificationStore = verificationStore || null;
    this.apiKeyStore = apiKeyStore || null;

    this.httpServer = createServer((req, res) => this.handleHttpRequest(req, res));
    this.wss = new WebSocketServer({ server: this.httpServer });

    this.wss.on("connection", (ws, req) => {
      this.handleConnection(ws, req);
    });

    this.httpServer.listen(port, () => {
      console.log(`[GameServer] Listening on port ${port}`);
    });
  }

  setHandCount(n: number): void {
    this.handCount = n;
  }

  // ─── HTTP API ──────────────────────────────────────────────

  private handleHttpRequest(req: IncomingMessage, res: ServerResponse): void {
    // CORS headers
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");

    if (req.method === "OPTIONS") {
      res.writeHead(204);
      res.end();
      return;
    }

    const url = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);
    const path = url.pathname;

    if (req.method === "GET" && path === "/health") {
      res.writeHead(200, { "Content-Type": "text/plain" });
      res.end("OK");
      return;
    }

    if (req.method === "GET" && path === "/api/status") {
      const conns = this.getConnectionCount();
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({
        playersOnline: conns.agents,
        spectators: conns.spectators,
        handNumber: this.handCount,
        handInProgress: this.handInProgress,
        uptimeSeconds: Math.floor((Date.now() - this.startTime) / 1000),
      }));
      return;
    }

    if (req.method === "GET" && path === "/api/agents") {
      const profiles = this.profileStore?.getAll() || [];
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify(profiles));
      return;
    }

    if (req.method === "GET" && path.startsWith("/api/agents/")) {
      const agentId = path.slice("/api/agents/".length);
      const profile = this.profileStore?.getById(agentId);
      if (profile) {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify(profile));
      } else {
        res.writeHead(404, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Agent not found" }));
      }
      return;
    }

    if (req.method === "POST" && path === "/api/register") {
      this.handleRegisterRequest(req, res);
      return;
    }

    if (req.method === "POST" && path === "/api/validate-key") {
      this.handleValidateKeyRequest(req, res);
      return;
    }

    if (req.method === "POST" && path === "/api/verify") {
      this.handleVerifyRequest(req, res);
      return;
    }

    if (req.method === "GET" && path === "/api/verifications") {
      const verifications = this.verificationStore?.getAll() || [];
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify(verifications));
      return;
    }

    // Not found
    res.writeHead(404, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Not found" }));
  }

  // ─── POST /api/register ────────────────────────────────────

  private handleRegisterRequest(req: IncomingMessage, res: ServerResponse): void {
    if (!this.apiKeyStore) {
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Registration not available" }));
      return;
    }

    // Rate limiting
    const ip = req.headers["x-forwarded-for"]?.toString().split(",")[0].trim()
      || req.socket.remoteAddress || "unknown";
    if (!this.checkRateLimit(ip)) {
      res.writeHead(429, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Too many registrations. Try again later." }));
      return;
    }

    let body = "";
    req.on("data", (chunk) => { body += chunk; });
    req.on("end", () => {
      try {
        const { name, style, avatar } = JSON.parse(body);
        if (!name || typeof name !== "string") {
          res.writeHead(400, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: "Missing 'name' in request body" }));
          return;
        }

        const record = this.apiKeyStore!.register({ name, style, avatar });
        res.writeHead(201, { "Content-Type": "application/json" });
        res.end(JSON.stringify({
          apiKey: record.apiKey,
          agentId: record.agentId,
          name: record.name,
          style: record.style,
          avatar: record.avatar,
        }));
      } catch (e: any) {
        const status = e.message === "Name already taken" ? 409 : 400;
        res.writeHead(status, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: e.message || "Invalid request" }));
      }
    });
  }

  // ─── POST /api/validate-key ────────────────────────────────

  private handleValidateKeyRequest(req: IncomingMessage, res: ServerResponse): void {
    if (!this.apiKeyStore) {
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "API key validation not available" }));
      return;
    }

    let body = "";
    req.on("data", (chunk) => { body += chunk; });
    req.on("end", () => {
      try {
        const { apiKey } = JSON.parse(body);
        if (!apiKey || typeof apiKey !== "string") {
          res.writeHead(400, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: "Missing 'apiKey' in request body" }));
          return;
        }

        const record = this.apiKeyStore!.validateKey(apiKey);
        if (!record) {
          res.writeHead(401, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: "Invalid API key" }));
          return;
        }

        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({
          agentId: record.agentId,
          name: record.name,
          style: record.style,
          avatar: record.avatar,
        }));
      } catch {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Invalid JSON body" }));
      }
    });
  }

  // ─── POST /api/verify (legacy, kept for compat) ────────────

  private handleVerifyRequest(req: IncomingMessage, res: ServerResponse): void {
    let body = "";
    req.on("data", (chunk) => { body += chunk; });
    req.on("end", () => {
      try {
        const { key } = JSON.parse(body);
        if (!key || typeof key !== "string") {
          res.writeHead(400, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: "Missing 'key' in request body" }));
          return;
        }

        if (!this.verificationStore) {
          res.writeHead(500, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: "Verification not available" }));
          return;
        }

        const verification = this.verificationStore.verify(key);
        if (!verification) {
          res.writeHead(404, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: "Invalid verification key" }));
          return;
        }

        // Mark agent as verified in registry
        const agent = this.registry.getById(verification.agentId);
        if (agent) {
          agent.verified = true;
        }

        // Trigger callback
        this.onAgentVerified?.(verification.agentId, verification.seat);

        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({
          agentId: verification.agentId,
          seat: verification.seat,
          verified: true,
        }));
      } catch {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Invalid JSON body" }));
      }
    });
  }

  // ─── Rate limiting ─────────────────────────────────────────

  private checkRateLimit(ip: string): boolean {
    const now = Date.now();
    const entry = this.rateLimits.get(ip);

    if (!entry || now >= entry.resetAt) {
      this.rateLimits.set(ip, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
      return true;
    }

    entry.count++;
    return entry.count <= RATE_LIMIT_MAX;
  }

  // ─── WebSocket connection handling ─────────────────────────

  setHandInProgress(v: boolean): void {
    this.handInProgress = v;

    // Process pending joins when hand ends
    if (!v && this.pendingJoins.size > 0) {
      for (const [id, agent] of this.pendingJoins) {
        this.onAgentRegistered?.(agent);
      }
      this.pendingJoins.clear();
    }
  }

  private handleConnection(ws: WebSocket, req: IncomingMessage): void {
    const params = this.parseParams(req);

    if (params.role === "spectator") {
      this.spectators.add(ws);
      console.log(`[GameServer] Spectator connected (total: ${this.spectators.size})`);
      ws.on("close", () => {
        this.spectators.delete(ws);
        console.log(`[GameServer] Spectator disconnected (total: ${this.spectators.size})`);
      });
      ws.on("error", () => this.spectators.delete(ws));
      return;
    }

    if (params.role === "agent") {
      this.handleAgentConnection(ws, params);
      return;
    }

    // Unknown role: treat as spectator
    this.spectators.add(ws);
    ws.on("close", () => this.spectators.delete(ws));
    ws.on("error", () => this.spectators.delete(ws));
  }

  private handleAgentConnection(ws: WebSocket, params: Record<string, string>): void {
    const { apiKey } = params;

    // ─── API Key auth (required for all external agents) ─────
    if (apiKey) {
      const record = this.apiKeyStore?.getByKey(apiKey);
      if (!record) {
        this.sendToWs(ws, "register_error", {
          type: "register_error",
          reason: "invalid_api_key",
          message: "Invalid API key. Register at chips.rip/register to get one.",
        });
        ws.close();
        return;
      }

      const { agentId, name, style, avatar } = record;

      // Check for reconnection
      const existing = this.registry.getById(agentId);
      if (existing) {
        this.registry.reconnect(agentId, ws);
        existing.sittingOut = false;
        this.clearSitOutTimer(agentId);
        console.log(`[GameServer] Agent ${name} reconnected to seat ${existing.seat}`);
        this.sendToWs(ws, "register_ack", {
          type: "register_ack",
          seat: existing.seat,
          agentId,
          config: {
            turnTimeoutMs: TURN_TIMEOUT_MS,
            maxTimeouts: MAX_TIMEOUTS,
            smallBlind: 500,
            bigBlind: 1000,
            maxPlayers: 8,
          },
          waitingForNextHand: this.handInProgress,
        });
        this.setupAgentListeners(ws, agentId);
        return;
      }

      // New registration from API key
      const result = this.registry.register({
        agentId,
        name,
        style,
        avatar,
        ws,
      });

      if (typeof result === "string") {
        this.sendToWs(ws, "register_error", {
          type: "register_error",
          reason: result,
          message: result === "table_full" ? "All 8 seats are occupied"
            : result === "duplicate_id" ? "An agent with this ID is already connected"
            : "Registration failed",
        });
        ws.close();
        return;
      }

      // API key agents are auto-verified
      result.verified = true;
      result.apiKey = apiKey;

      console.log(`[GameServer] Agent ${name} registered at seat ${result.seat} (API key)`);

      this.sendToWs(ws, "register_ack", {
        type: "register_ack",
        seat: result.seat,
        agentId,
        config: {
          turnTimeoutMs: TURN_TIMEOUT_MS,
          maxTimeouts: MAX_TIMEOUTS,
          smallBlind: 500,
          bigBlind: 1000,
          maxPlayers: 8,
        },
        waitingForNextHand: this.handInProgress,
      });

      // Broadcast join
      this.broadcast("player_joined", {
        type: "player_joined",
        seat: result.seat,
        agentId,
        name: result.name,
        style: result.style,
        avatar: result.avatar,
        chips: result.chips,
      });

      // Fire verified callback immediately (pool init)
      this.onAgentVerified?.(agentId, result.seat);

      if (this.handInProgress) {
        this.pendingJoins.set(agentId, result);
      } else {
        this.onAgentRegistered?.(result);
      }

      this.setupAgentListeners(ws, agentId);
      return;
    }

    // ─── No API key: reject ─────────────────────────────────
    this.sendToWs(ws, "register_error", {
      type: "register_error",
      reason: "missing_credentials",
      message: "API key required. Register at chips.rip/register to get one.",
    });
    ws.close();
  }

  private setupAgentListeners(ws: WebSocket, agentId: string): void {
    ws.on("message", (data) => {
      try {
        const msg: AgentMessage = JSON.parse(data.toString());
        this.handleAgentMessage(agentId, msg);
      } catch {
        // Ignore malformed messages
      }
    });

    ws.on("close", () => {
      this.handleAgentDisconnect(agentId);
    });

    ws.on("error", () => {
      this.handleAgentDisconnect(agentId);
    });
  }

  private handleAgentMessage(agentId: string, msg: AgentMessage): void {
    this.registry.touchActivity(agentId);

    switch (msg.type) {
      case "action": {
        // Per-action API key validation
        const agent = this.registry.getById(agentId);
        if (agent?.apiKey && msg.apiKey !== agent.apiKey) {
          break; // Silently ignore invalid action
        }

        const pending = this.pendingTurns.get(agentId);
        if (pending) {
          clearTimeout(pending.timer);
          this.pendingTurns.delete(agentId);
          this.registry.resetTimeouts(agentId);
          pending.resolve({
            action: msg.action,
            amount: msg.amount ?? 0,
            reasoning: msg.reasoning ?? "",
            timedOut: false,
          });
        }
        // If not their turn, silently ignore
        break;
      }

      case "leave": {
        const agent = this.registry.getById(agentId);
        if (agent) {
          this.broadcast("player_left", {
            type: "player_left",
            seat: agent.seat,
            agentId,
            name: agent.name,
            reason: "leave",
          });
          // Resolve any pending turn as fold
          this.resolveTimeoutForAgent(agentId);
          this.registry.unregister(agentId);
          this.onAgentLeft?.(agent, "leave");
        }
        break;
      }

      case "sit_back": {
        const agent = this.registry.getById(agentId);
        if (agent && agent.sittingOut) {
          agent.sittingOut = false;
          agent.timeoutCount = 0;
          this.clearSitOutTimer(agentId);
          console.log(`[GameServer] Agent ${agent.name} sitting back in`);
        }
        break;
      }
    }
  }

  private handleAgentDisconnect(agentId: string): void {
    const agent = this.registry.getById(agentId);
    if (!agent) return;

    console.log(`[GameServer] Agent ${agent.name} disconnected`);
    agent.ws = null;

    // Resolve pending turn as timeout
    this.resolveTimeoutForAgent(agentId);

    // Mark sitting out, start removal timer
    agent.sittingOut = true;
    this.startSitOutTimer(agentId);
  }

  private resolveTimeoutForAgent(agentId: string): void {
    const pending = this.pendingTurns.get(agentId);
    if (pending) {
      clearTimeout(pending.timer);
      this.pendingTurns.delete(agentId);
      pending.resolve({
        action: "fold",
        amount: 0,
        reasoning: "Agent disconnected",
        timedOut: true,
      });
    }
  }

  private startSitOutTimer(agentId: string): void {
    this.clearSitOutTimer(agentId);
    const timer = setTimeout(() => {
      const agent = this.registry.getById(agentId);
      if (agent && agent.sittingOut) {
        console.log(`[GameServer] Removing ${agent.name} after sit-out timeout`);
        this.broadcast("player_left", {
          type: "player_left",
          seat: agent.seat,
          agentId,
          name: agent.name,
          reason: "removed",
        });
        this.registry.unregister(agentId);
        this.onAgentLeft?.(agent, "removed");
      }
    }, SIT_OUT_REMOVAL_MS);
    this.sitOutTimers.set(agentId, timer);
  }

  private clearSitOutTimer(agentId: string): void {
    const timer = this.sitOutTimers.get(agentId);
    if (timer) {
      clearTimeout(timer);
      this.sitOutTimers.delete(agentId);
    }
  }

  // ─── Turn management ──────────────────────────────────────

  waitForAction(
    agentId: string,
    timeoutMs: number = TURN_TIMEOUT_MS,
  ): Promise<{ action: PlayerAction; amount: number; reasoning: string; timedOut: boolean }> {
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        this.pendingTurns.delete(agentId);
        const count = this.registry.incrementTimeout(agentId);
        const agent = this.registry.getById(agentId);

        if (agent) {
          // Send timeout warning
          this.broadcast("timeout_warning", {
            type: "timeout_warning",
            seat: agent.seat,
            timeoutCount: count,
            maxTimeouts: MAX_TIMEOUTS,
            sittingOut: count >= MAX_TIMEOUTS,
          });

          if (count >= MAX_TIMEOUTS) {
            agent.sittingOut = true;
            this.broadcast("player_left", {
              type: "player_left",
              seat: agent.seat,
              agentId,
              name: agent.name,
              reason: "timeout",
            });
            this.startSitOutTimer(agentId);
          }
        }

        resolve({
          action: "fold",
          amount: 0,
          reasoning: "Timed out",
          timedOut: true,
        });
      }, timeoutMs);

      this.pendingTurns.set(agentId, { resolve, timer });
    });
  }

  // ─── Send helpers ─────────────────────────────────────────

  sendToAgent(agentId: string, type: string, data: any): void {
    const agent = this.registry.getById(agentId);
    if (agent?.ws && agent.ws.readyState === WebSocket.OPEN) {
      this.sendToWs(agent.ws, type, data);
    }
  }

  sendToSeat(seat: number, type: string, data: any): void {
    const agent = this.registry.getBySeat(seat);
    if (agent?.ws && agent.ws.readyState === WebSocket.OPEN) {
      this.sendToWs(agent.ws, type, data);
    }
  }

  broadcast(type: string, data: any): void {
    const payload = JSON.stringify({ type, data, timestamp: Date.now() } as WSEnvelope);

    // Send to all agents
    for (const agent of this.registry.getSeatedAgents()) {
      if (agent.ws && agent.ws.readyState === WebSocket.OPEN) {
        try { agent.ws.send(payload); } catch {}
      }
    }

    // Send to all spectators
    for (const ws of this.spectators) {
      if (ws.readyState === WebSocket.OPEN) {
        try { ws.send(payload); } catch {}
      }
    }
  }

  broadcastSpectators(type: string, data: any): void {
    const payload = JSON.stringify({ type, data, timestamp: Date.now() } as WSEnvelope);
    for (const ws of this.spectators) {
      if (ws.readyState === WebSocket.OPEN) {
        try { ws.send(payload); } catch {}
      }
    }
  }

  private sendToWs(ws: WebSocket, type: string, data: any): void {
    if (ws.readyState === WebSocket.OPEN) {
      try {
        ws.send(JSON.stringify({ type, data, timestamp: Date.now() } as WSEnvelope));
      } catch {}
    }
  }

  // ─── Helpers ──────────────────────────────────────────────

  private parseParams(req: IncomingMessage): Record<string, string> {
    try {
      const url = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);
      const params: Record<string, string> = {};
      for (const [key, value] of url.searchParams) {
        params[key] = value;
      }
      return params;
    } catch {
      return {};
    }
  }

  getConnectionCount(): { agents: number; spectators: number } {
    return {
      agents: this.registry.getSeatedAgents().filter(a => a.ws !== null).length,
      spectators: this.spectators.size,
    };
  }

  close(): void {
    // Clear all timers
    for (const [, pending] of this.pendingTurns) {
      clearTimeout(pending.timer);
    }
    for (const [, timer] of this.sitOutTimers) {
      clearTimeout(timer);
    }
    this.wss.close();
    this.httpServer.close();
  }
}
