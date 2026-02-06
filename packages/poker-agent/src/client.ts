import WebSocket from "ws";
import {
  DecisionContext,
  PokerDecision,
  GameEvent,
  RegisterAck,
  RegisterError,
  YourTurn,
  CardData,
  ValidAction,
} from "./types";

export interface AgentConfig {
  serverUrl: string;
  apiKey: string;
  agentId?: string;
  name?: string;
  style?: string;
  avatar?: string;
  wallet?: string;
  onDecision: (ctx: DecisionContext) => Promise<PokerDecision>;
  onGameEvent?: (event: GameEvent) => void;
  onConnect?: (ack: RegisterAck) => void;
  onDisconnect?: () => void;
  onError?: (error: Error) => void;
  reconnect?: boolean;
}

const RECONNECT_DELAY_MS = 3000;

export class PokerAgentClient {
  private config: AgentConfig;
  private ws: WebSocket | null = null;
  private mySeat: number = -1;
  private holeCards: CardData[] = [];
  private reconnectTimer: NodeJS.Timeout | null = null;
  private closing: boolean = false;

  constructor(config: AgentConfig) {
    this.config = config;
  }

  connect(): void {
    this.closing = false;
    const params = new URLSearchParams({ role: "agent" });

    if (this.config.apiKey) {
      params.set("apiKey", this.config.apiKey);
    }

    // Optional overrides (server derives identity from key, but these can supplement)
    if (this.config.agentId) params.set("agentId", this.config.agentId);
    if (this.config.name) params.set("name", this.config.name);
    if (this.config.style) params.set("style", this.config.style);
    if (this.config.avatar) params.set("avatar", this.config.avatar);
    if (this.config.wallet) params.set("wallet", this.config.wallet);

    const url = `${this.config.serverUrl}?${params.toString()}`;
    this.ws = new WebSocket(url);

    this.ws.on("open", () => {
      console.log(`[PokerAgent] Connected to ${this.config.serverUrl}`);
    });

    this.ws.on("message", (data) => {
      try {
        const envelope = JSON.parse(data.toString());
        this.handleMessage(envelope);
      } catch {
        // Ignore malformed
      }
    });

    this.ws.on("close", () => {
      console.log("[PokerAgent] Disconnected");
      this.config.onDisconnect?.();
      if (!this.closing && (this.config.reconnect ?? true)) {
        this.scheduleReconnect();
      }
    });

    this.ws.on("error", (err) => {
      this.config.onError?.(err);
    });
  }

  disconnect(): void {
    this.closing = true;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.ws) {
      // Send leave message before closing
      this.send({ type: "leave" });
      this.ws.close();
      this.ws = null;
    }
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer) return;
    console.log(`[PokerAgent] Reconnecting in ${RECONNECT_DELAY_MS / 1000}s...`);
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, RECONNECT_DELAY_MS);
  }

  private send(msg: any): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(msg));
    }
  }

  private handleMessage(envelope: { type: string; data: any; timestamp: number }): void {
    const { type, data } = envelope;

    switch (type) {
      case "register_ack": {
        const ack = data as RegisterAck;
        this.mySeat = ack.seat;
        console.log(`[PokerAgent] Registered at seat ${ack.seat}${ack.waitingForNextHand ? " (waiting for next hand)" : ""}`);
        this.config.onConnect?.(ack);
        break;
      }

      case "register_error": {
        const err = data as RegisterError;
        console.error(`[PokerAgent] Registration failed: ${err.message}`);
        this.config.onError?.(new Error(err.message));
        this.closing = true;
        break;
      }

      case "new_hand": {
        if (data.holeCards && data.holeCards.length > 0) {
          this.holeCards = data.holeCards;
        }
        this.config.onGameEvent?.({ type, data });
        break;
      }

      case "your_turn": {
        this.handleYourTurn(data as YourTurn);
        break;
      }

      default: {
        this.config.onGameEvent?.({ type, data });
        break;
      }
    }
  }

  private async handleYourTurn(turn: YourTurn): Promise<void> {
    const toCall = Math.max(0, turn.currentBet - turn.yourBet);
    const potOdds = toCall > 0 ? toCall / (turn.pot + toCall) : null;

    // Determine position label
    const position = this.getPositionLabel(turn);

    const ctx: DecisionContext = {
      holeCards: this.holeCards,
      communityCards: turn.communityCards,
      validActions: turn.validActions,
      pot: turn.pot,
      yourChips: turn.yourChips,
      yourBet: turn.yourBet,
      toCall,
      potOdds,
      currentBet: turn.currentBet,
      minRaise: turn.minRaise,
      position,
      bettingRound: turn.bettingRound,
      players: turn.players,
      timeoutMs: turn.timeoutMs,
    };

    try {
      const decision = await this.config.onDecision(ctx);
      this.send({
        type: "action",
        action: decision.action,
        amount: decision.amount,
        reasoning: decision.reasoning,
        ...(this.config.apiKey && { apiKey: this.config.apiKey }),
      });
    } catch (err: any) {
      console.error(`[PokerAgent] Decision error: ${err.message}`);
      // Fallback: check if free, else fold
      const canCheck = turn.validActions.find(a => a.action === "check");
      this.send({
        type: "action",
        action: canCheck ? "check" : "fold",
        reasoning: "Decision error fallback",
        ...(this.config.apiKey && { apiKey: this.config.apiKey }),
      });
    }
  }

  private getPositionLabel(turn: YourTurn): string {
    const activePlayers = turn.players.filter(p => !p.sittingOut);
    // We don't have dealer info in your_turn, so use generic position
    const myIdx = activePlayers.findIndex(p => p.seat === this.mySeat);
    const total = activePlayers.length;
    if (total <= 2) return myIdx === 0 ? "SB" : "BB";
    if (myIdx === 0) return "EP";
    if (myIdx === total - 1) return "BTN";
    if (myIdx === total - 2) return "CO";
    if (myIdx === total - 3) return "HJ";
    return "MP";
  }
}
