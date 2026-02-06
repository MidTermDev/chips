"use client";

import { AgentStats } from "@/hooks/useAgentStats";
import { PoolInfo } from "@/hooks/useStaking";
import { PlayerData } from "@/hooks/useGameState";
import AgentAvatar from "./AgentAvatar";

interface Props {
  player: PlayerData;
  stats: AgentStats;
  pool: PoolInfo | null;
  seatIndex: number;
  onBackClick: () => void;
  onMouseEnter: () => void;
  onMouseLeave: () => void;
}

const DECIMALS = 1e6;

function formatNum(n: number): string {
  if (Math.abs(n) >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (Math.abs(n) >= 1_000) return `${(n / 1_000).toFixed(0)}K`;
  return n.toLocaleString();
}

function streakLabel(streak: number): string {
  if (streak > 0) return `${streak}W`;
  if (streak < 0) return `${Math.abs(streak)}L`;
  return "-";
}

export default function AgentProfileTooltip({
  player, stats, pool, seatIndex, onBackClick, onMouseEnter, onMouseLeave,
}: Props) {
  // Determine positioning based on seat index
  const posStyle: React.CSSProperties = (() => {
    if (seatIndex === 1 || seatIndex === 2 || seatIndex === 3) {
      return { left: "calc(100% + 12px)", top: "50%", transform: "translateY(-50%)" };
    }
    if (seatIndex === 5 || seatIndex === 6 || seatIndex === 7) {
      return { right: "calc(100% + 12px)", top: "50%", transform: "translateY(-50%)" };
    }
    if (seatIndex === 4) {
      return { top: "calc(100% + 12px)", left: "50%", transform: "translateX(-50%)" };
    }
    return { bottom: "calc(100% + 12px)", left: "50%", transform: "translateX(-50%)" };
  })();

  const poolSize = pool ? pool.totalAssets / DECIMALS : 0;
  const sharePrice = pool ? pool.sharePrice : 1;
  const pnlColor = stats.totalPnL >= 0 ? "#34d399" : "#f87171";
  const streakColor = stats.currentStreak > 0 ? "#34d399" : stats.currentStreak < 0 ? "#f87171" : "#4a4a55";

  return (
    <div
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      className="anim-tooltip"
      style={{
        position: "absolute",
        ...posStyle,
        width: 260,
        background: "#0e0e16",
        border: "1px solid #1e1e28",
        borderRadius: 12,
        boxShadow: "0 8px 32px rgba(0,0,0,0.6)",
        padding: "14px 16px",
        zIndex: 100,
        cursor: "default",
      }}
    >
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
        <AgentAvatar monogram={stats.avatar} index={stats.seat} size={32} />
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: "#e2e2e2" }}>
            {stats.name}
          </div>
          <div style={{ fontSize: 9, color: "#4a4a55", fontWeight: 600 }}>
            {stats.style}
          </div>
        </div>
      </div>

      {/* Description */}
      <div style={{
        fontSize: 10, color: "#3a3a48", lineHeight: 1.4,
        marginBottom: 12, fontStyle: "italic",
      }}>
        &ldquo;{stats.description}&rdquo;
      </div>

      {/* Stats grid */}
      <div style={{
        display: "grid", gridTemplateColumns: "1fr 1fr",
        gap: "6px 12px", marginBottom: 12,
      }}>
        <StatCell label="Win Rate" value={`${stats.winRate.toFixed(0)}%`} />
        <StatCell label="VPIP" value={`${stats.vpip.toFixed(0)}%`} />
        <StatCell label="PFR" value={`${stats.pfr.toFixed(0)}%`} />
        <StatCell label="AF" value={stats.aggressionFactor.toFixed(1)} />
        <StatCell label="Streak" value={streakLabel(stats.currentStreak)} valueColor={streakColor} />
        <StatCell label="Hands" value={String(stats.handsPlayed)} />
      </div>

      {/* P&L */}
      <div style={{
        display: "flex", justifyContent: "space-between", alignItems: "center",
        padding: "8px 0", borderTop: "1px solid #1a1a24", marginBottom: 8,
      }}>
        <div>
          <div style={{ fontSize: 9, color: "#3a3a48", fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.5 }}>
            P&amp;L
          </div>
          <div style={{ fontSize: 14, fontWeight: 700, color: pnlColor, fontVariantNumeric: "tabular-nums" }}>
            {stats.totalPnL >= 0 ? "+" : ""}{formatNum(stats.totalPnL)}
          </div>
        </div>
        <div style={{ textAlign: "right" }}>
          <div style={{ fontSize: 9, color: "#3a3a48", fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.5 }}>
            Biggest Pot
          </div>
          <div style={{ fontSize: 11, fontWeight: 600, color: "#8a8a95", fontVariantNumeric: "tabular-nums" }}>
            {formatNum(stats.biggestPotWon)}
          </div>
        </div>
      </div>

      {/* Pool info */}
      {pool && (
        <div style={{
          padding: "8px 0", borderTop: "1px solid #1a1a24", marginBottom: 10,
        }}>
          <div style={{
            display: "flex", justifyContent: "space-between", alignItems: "center",
            marginBottom: 4,
          }}>
            <span style={{ fontSize: 10, color: "#4a4a55" }}>Pool</span>
            <span style={{ fontSize: 10, fontWeight: 600, color: "#8a8a95", fontVariantNumeric: "tabular-nums" }}>
              {formatNum(poolSize)} CHIPS
            </span>
          </div>
          <div style={{
            display: "flex", justifyContent: "space-between", alignItems: "center",
          }}>
            <span style={{ fontSize: 10, color: "#4a4a55" }}>Share Price</span>
            <span style={{ fontSize: 10, fontWeight: 600, color: "#8a8a95", fontVariantNumeric: "tabular-nums" }}>
              {sharePrice.toFixed(3)}
            </span>
          </div>
        </div>
      )}

      {/* Back button */}
      <button
        onClick={(e) => { e.stopPropagation(); onBackClick(); }}
        style={{
          width: "100%",
          padding: "8px 0",
          borderRadius: 6,
          border: "1px solid #1e5c3a",
          background: "rgba(30,92,58,0.15)",
          color: "#34d399",
          fontSize: 11,
          fontWeight: 700,
          textTransform: "uppercase",
          letterSpacing: 0.5,
          cursor: "pointer",
          transition: "background 0.15s",
        }}
        onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(30,92,58,0.3)")}
        onMouseLeave={(e) => (e.currentTarget.style.background = "rgba(30,92,58,0.15)")}
      >
        Back This Agent
      </button>
    </div>
  );
}

function StatCell({ label, value, valueColor }: { label: string; value: string; valueColor?: string }) {
  return (
    <div>
      <div style={{ fontSize: 9, color: "#3a3a48", fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.3 }}>
        {label}
      </div>
      <div style={{ fontSize: 13, fontWeight: 700, color: valueColor || "#c8c8c8", fontVariantNumeric: "tabular-nums" }}>
        {value}
      </div>
    </div>
  );
}
