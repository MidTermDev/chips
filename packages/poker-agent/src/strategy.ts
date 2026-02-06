import { DecisionContext, PokerDecision, CardData, ValidAction } from "./types";

/**
 * Configuration for the built-in poker strategy.
 * All values 0–1. Defaults produce a solid TAG (tight-aggressive) style.
 */
export interface StrategyConfig {
  /** How often to raise vs call when you have a playable hand. 0 = passive, 1 = ultra-aggressive. Default 0.6 */
  aggression?: number;
  /** How selective with starting hands. 0 = play everything, 1 = only premiums. Default 0.5 */
  tightness?: number;
  /** How often to bluff (bet/raise with weak hands). 0 = never, 1 = always. Default 0.15 */
  bluffFrequency?: number;
  /** Adjust play based on table position. Default true */
  positionAware?: boolean;
}

const DEFAULTS: Required<StrategyConfig> = {
  aggression: 0.6,
  tightness: 0.5,
  bluffFrequency: 0.15,
  positionAware: true,
};

/**
 * Create a configurable rules-based poker strategy.
 * Returns a decision function compatible with PokerAgentClient's onDecision callback.
 */
export function createStrategy(config?: StrategyConfig): (ctx: DecisionContext) => Promise<PokerDecision> {
  const cfg = { ...DEFAULTS, ...config };

  // Track whether we were the pre-flop aggressor (for c-betting)
  let wasPreFlopRaiser = false;

  return async (ctx: DecisionContext): Promise<PokerDecision> => {
    const { validActions, toCall, yourChips, holeCards, communityCards, pot, potOdds, bettingRound, position, players } = ctx;

    const canCheck = findAction(validActions, "check");
    const canCall = findAction(validActions, "call");
    const canRaise = findAction(validActions, "raise");
    const canAllIn = findAction(validActions, "all-in");

    const handStrength = evaluateStrength(holeCards, communityCards, bettingRound);
    const positionBonus = cfg.positionAware ? getPositionBonus(position) : 0;
    const effectiveStrength = Math.min(1, handStrength + positionBonus);
    const activePlayers = players.filter(p => !p.folded && !p.sittingOut).length;
    const callRatio = yourChips > 0 ? toCall / yourChips : 1;

    // Tighten up with more players (multiway pots need stronger hands)
    const multiplayerPenalty = Math.max(0, (activePlayers - 2) * 0.04);

    // ─── PREFLOP ──────────────────────────────────────────────
    if (bettingRound === "preflop") {
      wasPreFlopRaiser = false;
      const pfStrength = handStrength;

      // Fold threshold: tighter = higher bar to enter a pot
      const foldThreshold = 0.25 + cfg.tightness * 0.2 + multiplayerPenalty;

      // Facing a raise preflop
      if (toCall > 0) {
        // Junk hands: fold
        if (pfStrength < foldThreshold) {
          // Occasionally defend BB with marginal hands
          if (position === "BB" && callRatio < 0.06 && roll(0.3)) {
            return { action: "call", reasoning: "BB defense with marginal hand" };
          }
          return { action: "fold", reasoning: `Folding preflop (${(pfStrength * 100).toFixed(0)}% strength)` };
        }

        // Premium: 3-bet / re-raise
        if (pfStrength >= 0.7 && canRaise && roll(0.5 + cfg.aggression * 0.4)) {
          wasPreFlopRaiser = true;
          return raise(canRaise, "raise", 0.3 + cfg.aggression * 0.2, `3-betting premium (${describeStrength(pfStrength)})`);
        }

        // Monster: shove if deep in action
        if (pfStrength >= 0.85 && canAllIn && callRatio > 0.3) {
          wasPreFlopRaiser = true;
          return { action: "all-in", reasoning: `All-in with monster (${describeStrength(pfStrength)})` };
        }

        // Decent hands: call
        if (canCall) {
          // Big raises with medium hands — fold more often
          if (callRatio > 0.2 && pfStrength < 0.55) {
            return { action: "fold", reasoning: "Big raise, not strong enough to continue" };
          }
          return { action: "call", reasoning: `Calling preflop (${describeStrength(pfStrength)})` };
        }
      }

      // No bet to match (BB or limped to us)
      if (canCheck) {
        // Strong hand: raise for value
        if (canRaise && pfStrength >= 0.45 + (1 - cfg.aggression) * 0.15) {
          wasPreFlopRaiser = true;
          const sizing = 0.2 + cfg.aggression * 0.3;
          return raise(canRaise, "raise", sizing, `Open raising (${describeStrength(pfStrength)})`);
        }
        // Occasional steal from late position
        if (canRaise && cfg.positionAware && (position === "BTN" || position === "CO") && roll(cfg.aggression * 0.4)) {
          wasPreFlopRaiser = true;
          return raise(canRaise, "raise", 0.15, "Position steal");
        }
        return { action: "check", reasoning: "Checking from BB" };
      }

      // Default fold (shouldn't reach here often)
      return { action: "fold", reasoning: "Folding weak preflop hand" };
    }

    // ─── POSTFLOP ─────────────────────────────────────────────

    const potCommitRatio = yourChips > 0 ? pot / yourChips : 0;

    // ── No bet to face (we can check or bet) ──
    if (canCheck) {
      // C-bet: if we were the preflop raiser, bet the flop ~60-80% of the time
      if (wasPreFlopRaiser && bettingRound === "flop" && canRaise) {
        const cbetFreq = 0.5 + cfg.aggression * 0.3;
        if (effectiveStrength >= 0.3 && roll(cbetFreq)) {
          const sizing = 0.3 + cfg.aggression * 0.2;
          return raise(canRaise, "raise", sizing, `Continuation bet (${describeStrength(handStrength)})`);
        }
        // Even with air, c-bet sometimes
        if (roll(cfg.bluffFrequency * 0.8)) {
          return raise(canRaise, "raise", 0.2, "C-bet bluff");
        }
      }

      // Strong hand: bet for value
      if (canRaise && effectiveStrength >= 0.6) {
        const sizing = 0.3 + cfg.aggression * 0.35 + (effectiveStrength - 0.6) * 0.3;
        return raise(canRaise, "raise", sizing, `Value bet (${describeStrength(handStrength)})`);
      }

      // Medium hand: bet sometimes for protection/thin value
      if (canRaise && effectiveStrength >= 0.4 && roll(cfg.aggression * 0.5)) {
        return raise(canRaise, "raise", 0.2 + cfg.aggression * 0.15, `Bet for protection (${describeStrength(handStrength)})`);
      }

      // Draws: semi-bluff
      if (canRaise && effectiveStrength >= 0.35 && effectiveStrength < 0.5 && roll(cfg.aggression * 0.35)) {
        return raise(canRaise, "raise", 0.25, `Semi-bluff (${describeStrength(handStrength)})`);
      }

      // Pure bluff: occasionally with nothing
      if (canRaise && activePlayers <= 3 && roll(cfg.bluffFrequency * 0.4)) {
        return raise(canRaise, "raise", 0.2 + Math.random() * 0.15, "Bluff bet");
      }

      return { action: "check", reasoning: `Check (${describeStrength(handStrength)})` };
    }

    // ── Facing a bet postflop ──
    const facingBetStrength = effectiveStrength - multiplayerPenalty;

    // Monster: raise/re-raise
    if (facingBetStrength >= 0.75) {
      if (canRaise && roll(0.4 + cfg.aggression * 0.5)) {
        const sizing = 0.4 + cfg.aggression * 0.3;
        return raise(canRaise, "raise", sizing, `Raising strong hand (${describeStrength(handStrength)})`);
      }
      if (canAllIn && facingBetStrength >= 0.88 && (callRatio > 0.4 || potCommitRatio > 1.5)) {
        return { action: "all-in", reasoning: `All-in with monster (${describeStrength(handStrength)})` };
      }
      if (canCall) return { action: "call", reasoning: `Slow-playing strong hand (${describeStrength(handStrength)})` };
    }

    // Good hand: call or raise
    if (facingBetStrength >= 0.5) {
      // Raise for value sometimes
      if (canRaise && roll(cfg.aggression * 0.3)) {
        return raise(canRaise, "raise", 0.3, `Raise for value (${describeStrength(handStrength)})`);
      }
      if (canCall) return { action: "call", reasoning: `Calling with ${describeStrength(handStrength)} hand` };
    }

    // Marginal hand: call small bets, fold to big ones
    if (facingBetStrength >= 0.35) {
      if (canCall && callRatio < 0.12) {
        return { action: "call", reasoning: `Floating with ${describeStrength(handStrength)} hand` };
      }
      // Drawing hand: call if good pot odds
      if (canCall && callRatio < 0.2 && (potOdds ?? 1) < effectiveStrength) {
        return { action: "call", reasoning: `Calling draw, pot odds ${((potOdds ?? 0) * 100).toFixed(0)}%` };
      }
      return { action: "fold", reasoning: `Folding marginal to big bet (${(callRatio * 100).toFixed(0)}% of stack)` };
    }

    // Bluff raise: occasionally with nothing against small bets
    if (canRaise && callRatio < 0.1 && activePlayers <= 2 && roll(cfg.bluffFrequency)) {
      return raise(canRaise, "raise", 0.35, "Bluff raise");
    }

    // Weak hand: fold
    return { action: "fold", reasoning: `Folding ${describeStrength(handStrength)} hand` };
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

  let score = high; // Base: high card value (2-14)

  if (paired) {
    score = Math.max(score * 2, 5);
    if (high >= 10) score += 4;
  } else {
    if (suited) score += 2;
    if (connected) score += 1;
    if (gap <= 2) score += 0.5;
    if (gap >= 5) score -= 1;
    if (gap >= 4) score -= 0.5;
  }

  if (high >= 13 && low >= 10) score += 3;
  if (high === 14 && low >= 10) score += 2;

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

  const rankCounts = countValues(allRanks);
  const maxCount = Math.max(...Object.values(rankCounts));

  const holePaired = holeRanks[0] === holeRanks[1];
  const pairWithBoard = holeRanks.some(r => boardRanks.includes(r));
  const topBoardRank = boardRanks.length > 0 ? Math.max(...boardRanks) : 0;

  if (maxCount >= 4) {
    score = 0.95;
  } else if (maxCount === 3 && Object.values(rankCounts).filter(c => c >= 2).length >= 2) {
    score = 0.9;
  } else if (maxCount === 3) {
    score = holePaired ? 0.82 : pairWithBoard ? 0.78 : 0.55;
  } else if (Object.values(rankCounts).filter(c => c >= 2).length >= 2) {
    score = pairWithBoard ? 0.7 : holePaired ? 0.65 : 0.45;
  } else if (maxCount === 2) {
    if (holePaired) {
      score = holeRanks[0] > topBoardRank ? 0.6 : 0.45;
    } else if (pairWithBoard) {
      const pairedRank = holeRanks.find(r => boardRanks.includes(r)) || 0;
      score = pairedRank === topBoardRank ? 0.55 : 0.4;
    } else {
      score = 0.2; // Board pair, no connection — weaker
    }
  } else {
    // High card only — basically nothing post-flop
    const highHole = Math.max(...holeRanks);
    score = 0.08 + (highHole / 14) * 0.12;
  }

  // ─── Draws ──────────────────────────
  const suitCounts = countStringValues(allSuits);
  const maxSuitCount = Math.max(...Object.values(suitCounts));
  if (maxSuitCount >= 5) {
    score = Math.max(score, 0.78);
  } else if (maxSuitCount === 4) {
    const holeSuit = holeCards.find(c => suitCounts[c.suit] === 4);
    if (holeSuit) score = Math.max(score, score + 0.15);
  }

  const uniqueRanks = [...new Set(allRanks)].sort((a, b) => a - b);
  const longestRun = longestConsecutive(uniqueRanks);
  if (longestRun >= 5) {
    score = Math.max(score, 0.82);
  } else if (longestRun === 4) {
    score = Math.max(score, score + 0.12);
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
  // Add some randomness to bet sizing so it's not always the same
  const jitter = (Math.random() - 0.5) * 0.1;
  const amount = Math.round(min + (max - min) * clamp(sizeFactor + jitter));
  return { action, amount, reasoning };
}

function roll(probability: number): boolean {
  return Math.random() < probability;
}

function clamp(v: number, lo = 0, hi = 1): number {
  return Math.max(lo, Math.min(hi, v));
}
