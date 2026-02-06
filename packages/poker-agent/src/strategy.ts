import { DecisionContext, PokerDecision, CardData, ValidAction } from "./types";

/**
 * Configuration for the built-in poker strategy.
 * All values 0–1. Defaults produce a solid TAG (tight-aggressive) style.
 */
export interface StrategyConfig {
  /** How often to raise vs call when you have a playable hand. 0 = passive, 1 = ultra-aggressive. Default 0.5 */
  aggression?: number;
  /** How selective with starting hands. 0 = play everything, 1 = only premiums. Default 0.5 */
  tightness?: number;
  /** How often to bluff (bet/raise with weak hands). 0 = never, 1 = always. Default 0.15 */
  bluffFrequency?: number;
  /** Adjust play based on table position. Default true */
  positionAware?: boolean;
}

const DEFAULTS: Required<StrategyConfig> = {
  aggression: 0.5,
  tightness: 0.5,
  bluffFrequency: 0.15,
  positionAware: true,
};

/**
 * Create a configurable rules-based poker strategy.
 * Returns a decision function compatible with PokerAgentClient's onDecision callback.
 *
 * @example
 * ```ts
 * import { PokerAgentClient, createStrategy } from "@chips-arena/poker-agent";
 *
 * const client = new PokerAgentClient({
 *   serverUrl: "wss://server.chips.rip",
 *   apiKey: process.env.CHIPS_API_KEY!,
 *   onDecision: createStrategy({ aggression: 0.7, tightness: 0.4 }),
 * });
 * client.connect();
 * ```
 */
export function createStrategy(config?: StrategyConfig): (ctx: DecisionContext) => Promise<PokerDecision> {
  const cfg = { ...DEFAULTS, ...config };

  return async (ctx: DecisionContext): Promise<PokerDecision> => {
    const { validActions, toCall, yourChips, holeCards, communityCards, pot, potOdds, bettingRound, position, players } = ctx;

    const canCheck = findAction(validActions, "check");
    const canCall = findAction(validActions, "call");
    const canRaise = findAction(validActions, "raise");
    const canAllIn = findAction(validActions, "all-in");

    const handStrength = evaluateStrength(holeCards, communityCards, bettingRound);
    const positionBonus = cfg.positionAware ? getPositionBonus(position) : 0;
    const effectiveStrength = Math.min(1, handStrength + positionBonus);

    // Threshold to play: higher tightness = higher bar
    const playThreshold = 0.2 + cfg.tightness * 0.35;
    // Threshold to raise: based on aggression
    const raiseThreshold = playThreshold + (1 - cfg.aggression) * 0.2;

    const activePlayers = players.filter(p => !p.folded && !p.sittingOut).length;
    const callRatio = yourChips > 0 ? toCall / yourChips : 1;

    // ─── Free to play (no bet to match) ───────────────────
    if (canCheck) {
      // Bluff raise
      if (canRaise && roll(cfg.bluffFrequency * 0.5)) {
        return raise(canRaise, "raise", 0.5, "Bluff raise");
      }
      // Value raise with strong hand
      if (canRaise && effectiveStrength >= raiseThreshold) {
        const sizeFactor = 0.4 + cfg.aggression * 0.4;
        return raise(canRaise, "raise", sizeFactor, `Raising strong hand (${describeStrength(handStrength)})`);
      }
      return { action: "check", reasoning: "Check in position" };
    }

    // ─── Facing a bet ─────────────────────────────────────
    const potOddsThreshold = potOdds ?? 0.5;

    // Premium hands: raise or re-raise
    if (effectiveStrength >= 0.8) {
      if (canRaise && roll(0.5 + cfg.aggression * 0.4)) {
        return raise(canRaise, "raise", 0.5 + cfg.aggression * 0.3, `Re-raising premium (${describeStrength(handStrength)})`);
      }
      if (canAllIn && callRatio > 0.6 && effectiveStrength >= 0.9) {
        return { action: "all-in", reasoning: `All-in with monster (${describeStrength(handStrength)})` };
      }
      if (canCall) return { action: "call", reasoning: `Calling with premium (${describeStrength(handStrength)})` };
    }

    // Good hands: call or raise depending on odds
    if (effectiveStrength >= playThreshold) {
      // Cheap to call
      if (canCall && callRatio < 0.1) {
        return { action: "call", reasoning: "Cheap call with decent hand" };
      }
      // Pot odds favor calling
      if (canCall && effectiveStrength > potOddsThreshold) {
        if (canRaise && roll(cfg.aggression * 0.3)) {
          return raise(canRaise, "raise", 0.4, `Semi-bluff raise (${describeStrength(handStrength)})`);
        }
        return { action: "call", reasoning: `Calling, equity ${(effectiveStrength * 100).toFixed(0)}% vs pot odds ${(potOddsThreshold * 100).toFixed(0)}%` };
      }
      // Medium cost: still call with pairs+
      if (canCall && callRatio < 0.25 && handStrength >= 0.5) {
        return { action: "call", reasoning: "Medium call with made hand" };
      }
    }

    // Bluff: occasionally raise with weak hands when facing small bets
    if (canRaise && callRatio < 0.15 && activePlayers <= 3 && roll(cfg.bluffFrequency)) {
      return raise(canRaise, "raise", 0.4, "Bluff raise (small bet, few players)");
    }

    // Cheap to call: do it with anything marginal
    if (canCall && callRatio < 0.05) {
      return { action: "call", reasoning: "Very cheap call" };
    }

    return { action: "fold", reasoning: `Folding weak hand (strength ${(handStrength * 100).toFixed(0)}%)` };
  };
}

// ─── Hand Evaluation ──────────────────────────────────────────

function evaluateStrength(holeCards: CardData[], communityCards: CardData[], round: string): number {
  if (round === "preflop") {
    return preflopStrength(holeCards);
  }
  return postflopStrength(holeCards, communityCards);
}

/** Preflop hand strength: simplified Chen-like formula, normalized 0-1 */
function preflopStrength(cards: CardData[]): number {
  if (cards.length < 2) return 0.3;

  const r1 = rankValue(cards[0].rank);
  const r2 = rankValue(cards[1].rank);
  const high = Math.max(r1, r2);
  const low = Math.min(r1, r2);
  const suited = cards[0].suit === cards[1].suit;
  const paired = r1 === r2;
  const gap = high - low;
  const connected = gap <= 1;

  // Score 0-20, then normalize
  let score = high; // Base: high card value (2-14)

  if (paired) {
    score = Math.max(score * 2, 5); // Pairs are strong
    if (high >= 10) score += 4; // Big pairs
  } else {
    if (suited) score += 2;
    if (connected) score += 1;
    if (gap <= 2) score += 0.5;

    // Penalty for big gaps
    if (gap >= 5) score -= 1;
    if (gap >= 4) score -= 0.5;
  }

  // Bonus for both high cards
  if (high >= 13 && low >= 10) score += 3; // Both broadway
  if (high === 14 && low >= 10) score += 2; // Ace + broadway

  return clamp(score / 30);
}

/** Postflop hand strength: check for pairs, two pair, trips, flush/straight draws */
function postflopStrength(holeCards: CardData[], communityCards: CardData[]): number {
  if (holeCards.length < 2) return 0.3;

  const allCards = [...holeCards, ...communityCards];
  const holeRanks = holeCards.map(c => rankValue(c.rank));
  const boardRanks = communityCards.map(c => rankValue(c.rank));
  const allRanks = allCards.map(c => rankValue(c.rank));
  const allSuits = allCards.map(c => c.suit);

  let score = 0;

  // ─── Made hands ─────────────────────
  const rankCounts = countValues(allRanks);
  const maxCount = Math.max(...Object.values(rankCounts));

  // Check if hole cards contribute to the best combination
  const holePaired = holeRanks[0] === holeRanks[1];
  const pairWithBoard = holeRanks.some(r => boardRanks.includes(r));
  const topBoardRank = boardRanks.length > 0 ? Math.max(...boardRanks) : 0;

  if (maxCount >= 4) {
    score = 0.95; // Quads
  } else if (maxCount === 3 && Object.values(rankCounts).filter(c => c >= 2).length >= 2) {
    score = 0.9; // Full house
  } else if (maxCount === 3) {
    score = holePaired ? 0.82 : pairWithBoard ? 0.78 : 0.55; // Trips
  } else if (Object.values(rankCounts).filter(c => c >= 2).length >= 2) {
    score = pairWithBoard ? 0.7 : holePaired ? 0.65 : 0.45; // Two pair
  } else if (maxCount === 2) {
    if (holePaired) {
      score = holeRanks[0] > topBoardRank ? 0.6 : 0.45; // Overpair vs underpair
    } else if (pairWithBoard) {
      const pairedRank = holeRanks.find(r => boardRanks.includes(r)) || 0;
      score = pairedRank === topBoardRank ? 0.55 : 0.4; // Top pair vs lower pair
    } else {
      score = 0.25; // Board pair, no connection
    }
  } else {
    // High card only
    const highHole = Math.max(...holeRanks);
    score = 0.1 + (highHole / 14) * 0.15;
  }

  // ─── Draws ──────────────────────────
  // Flush draw
  const suitCounts = countStringValues(allSuits);
  const maxSuitCount = Math.max(...Object.values(suitCounts));
  if (maxSuitCount >= 5) {
    score = Math.max(score, 0.75); // Made flush
  } else if (maxSuitCount === 4) {
    const holeSuit = holeCards.find(c => suitCounts[c.suit] === 4);
    if (holeSuit) score = Math.max(score, score + 0.12); // Flush draw
  }

  // Straight check (simplified)
  const uniqueRanks = [...new Set(allRanks)].sort((a, b) => a - b);
  const longestRun = longestConsecutive(uniqueRanks);
  if (longestRun >= 5) {
    score = Math.max(score, 0.8); // Made straight
  } else if (longestRun === 4) {
    score = Math.max(score, score + 0.1); // Open-ended straight draw
  }

  return clamp(score);
}

// ─── Helpers ──────────────────────────────────────────────────

function rankValue(rank: string): number {
  const map: Record<string, number> = {
    "2": 2, "3": 3, "4": 4, "5": 5, "6": 6, "7": 7, "8": 8,
    "9": 9, "T": 10, "J": 11, "Q": 12, "K": 13, "A": 14, "10": 10,
  };
  return map[rank] || 0;
}

function countValues(arr: number[]): Record<number, number> {
  const counts: Record<number, number> = {};
  for (const v of arr) counts[v] = (counts[v] || 0) + 1;
  return counts;
}

function countStringValues(arr: string[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const v of arr) counts[v] = (counts[v] || 0) + 1;
  return counts;
}

function longestConsecutive(sorted: number[]): number {
  if (sorted.length === 0) return 0;
  let max = 1, run = 1;
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i] === sorted[i - 1] + 1) {
      run++;
      max = Math.max(max, run);
    } else {
      run = 1;
    }
  }
  // Check ace-low straight (A-2-3-4-5)
  if (sorted.includes(14) && sorted.includes(2)) {
    let aceRun = 1;
    for (let i = 1; i < sorted.length && sorted[i] <= 5; i++) {
      if (sorted[i] === sorted[i - 1] + 1) aceRun++;
    }
    max = Math.max(max, aceRun + 1);
  }
  return max;
}

function getPositionBonus(position: string): number {
  switch (position) {
    case "BTN": return 0.08;
    case "CO": return 0.05;
    case "HJ": return 0.02;
    case "MP": return 0;
    case "EP": return -0.03;
    case "SB": return -0.02;
    case "BB": return -0.01;
    default: return 0;
  }
}

function describeStrength(s: number): string {
  if (s >= 0.85) return "monster";
  if (s >= 0.7) return "very strong";
  if (s >= 0.55) return "strong";
  if (s >= 0.4) return "decent";
  if (s >= 0.25) return "marginal";
  return "weak";
}

function findAction(actions: ValidAction[], name: string): ValidAction | undefined {
  return actions.find(a => a.action === name);
}

function raise(spec: ValidAction, action: "raise", sizeFactor: number, reasoning: string): PokerDecision {
  const min = spec.minAmount || 0;
  const max = spec.maxAmount || min;
  const amount = Math.round(min + (max - min) * clamp(sizeFactor));
  return { action, amount, reasoning };
}

function roll(probability: number): boolean {
  return Math.random() < probability;
}

function clamp(v: number, lo = 0, hi = 1): number {
  return Math.max(lo, Math.min(hi, v));
}
