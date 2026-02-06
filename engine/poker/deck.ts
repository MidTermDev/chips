import { Card, Rank, Suit } from "./types";

const RANKS: Rank[] = ["2", "3", "4", "5", "6", "7", "8", "9", "T", "J", "Q", "K", "A"];
const SUITS: Suit[] = ["h", "d", "c", "s"];

export class Deck {
  private cards: Card[] = [];
  private index: number = 0;

  constructor() {
    this.reset();
  }

  reset(): void {
    this.cards = [];
    for (const suit of SUITS) {
      for (const rank of RANKS) {
        this.cards.push({ rank, suit });
      }
    }
    this.shuffle();
    this.index = 0;
  }

  /** Fisher-Yates shuffle */
  private shuffle(): void {
    for (let i = this.cards.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [this.cards[i], this.cards[j]] = [this.cards[j], this.cards[i]];
    }
  }

  deal(count: number = 1): Card[] {
    const dealt = this.cards.slice(this.index, this.index + count);
    this.index += count;
    return dealt;
  }

  dealOne(): Card {
    return this.deal(1)[0];
  }

  remaining(): number {
    return this.cards.length - this.index;
  }
}
