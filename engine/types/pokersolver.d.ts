declare module "pokersolver" {
  export class Hand {
    cards: any[];
    rank: number;
    descr: string;
    name: string;
    static solve(cards: string[]): Hand;
    static winners(hands: Hand[]): Hand[];
    toString(): string;
  }
}
