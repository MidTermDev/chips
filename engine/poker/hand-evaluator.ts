import { Hand } from "pokersolver";
import { Card, cardToString } from "./types";

/** Convert our card format to pokersolver format (e.g., "Ah", "Td") */
function toPokersolverCard(card: Card): string {
  return cardToString(card);
}

export interface HandResult {
  playerIndex: number;
  rank: number;
  description: string;
  cards: string;
}

/**
 * Evaluate hands for multiple players given community cards.
 * Returns results sorted best-to-worst, with ties having the same rank.
 */
export function evaluateHands(
  playerHands: { playerIndex: number; holeCards: Card[] }[],
  communityCards: Card[]
): HandResult[] {
  const communityStrs = communityCards.map(toPokersolverCard);

  const results = playerHands.map(({ playerIndex, holeCards }) => {
    const holeStrs = holeCards.map(toPokersolverCard);
    const allCards = [...holeStrs, ...communityStrs];
    const solved = Hand.solve(allCards);
    return {
      playerIndex,
      hand: solved,
      description: solved.descr,
      cards: solved.cards.map((c: any) => c.toString()).join(", "),
    };
  });

  // Use pokersolver's winner detection for proper ranking
  const hands = results.map((r) => r.hand);
  const winners = Hand.winners(hands);

  // Assign ranks: winners get rank 0, then sort remaining
  return results
    .map((r) => ({
      playerIndex: r.playerIndex,
      rank: winners.includes(r.hand) ? 0 : r.hand.rank,
      description: r.description,
      cards: r.cards,
    }))
    .sort((a, b) => a.rank - b.rank);
}

/**
 * Find all winners (may be multiple in case of a split pot).
 */
export function findWinners(
  playerHands: { playerIndex: number; holeCards: Card[] }[],
  communityCards: Card[]
): HandResult[] {
  const results = evaluateHands(playerHands, communityCards);
  const bestRank = results[0]?.rank;
  return results.filter((r) => r.rank === bestRank);
}
