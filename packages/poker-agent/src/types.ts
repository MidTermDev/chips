export interface CardData {
  rank: string;
  suit: string;
  display: string;
}

export type PlayerAction = "fold" | "check" | "call" | "raise" | "all-in";
export type BettingRound = "preflop" | "flop" | "turn" | "river";

export interface ValidAction {
  action: PlayerAction;
  minAmount?: number;
  maxAmount?: number;
}

export interface PlayerInfo {
  seat: number;
  name: string;
  chips: number;
  bet: number;
  folded: boolean;
  allIn: boolean;
  sittingOut: boolean;
}

export interface DecisionContext {
  holeCards: CardData[];
  communityCards: CardData[];
  validActions: ValidAction[];
  pot: number;
  yourChips: number;
  yourBet: number;
  toCall: number;
  potOdds: number | null;
  currentBet: number;
  minRaise: number;
  position: string;
  bettingRound: BettingRound;
  players: PlayerInfo[];
  timeoutMs: number;
}

export interface PokerDecision {
  action: PlayerAction;
  amount?: number;
  reasoning?: string;
}

// Server -> Agent message types
export interface RegisterAck {
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

export interface RegisterError {
  type: "register_error";
  reason: string;
  message: string;
}

export interface NewHand {
  type: "new_hand";
  handNumber: number;
  holeCards: CardData[];
  dealer: number;
  smallBlind: { seat: number; amount: number };
  bigBlind: { seat: number; amount: number };
  players: { seat: number; name: string; chips: number; sittingOut: boolean }[];
}

export interface YourTurn {
  type: "your_turn";
  seat: number;
  communityCards: CardData[];
  pot: number;
  yourChips: number;
  yourBet: number;
  currentBet: number;
  minRaise: number;
  validActions: ValidAction[];
  timeoutMs: number;
  bettingRound: BettingRound;
  players: PlayerInfo[];
}

export interface PlayerActionEvent {
  type: "player_action";
  seat: number;
  name: string;
  action: PlayerAction;
  amount: number;
  reasoning?: string;
  pot: number;
}

export interface HandComplete {
  type: "hand_complete";
  handNumber: number;
  winners: { seat: number; name: string; amount: number; handDescription: string }[];
  players: { seat: number; name: string; chips: number; sittingOut: boolean }[];
}

export interface Showdown {
  type: "showdown";
  communityCards: CardData[];
  players: { seat: number; name: string; holeCards: CardData[] }[];
  winners: { seat: number; name: string; amount: number; handDescription: string }[];
}

export type GameEvent =
  | { type: "new_hand"; data: NewHand }
  | { type: "your_turn"; data: YourTurn }
  | { type: "player_action"; data: PlayerActionEvent }
  | { type: "hand_complete"; data: HandComplete }
  | { type: "showdown"; data: Showdown }
  | { type: "community_cards"; data: { round: string; cards: CardData[] } }
  | { type: "player_joined"; data: { seat: number; name: string; chips: number } }
  | { type: "player_left"; data: { seat: number; name: string; reason: string } }
  | { type: "timeout_warning"; data: { seat: number; timeoutCount: number; maxTimeouts: number; sittingOut: boolean } }
  | { type: string; data: any };
