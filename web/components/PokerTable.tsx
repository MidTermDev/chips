"use client";

import { useState, useRef, useCallback } from "react";
import AgentSeat from "./AgentSeat";
import EmptySeat from "./EmptySeat";
import AgentProfileTooltip from "./AgentProfileTooltip";
import CommunityCards from "./CommunityCards";
import PotDisplay from "./PotDisplay";
import {
  GameStateData, ThinkingData, ActionData, WinnerData, CardData,
} from "@/hooks/useGameState";
import { AgentStats } from "@/hooks/useAgentStats";
import { PoolInfo } from "@/hooks/useStaking";

interface Props {
  gameState: GameStateData;
  thinking: ThinkingData | null;
  actionLog: ActionData[];
  winners: WinnerData[];
  showdown: any;
  agentStats: Map<number, AgentStats>;
  pools: (PoolInfo | null)[];
  onBackAgent: (seat: number) => void;
  onLinkAgent?: () => void;
}

/*
  8 seats. All coordinates kept well inside so nothing
  bleeds into the navbar or sidebar.

        3       4       5
     2                     6
        1       0       7
*/
const SEATS: { x: number; y: number }[] = [
  { x: 50, y: 90 },   // 0 bottom center
  { x: 14, y: 74 },   // 1 bottom-left
  { x: 4,  y: 42 },   // 2 left
  { x: 14, y: 10 },   // 3 top-left
  { x: 50, y: 2  },   // 4 top center
  { x: 86, y: 10 },   // 5 top-right
  { x: 96, y: 42 },   // 6 right
  { x: 86, y: 74 },   // 7 bottom-right
];

export default function PokerTable({
  gameState, thinking, actionLog, winners, showdown,
  agentStats, pools, onBackAgent, onLinkAgent,
}: Props) {
  const lastActions: Record<number, ActionData> = {};
  for (const a of actionLog) lastActions[a.seat] = a;

  const revealedCards: Record<number, CardData[]> = {};
  if (showdown?.players) {
    for (const p of showdown.players) {
      const seat = p.seat ?? p.index;
      revealedCards[seat] = p.holeCards;
    }
  }

  const winnerSet = new Set(winners.map((w) => w.seat));

  // Build a map of seat -> player for quick lookup
  const seatMap = new Map(gameState.players.map(p => [p.seat, p]));

  const [hoveredSeat, setHoveredSeat] = useState<number | null>(null);
  const hoverTimerRef = useRef<NodeJS.Timeout | null>(null);
  const leaveTimerRef = useRef<NodeJS.Timeout | null>(null);

  const handleSeatMouseEnter = useCallback((i: number) => {
    if (leaveTimerRef.current) {
      clearTimeout(leaveTimerRef.current);
      leaveTimerRef.current = null;
    }
    if (hoveredSeat === i) return;
    hoverTimerRef.current = setTimeout(() => {
      setHoveredSeat(i);
    }, 200);
  }, [hoveredSeat]);

  const handleSeatMouseLeave = useCallback(() => {
    if (hoverTimerRef.current) {
      clearTimeout(hoverTimerRef.current);
      hoverTimerRef.current = null;
    }
    leaveTimerRef.current = setTimeout(() => {
      setHoveredSeat(null);
    }, 100);
  }, []);

  const handleTooltipMouseEnter = useCallback(() => {
    if (leaveTimerRef.current) {
      clearTimeout(leaveTimerRef.current);
      leaveTimerRef.current = null;
    }
  }, []);

  const handleTooltipMouseLeave = useCallback(() => {
    leaveTimerRef.current = setTimeout(() => {
      setHoveredSeat(null);
    }, 100);
  }, []);

  return (
    <div style={{ padding: "50px 60px 40px" }}>
      <div style={{ position: "relative", width: "100%", paddingBottom: "54%" }}>

        {/* felt */}
        <div style={{
          position: "absolute", inset: "14% 10%",
          borderRadius: "50%",
          background: "radial-gradient(ellipse at 50% 42%, #1b7340 0%, #15613a 35%, #105030 65%, #0c4226 100%)",
          border: "9px solid #2f2118",
          boxShadow: "inset 0 2px 50px rgba(0,0,0,0.3), 0 0 0 2px #4d3a2a, 0 8px 40px rgba(0,0,0,0.5)",
        }}>
          <div style={{
            position: "absolute", inset: 0,
            display: "flex", flexDirection: "column",
            alignItems: "center", justifyContent: "center", gap: 8,
          }}>
            <CommunityCards cards={gameState.communityCards} round={gameState.bettingRound} />
            <PotDisplay pot={gameState.pot} />
            {onLinkAgent && (
              <button
                onClick={onLinkAgent}
                style={{
                  background: "rgba(0,0,0,0.3)",
                  border: "1px solid rgba(100,100,120,0.2)",
                  borderRadius: 4,
                  padding: "3px 10px",
                  fontSize: 8,
                  fontWeight: 700,
                  textTransform: "uppercase",
                  letterSpacing: 0.5,
                  color: "#4a4a55",
                  cursor: "pointer",
                  transition: "color 0.15s",
                }}
                onMouseEnter={(e) => (e.currentTarget.style.color = "#8a8a95")}
                onMouseLeave={(e) => (e.currentTarget.style.color = "#4a4a55")}
              >
                Link Agent
              </button>
            )}
          </div>
        </div>

        {/* seats - render all 8 positions */}
        {SEATS.map((pos, seatIdx) => {
          const player = seatMap.get(seatIdx);
          const stats = agentStats.get(seatIdx);

          return (
            <div
              key={seatIdx}
              style={{
                position: "absolute",
                left: `${pos.x}%`,
                top: `${pos.y}%`,
                transform: "translate(-50%, -50%)",
                zIndex: hoveredSeat === seatIdx ? 50 : thinking?.seat === seatIdx ? 10 : 1,
              }}
            >
              {player && !player.sittingOut ? (
                <>
                  <AgentSeat
                    player={player}
                    isActive={gameState.activeSeat === seatIdx}
                    isDealer={gameState.dealerSeat === seatIdx}
                    isSB={gameState.smallBlindSeat === seatIdx}
                    isBB={gameState.bigBlindSeat === seatIdx}
                    isThinking={thinking?.seat === seatIdx}
                    lastAction={lastActions[seatIdx]}
                    revealedCards={revealedCards[seatIdx]}
                    isWinner={winnerSet.has(seatIdx)}
                    onMouseEnter={() => handleSeatMouseEnter(seatIdx)}
                    onMouseLeave={handleSeatMouseLeave}
                  />
                  {hoveredSeat === seatIdx && stats && (
                    <AgentProfileTooltip
                      player={player}
                      stats={stats}
                      pool={pools[seatIdx]}
                      seatIndex={seatIdx}
                      onBackClick={() => {
                        setHoveredSeat(null);
                        onBackAgent(seatIdx);
                      }}
                      onMouseEnter={handleTooltipMouseEnter}
                      onMouseLeave={handleTooltipMouseLeave}
                    />
                  )}
                </>
              ) : (
                <EmptySeat seatNumber={seatIdx} />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
