export type Suit = "h" | "d" | "c" | "s";
export type Rank = "2" | "3" | "4" | "5" | "6" | "7" | "8" | "9" | "T" | "J" | "Q" | "K" | "A";

export interface Card {
  rank: Rank;
  suit: Suit;
}

export type PlayerAction = "fold" | "check" | "call" | "raise" | "all-in";

export interface ActionRecord {
  playerIndex: number;
  playerName: string;
  action: PlayerAction;
  amount: number;
  reasoning?: string;
  timestamp: number;
}

export interface Player {
  index: number;
  name: string;
  chips: number;        // Display amount (not raw token amount)
  holeCards: Card[];
  bet: number;          // Current bet in this round
  totalBet: number;     // Total bet across all rounds in this hand
  folded: boolean;
  allIn: boolean;
  sittingOut: boolean;
}

export type BettingRound = "preflop" | "flop" | "turn" | "river";

export interface SidePot {
  amount: number;
  eligiblePlayers: number[]; // player indices
}

export interface GameState {
  handNumber: number;
  dealerIndex: number;
  smallBlindIndex: number;
  bigBlindIndex: number;
  players: Player[];
  communityCards: Card[];
  pot: number;
  sidePots: SidePot[];
  currentBet: number;
  minRaise: number;
  bettingRound: BettingRound;
  activePlayerIndex: number;
  actions: ActionRecord[];
  isHandComplete: boolean;
  winners: { playerIndex: number; amount: number; handDescription: string }[];
}

export function cardToString(card: Card): string {
  return `${card.rank}${card.suit}`;
}

export function cardToDisplay(card: Card): string {
  const suitSymbols: Record<Suit, string> = {
    h: "♥",
    d: "♦",
    c: "♣",
    s: "♠",
  };
  const rankDisplay: Record<Rank, string> = {
    "2": "2", "3": "3", "4": "4", "5": "5", "6": "6", "7": "7",
    "8": "8", "9": "9", "T": "10", "J": "J", "Q": "Q", "K": "K", "A": "A",
  };
  return `${rankDisplay[card.rank]}${suitSymbols[card.suit]}`;
}

export const SUIT_COLORS: Record<Suit, string> = {
  h: "red",
  d: "red",
  c: "black",
  s: "black",
};
