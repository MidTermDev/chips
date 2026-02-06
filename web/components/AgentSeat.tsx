"use client";

import Card from "./Card";
import AgentAvatar from "./AgentAvatar";
import { PlayerData, CardData } from "@/hooks/useGameState";

interface Props {
  player: PlayerData;
  isActive: boolean;
  isDealer: boolean;
  isSB: boolean;
  isBB: boolean;
  isThinking: boolean;
  lastAction?: { action: string; amount: number };
  revealedCards?: CardData[];
  isWinner: boolean;
  hasBacking?: boolean;
  onBack?: () => void;
  onMouseEnter?: () => void;
  onMouseLeave?: () => void;
}

const ACTION_STYLE: Record<string, { bg: string; fg: string }> = {
  fold:    { bg: "#374151", fg: "#9ca3af" },
  check:   { bg: "#065f46", fg: "#6ee7b7" },
  call:    { bg: "#1e3a5f", fg: "#7dd3fc" },
  raise:   { bg: "#78350f", fg: "#fbbf24" },
  "all-in":{ bg: "#7f1d1d", fg: "#fca5a5" },
};

export default function AgentSeat({
  player, isActive, isDealer, isSB, isBB,
  isThinking, lastAction, revealedCards, isWinner,
  hasBacking, onBack, onMouseEnter, onMouseLeave,
}: Props) {
  const unfunded = player.sittingOut && (player.chips ?? 0) === 0;
  const dimmed = player.folded || unfunded;

  return (
    <div
      className={isActive && !dimmed ? "ring-active" : ""}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      style={{
        display: "flex", flexDirection: "column", alignItems: "center",
        gap: 3, padding: "8px 10px", borderRadius: 12, minWidth: 108,
        background: isWinner
          ? "rgba(212,168,67,0.08)"
          : "transparent",
        border: isWinner
          ? "1px solid rgba(212,168,67,0.25)"
          : "1px solid transparent",
        opacity: dimmed ? 0.35 : 1,
        transition: "opacity 0.3s, background 0.3s",
        position: "relative",
      }}
    >
      {/* position chip */}
      {(isDealer || isSB || isBB) && (
        <div style={{
          position: "absolute", top: -8, right: -4,
          width: 22, height: 22, borderRadius: "50%",
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 9, fontWeight: 700, lineHeight: 1,
          background: isDealer ? "#d4a843" : isSB ? "#3b82f6" : "#8b5cf6",
          color: isDealer ? "#1a1a1a" : "#fff",
          border: "2px solid #0c0c14",
        }}>
          {isDealer ? "D" : isSB ? "SB" : "BB"}
        </div>
      )}

      {/* avatar + name + style */}
      <AgentAvatar monogram={player.avatar || player.name.slice(0, 2).toUpperCase()} index={player.seat} size={36} />
      <div style={{ textAlign: "center", lineHeight: 1.2 }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: "#fff" }}>
          {player.name}
        </div>
        <div style={{ fontSize: 9, color: "#666", fontWeight: 500 }}>
          {player.style}
        </div>
      </div>

      {/* cards */}
      <div style={{ display: "flex", gap: 3, margin: "2px 0" }}>
        {revealedCards && revealedCards.length > 0 ? (
          revealedCards.map((c, i) => <Card key={i} card={c} size="sm" animate />)
        ) : player.hasCards && !player.folded ? (
          <>
            <Card faceDown size="sm" />
            <Card faceDown size="sm" />
          </>
        ) : (
          <div style={{ height: 46 }} /> /* preserve layout */
        )}
      </div>

      {/* chips */}
      <div style={{
        fontSize: 12, fontWeight: 600,
        color: (player.chips ?? 0) === 0 ? "#4a4a55" : "#d4a843",
        fontVariantNumeric: "tabular-nums",
      }}>
        {(player.chips ?? 0) === 0 ? (
          <span style={{ fontSize: 9, color: "#5a5040", fontWeight: 500 }}>Needs Backing</span>
        ) : (
          (player.chips ?? 0).toLocaleString()
        )}
      </div>

      {/* current round bet */}
      {(player.bet ?? 0) > 0 && (
        <div style={{
          fontSize: 9, color: "#94a3b8", fontWeight: 500,
          background: "rgba(0,0,0,0.3)", borderRadius: 4, padding: "1px 6px",
        }}>
          bet {(player.bet ?? 0).toLocaleString()}
        </div>
      )}

      {/* thinking */}
      {isThinking && (
        <div style={{ fontSize: 10, color: "#67e8f9", fontWeight: 500 }}>
          <span className="dots">Thinking</span>
        </div>
      )}

      {/* last action badge */}
      {lastAction && !isThinking && (
        <div style={{
          fontSize: 9, fontWeight: 700, textTransform: "uppercase",
          letterSpacing: 0.5, borderRadius: 4, padding: "2px 8px",
          background: ACTION_STYLE[lastAction.action]?.bg || "#374151",
          color: ACTION_STYLE[lastAction.action]?.fg || "#9ca3af",
        }}>
          {lastAction.action}
          {lastAction.amount > 0 ? ` ${(lastAction.amount ?? 0).toLocaleString()}` : ""}
        </div>
      )}

      {/* all-in tag */}
      {player.allIn && !isThinking && (
        <div style={{
          fontSize: 9, fontWeight: 800, color: "#f87171",
          textTransform: "uppercase", letterSpacing: 1,
        }}>
          All-In
        </div>
      )}

      {/* winner tag */}
      {isWinner && (
        <div style={{
          fontSize: 10, fontWeight: 800, color: "#d4a843",
          textTransform: "uppercase", letterSpacing: 0.5,
        }}>
          Winner
        </div>
      )}

      {/* back badge */}
      {!dimmed && !isThinking && onBack && (
        <button
          onClick={(e) => { e.stopPropagation(); onBack(); }}
          style={{
            position: "absolute", bottom: -6, right: -4,
            fontSize: 7, fontWeight: 700,
            textTransform: "uppercase", letterSpacing: 0.3,
            padding: "2px 6px", borderRadius: 4,
            background: hasBacking ? "rgba(30,92,58,0.2)" : "rgba(100,100,120,0.15)",
            color: hasBacking ? "#34d399" : "#4a4a55",
            border: hasBacking ? "1px solid rgba(30,92,58,0.3)" : "1px solid rgba(100,100,120,0.2)",
            cursor: "pointer",
          }}
        >
          {hasBacking ? "Backed" : "Back"}
        </button>
      )}
    </div>
  );
}
