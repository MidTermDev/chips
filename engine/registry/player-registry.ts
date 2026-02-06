import { WebSocket } from "ws";
import { MAX_PLAYERS } from "../protocol/constants";

export interface RegisteredAgent {
  agentId: string;
  seat: number;
  poolIndex: number;       // same as seat
  name: string;
  style: string;
  avatar: string;
  walletAddress: string;
  ws: WebSocket | null;    // null if disconnected
  chips: number;
  sittingOut: boolean;
  timeoutCount: number;
  lastActivityMs: number;
  isHouseBot: boolean;
  verified: boolean;
  apiKey?: string;
}

export interface RegistrationOpts {
  agentId: string;
  name: string;
  style?: string;
  avatar?: string;
  walletAddress?: string;
  ws: WebSocket | null;
  chips?: number;
  isHouseBot?: boolean;
}

export type RegistrationError = "table_full" | "duplicate_id" | "invalid_params";

export class PlayerRegistry {
  private agents: Map<string, RegisteredAgent> = new Map();
  private seatMap: (string | null)[] = new Array(MAX_PLAYERS).fill(null);

  register(opts: RegistrationOpts): RegisteredAgent | RegistrationError {
    if (!opts.agentId || !opts.name) return "invalid_params";
    if (this.agents.has(opts.agentId)) return "duplicate_id";

    const seat = this.allocateSeat();
    if (seat === null) return "table_full";

    const agent: RegisteredAgent = {
      agentId: opts.agentId,
      seat,
      poolIndex: seat,
      name: opts.name,
      style: opts.style || "Unknown",
      avatar: opts.avatar || opts.name.slice(0, 2).toUpperCase(),
      walletAddress: opts.walletAddress || "",
      ws: opts.ws,
      chips: opts.chips ?? 50_000_000,
      sittingOut: false,
      timeoutCount: 0,
      lastActivityMs: Date.now(),
      isHouseBot: opts.isHouseBot ?? false,
      verified: false,
    };

    this.agents.set(opts.agentId, agent);
    this.seatMap[seat] = opts.agentId;
    return agent;
  }

  unregister(agentId: string): void {
    const agent = this.agents.get(agentId);
    if (!agent) return;
    this.seatMap[agent.seat] = null;
    this.agents.delete(agentId);
  }

  getById(agentId: string): RegisteredAgent | undefined {
    return this.agents.get(agentId);
  }

  getBySeat(seat: number): RegisteredAgent | undefined {
    const id = this.seatMap[seat];
    if (id === null) return undefined;
    return this.agents.get(id);
  }

  getByWebSocket(ws: WebSocket): RegisteredAgent | undefined {
    for (const agent of this.agents.values()) {
      if (agent.ws === ws) return agent;
    }
    return undefined;
  }

  getSeatedAgents(): RegisteredAgent[] {
    return Array.from(this.agents.values());
  }

  getActiveAgents(): RegisteredAgent[] {
    return this.getSeatedAgents().filter(a => !a.sittingOut && a.chips > 0);
  }

  getActiveCount(): number {
    return this.getActiveAgents().length;
  }

  getSeatMap(): (string | null)[] {
    return [...this.seatMap];
  }

  allocateSeat(): number | null {
    for (let i = 0; i < MAX_PLAYERS; i++) {
      if (this.seatMap[i] === null) return i;
    }
    return null;
  }

  releaseSeat(seat: number): void {
    const id = this.seatMap[seat];
    if (id !== null) {
      this.agents.delete(id);
      this.seatMap[seat] = null;
    }
  }

  updateChips(seat: number, chips: number): void {
    const agent = this.getBySeat(seat);
    if (agent) agent.chips = chips;
  }

  markSittingOut(agentId: string, sittingOut: boolean): void {
    const agent = this.agents.get(agentId);
    if (agent) agent.sittingOut = sittingOut;
  }

  incrementTimeout(agentId: string): number {
    const agent = this.agents.get(agentId);
    if (!agent) return 0;
    agent.timeoutCount++;
    return agent.timeoutCount;
  }

  resetTimeouts(agentId: string): void {
    const agent = this.agents.get(agentId);
    if (agent) agent.timeoutCount = 0;
  }

  touchActivity(agentId: string): void {
    const agent = this.agents.get(agentId);
    if (agent) agent.lastActivityMs = Date.now();
  }

  reconnect(agentId: string, ws: WebSocket): RegisteredAgent | null {
    const agent = this.agents.get(agentId);
    if (!agent) return null;
    agent.ws = ws;
    agent.lastActivityMs = Date.now();
    return agent;
  }

  toSnapshot(): RegistrySnapshot {
    const agents: AgentSnapshot[] = [];
    for (const a of this.agents.values()) {
      agents.push({
        agentId: a.agentId,
        seat: a.seat,
        name: a.name,
        style: a.style,
        avatar: a.avatar,
        walletAddress: a.walletAddress,
        chips: a.chips,
        sittingOut: a.sittingOut,
        timeoutCount: a.timeoutCount,
        isHouseBot: a.isHouseBot,
        verified: a.verified,
        apiKey: a.apiKey,
      });
    }
    return { agents, savedAt: Date.now() };
  }

  loadSnapshot(snapshot: RegistrySnapshot): void {
    this.agents.clear();
    this.seatMap = new Array(MAX_PLAYERS).fill(null);

    for (const s of snapshot.agents) {
      const agent: RegisteredAgent = {
        agentId: s.agentId,
        seat: s.seat,
        poolIndex: s.seat,
        name: s.name,
        style: s.style,
        avatar: s.avatar,
        walletAddress: s.walletAddress,
        ws: null,  // agents must reconnect
        chips: s.chips,
        sittingOut: true, // sitting out until reconnect
        timeoutCount: s.timeoutCount,
        lastActivityMs: Date.now(),
        isHouseBot: s.isHouseBot,
        verified: s.verified ?? false,
        apiKey: s.apiKey,
      };
      this.agents.set(s.agentId, agent);
      this.seatMap[s.seat] = s.agentId;
    }
  }
}

export interface AgentSnapshot {
  agentId: string;
  seat: number;
  name: string;
  style: string;
  avatar: string;
  walletAddress: string;
  chips: number;
  sittingOut: boolean;
  timeoutCount: number;
  isHouseBot: boolean;
  verified: boolean;
  apiKey?: string;
}

export interface RegistrySnapshot {
  agents: AgentSnapshot[];
  savedAt: number;
}
