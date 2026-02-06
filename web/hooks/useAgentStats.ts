"use client";

import { useRef, useMemo, useEffect } from "react";
import { GameStateData, WinnerData, TrackedAction } from "@/hooks/useGameState";

export interface AgentStats {
  seat: number;
  name: string;
  avatar: string;
  style: string;
  description: string;
  handsPlayed: number;
  handsWon: number;
  winRate: number;
  vpip: number;
  pfr: number;
  aggressionFactor: number;
  totalPnL: number;
  biggestPotWon: number;
  currentChips: number;
  sessionStartChips: number;
  currentStreak: number;
}

interface Accumulator {
  handsPlayed: number;
  handsWon: number;
  preflopVPIP: number;
  preflopPFR: number;
  preflopHands: number;
  raises: number;
  calls: number;
  folds: number;
  totalPnL: number;
  biggestPotWon: number;
  sessionStartChips: number;
  currentChips: number;
  currentStreak: number;
}

function newAccumulator(): Accumulator {
  return {
    handsPlayed: 0, handsWon: 0,
    preflopVPIP: 0, preflopPFR: 0, preflopHands: 0,
    raises: 0, calls: 0, folds: 0,
    totalPnL: 0, biggestPotWon: 0,
    sessionStartChips: 0, currentChips: 0, currentStreak: 0,
  };
}

interface HandTracker {
  vpip: Set<number>;
  pfr: Set<number>;
  active: Set<number>;
}

export function useAgentStats(
  gameState: GameStateData | null,
  handHistory: any[],
  winners: WinnerData[],
  allTimeActionsRef: React.RefObject<TrackedAction[]>,
): Map<number, AgentStats> {
  // Accumulators stored by seat number
  const accRef = useRef<Map<number, Accumulator>>(new Map());
  const lastProcessedRef = useRef(0);
  const handTrackerRef = useRef<HandTracker>({
    vpip: new Set(), pfr: new Set(), active: new Set(),
  });
  const lastHandHistoryLenRef = useRef(0);
  const initializedSeatsRef = useRef<Set<number>>(new Set());
  const tickRef = useRef(0);

  const getAcc = (seat: number): Accumulator => {
    let acc = accRef.current.get(seat);
    if (!acc) {
      acc = newAccumulator();
      accRef.current.set(seat, acc);
    }
    return acc;
  };

  // Initialize session start chips from first game state
  useEffect(() => {
    if (!gameState) return;
    for (const p of gameState.players) {
      if (!initializedSeatsRef.current.has(p.seat)) {
        initializedSeatsRef.current.add(p.seat);
        const acc = getAcc(p.seat);
        acc.sessionStartChips = p.chips;
        acc.currentChips = p.chips;
      }
    }
  }, [gameState]);

  // Process new actions
  useEffect(() => {
    const actions = allTimeActionsRef.current;
    if (!actions) return;

    const start = lastProcessedRef.current;
    if (start >= actions.length) return;

    for (let i = start; i < actions.length; i++) {
      const a = actions[i];

      if (a.seat === -99 && a.action === "new_hand") {
        const tracker = handTrackerRef.current;
        for (const idx of tracker.active) {
          const acc = getAcc(idx);
          acc.preflopHands++;
          if (tracker.vpip.has(idx)) acc.preflopVPIP++;
          if (tracker.pfr.has(idx)) acc.preflopPFR++;
        }
        handTrackerRef.current = { vpip: new Set(), pfr: new Set(), active: new Set() };
        continue;
      }

      if (a.seat < 0 || a.seat >= 8) continue;

      const acc = getAcc(a.seat);
      const act = a.action.toLowerCase();
      if (act === "raise" || act === "all-in") acc.raises++;
      else if (act === "call") acc.calls++;
      else if (act === "fold") acc.folds++;

      if (a.round === "preflop") {
        handTrackerRef.current.active.add(a.seat);
        if (act === "call" || act === "raise" || act === "all-in") {
          handTrackerRef.current.vpip.add(a.seat);
        }
        if (act === "raise" || act === "all-in") {
          handTrackerRef.current.pfr.add(a.seat);
        }
      }
    }

    lastProcessedRef.current = actions.length;
  });

  // Process hand completions
  useEffect(() => {
    if (handHistory.length <= lastHandHistoryLenRef.current) return;

    for (let i = lastHandHistoryLenRef.current; i < handHistory.length; i++) {
      const hand = handHistory[i];
      if (!hand) continue;

      if (hand.players) {
        for (const p of hand.players) {
          const seat = p.seat ?? p.index;
          if (seat >= 0 && seat < 8 && !p.sittingOut) {
            const acc = getAcc(seat);
            acc.handsPlayed++;
            acc.currentChips = p.chips;
          }
        }
      }

      if (hand.winners) {
        const winnerSeats = new Set<number>();
        for (const w of hand.winners) {
          const seat = w.seat ?? w.playerIndex;
          if (seat >= 0 && seat < 8) {
            winnerSeats.add(seat);
            const acc = getAcc(seat);
            acc.handsWon++;
            if (w.amount > acc.biggestPotWon) acc.biggestPotWon = w.amount;
            acc.currentStreak = acc.currentStreak > 0 ? acc.currentStreak + 1 : 1;
          }
        }
        if (hand.players) {
          for (const p of hand.players) {
            const seat = p.seat ?? p.index;
            if (seat >= 0 && seat < 8 && !p.sittingOut && !winnerSeats.has(seat)) {
              const acc = getAcc(seat);
              acc.currentStreak = acc.currentStreak < 0 ? acc.currentStreak - 1 : -1;
            }
          }
        }
      }
    }

    lastHandHistoryLenRef.current = handHistory.length;
    tickRef.current++;
  }, [handHistory.length]);

  // Update current chips
  useEffect(() => {
    if (!gameState) return;
    for (const p of gameState.players) {
      if (p.seat >= 0 && p.seat < 8) {
        getAcc(p.seat).currentChips = p.chips;
      }
    }
  }, [gameState]);

  // Derive stats map
  const stats = useMemo((): Map<number, AgentStats> => {
    void tickRef.current;
    const result = new Map<number, AgentStats>();

    if (!gameState) return result;

    for (const player of gameState.players) {
      const acc = getAcc(player.seat);
      const handsPlayed = acc.handsPlayed || 0;
      const winRate = handsPlayed > 0 ? (acc.handsWon / handsPlayed) * 100 : 0;
      const vpip = acc.preflopHands > 0 ? (acc.preflopVPIP / acc.preflopHands) * 100 : 0;
      const pfr = acc.preflopHands > 0 ? (acc.preflopPFR / acc.preflopHands) * 100 : 0;
      const aggressionFactor = (acc.raises + acc.calls) > 0
        ? acc.raises / (acc.calls || 1)
        : 0;
      const totalPnL = acc.currentChips - acc.sessionStartChips;

      result.set(player.seat, {
        seat: player.seat,
        name: player.name,
        avatar: player.avatar,
        style: player.style,
        description: "",
        handsPlayed,
        handsWon: acc.handsWon,
        winRate,
        vpip,
        pfr,
        aggressionFactor,
        totalPnL,
        biggestPotWon: acc.biggestPotWon,
        currentChips: acc.currentChips,
        sessionStartChips: acc.sessionStartChips,
        currentStreak: acc.currentStreak,
      });
    }

    return result;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [handHistory.length, gameState]);

  return stats;
}
