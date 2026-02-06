import { PlayerAction, Card, BettingRound } from "../poker/types";

// ─── Card serialized for wire ────────────────────────────────
export interface CardData {
  rank: string;
  suit: string;
  display: string;
}

// ─── Agent -> Server messages ────────────────────────────────

export interface AgentActionMessage {
  type: "action";
  action: PlayerAction;
  amount?: number;
  reasoning?: string;
  apiKey?: string;
}

export interface AgentLeaveMessage {
  type: "leave";
}

export interface AgentSitBackMessage {
  type: "sit_back";
}

export type AgentMessage = AgentActionMessage | AgentLeaveMessage | AgentSitBackMessage;

// ─── Server -> Agent messages ────────────────────────────────

export interface RegisterAckMessage {
  type: "register_ack";
  seat: number;
  agentId: string;
  config: {
    turnTimeoutMs: number;
    maxTimeouts: number;
    smallBlind: number;
    bigBlind: number;
    maxPlayers: number;
  };
  waitingForNextHand: boolean;
  verificationKey?: string;
}

export interface RegisterErrorMessage {
  type: "register_error";
  reason: "table_full" | "duplicate_id" | "invalid_params" | "invalid_api_key" | "missing_credentials" | "evicted" | "unknown";
  message: string;
}

export interface PlayerInfo {
  seat: number;
  agentId: string;
  name: string;
  style: string;
  avatar: string;
  chips: number;
  sittingOut: boolean;
}

export interface NewHandMessage {
  type: "new_hand";
  handNumber: number;
  holeCards: CardData[];
  dealer: number;
  smallBlind: { seat: number; amount: number };
  bigBlind: { seat: number; amount: number };
  players: PlayerInfo[];
}

export interface ValidActionInfo {
  action: PlayerAction;
  minAmount?: number;
  maxAmount?: number;
}

export interface YourTurnMessage {
  type: "your_turn";
  seat: number;
  communityCards: CardData[];
  pot: number;
  yourChips: number;
  yourBet: number;
  currentBet: number;
  minRaise: number;
  validActions: ValidActionInfo[];
  timeoutMs: number;
  bettingRound: BettingRound;
  players: {
    seat: number;
    name: string;
    chips: number;
    bet: number;
    folded: boolean;
    allIn: boolean;
    sittingOut: boolean;
  }[];
}

export interface ActionResultMessage {
  type: "action_result";
  accepted: boolean;
  action?: PlayerAction;
  amount?: number;
  reason?: string;
}

export interface PlayerActionMessage {
  type: "player_action";
  seat: number;
  name: string;
  action: PlayerAction;
  amount: number;
  reasoning?: string;
  pot: number;
}

export interface CommunityCardsMessage {
  type: "community_cards";
  round: BettingRound;
  cards: CardData[];
}

export interface ShowdownMessage {
  type: "showdown";
  communityCards: CardData[];
  players: {
    seat: number;
    name: string;
    holeCards: CardData[];
  }[];
  winners: {
    seat: number;
    name: string;
    amount: number;
    handDescription: string;
  }[];
}

export interface HandCompleteMessage {
  type: "hand_complete";
  handNumber: number;
  winners: {
    seat: number;
    name: string;
    amount: number;
    handDescription: string;
  }[];
  players: PlayerInfo[];
}

export interface PlayerJoinedMessage {
  type: "player_joined";
  seat: number;
  agentId: string;
  name: string;
  style: string;
  avatar: string;
  chips: number;
}

export interface PlayerLeftMessage {
  type: "player_left";
  seat: number;
  agentId: string;
  name: string;
  reason: "leave" | "timeout" | "disconnect" | "removed" | "evicted";
}

export interface TimeoutWarningMessage {
  type: "timeout_warning";
  seat: number;
  timeoutCount: number;
  maxTimeouts: number;
  sittingOut: boolean;
}

export interface AgentThinkingMessage {
  type: "agent_thinking";
  seat: number;
  name: string;
  avatar: string;
}

export interface GameStateMessage {
  type: "game_state";
  handNumber: number;
  dealerSeat: number;
  smallBlindSeat: number;
  bigBlindSeat: number;
  bettingRound: BettingRound;
  pot: number;
  currentBet: number;
  activeSeat: number;
  communityCards: CardData[];
  players: (PlayerInfo & {
    bet: number;
    totalBet: number;
    folded: boolean;
    allIn: boolean;
    hasCards: boolean;
  })[];
  actions: {
    seat: number;
    name: string;
    action: PlayerAction;
    amount: number;
    reasoning?: string;
  }[];
}

export interface BlindsPostedMessage {
  type: "blinds_posted";
  smallBlind: { seat: number; name: string; amount: number };
  bigBlind: { seat: number; name: string; amount: number };
  pot: number;
}

export interface TransactionMessage {
  type: "transaction";
  txType: "bet" | "payout" | "rake_burn";
  from?: string;
  to?: string;
  amount: number;
  sig?: string;
}

export type ServerMessage =
  | RegisterAckMessage
  | RegisterErrorMessage
  | NewHandMessage
  | YourTurnMessage
  | ActionResultMessage
  | PlayerActionMessage
  | CommunityCardsMessage
  | ShowdownMessage
  | HandCompleteMessage
  | PlayerJoinedMessage
  | PlayerLeftMessage
  | TimeoutWarningMessage
  | AgentThinkingMessage
  | GameStateMessage
  | BlindsPostedMessage
  | TransactionMessage;

// ─── Wire envelope (shared by agent + spectator connections) ─
export interface WSEnvelope {
  type: string;
  data: any;
  timestamp: number;
}
