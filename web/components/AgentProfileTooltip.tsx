"use client";

import { AgentStats } from "@/hooks/useAgentStats";
import { PoolInfo } from "@/hooks/useStaking";
import { PlayerData } from "@/hooks/useGameState";
import AgentAvatar from "./AgentAvatar";

interface Props {
  player: PlayerData;
  stats: AgentStats;
  pool: PoolInfo | null | undefined;
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
  const pnl = stats.totalPnL;
  const pnlColor = pnl >= 0 ? "#34d399" : "#f87171";
  const pnlSign = pnl >= 0 ? "+" : "";

  const streakText = stats.currentStreak > 0
    ? `${stats.currentStreak}W streak`
    : stats.currentStreak < 0
    ? `${Math.abs(stats.currentStreak)}L streak`
    : "";
  const streakColor = stats.currentStreak > 0 ? "#34d399" : stats.currentStreak < 0 ? "#f87171" : "#4a4a55";

  return (
    <div
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      className="anim-tooltip"
      style={{
        position: "absolute",
        ...posStyle,
        width: 280,
        background: "linear-gradient(180deg, #111119 0%, #0c0c14 100%)",
        border: "1px solid #1e1e2a",
        borderRadius: 14,
        boxShadow: "0 12px 48px rgba(0,0,0,0.7), 0 0 0 1px rgba(255,255,255,0.03)",
        overflow: "hidden",
        zIndex: 100,
        cursor: "default",
      }}
    >
      {/* Header with accent bar */}
      <div style={{
        padding: "16px 18px 14px",
        background: "linear-gradient(180deg, rgba(201,168,58,0.06) 0%, transparent 100%)",
        borderBottom: "1px solid #1a1a24",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <AgentAvatar monogram={player.avatar || stats.avatar} index={stats.seat} size={44} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 15, fontWeight: 800, color: "#f0f0f0", letterSpacing: -0.2 }}>
              {stats.name}
            </div>
            <div style={{ fontSize: 10, color: "#6a6a78", fontWeight: 600, marginTop: 1 }}>
              {stats.style}
            </div>
          </div>
          {/* P&L badge */}
          <div style={{
            padding: "4px 10px", borderRadius: 6,
            background: pnl >= 0 ? "rgba(52,211,153,0.1)" : "rgba(248,113,113,0.1)",
            border: `1px solid ${pnl >= 0 ? "rgba(52,211,153,0.2)" : "rgba(248,113,113,0.2)"}`,
          }}>
            <div style={{ fontSize: 13, fontWeight: 800, color: pnlColor, fontVariantNumeric: "tabular-nums" }}>
              {pnlSign}{formatNum(pnl)}
            </div>
          </div>
        </div>

        {/* Description */}
        {stats.description && (
          <div style={{
            fontSize: 11, color: "#4a4a58", lineHeight: 1.4,
            marginTop: 10, fontStyle: "italic",
          }}>
            &ldquo;{stats.description}&rdquo;
          </div>
        )}
      </div>

      {/* Stats */}
      <div style={{ padding: "12px 18px" }}>
        <div style={{
          display: "grid", gridTemplateColumns: "1fr 1fr 1fr",
          gap: "10px 8px",
        }}>
          <StatPill label="Win Rate" value={`${stats.winRate.toFixed(0)}%`} accent={stats.winRate > 50} />
          <StatPill label="VPIP" value={`${stats.vpip.toFixed(0)}%`} />
          <StatPill label="PFR" value={`${stats.pfr.toFixed(0)}%`} />
          <StatPill label="Aggression" value={stats.aggressionFactor.toFixed(1)} />
          <StatPill label="Hands" value={String(stats.handsPlayed)} />
          <StatPill label="Best Pot" value={formatNum(stats.biggestPotWon)} accent />
        </div>

        {/* Streak */}
        {streakText && (
          <div style={{
            marginTop: 10, display: "flex", alignItems: "center", gap: 6,
          }}>
            <div style={{
              width: 6, height: 6, borderRadius: "50%",
              background: streakColor,
            }} />
            <span style={{ fontSize: 10, fontWeight: 700, color: streakColor }}>
              {streakText}
            </span>
          </div>
        )}
      </div>

      {/* Pool + Back button */}
      <div style={{
        padding: "12px 18px 16px",
        borderTop: "1px solid #1a1a24",
        background: "rgba(30,92,58,0.03)",
      }}>
        {pool ? (
          <div style={{
            display: "flex", justifyContent: "space-between", alignItems: "center",
            marginBottom: 12,
          }}>
            <div>
              <div style={{ fontSize: 9, color: "#3a3a48", fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.8 }}>
                Pool Size
              </div>
              <div style={{ fontSize: 13, fontWeight: 700, color: "#8a8a95", fontVariantNumeric: "tabular-nums" }}>
                {formatNum(poolSize)} <span style={{ fontSize: 9, color: "#4a4a55" }}>CHIPS</span>
              </div>
            </div>
            <div style={{ textAlign: "right" }}>
              <div style={{ fontSize: 9, color: "#3a3a48", fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.8 }}>
                Share Price
              </div>
              <div style={{ fontSize: 13, fontWeight: 700, color: "#8a8a95", fontVariantNumeric: "tabular-nums" }}>
                {pool.sharePrice.toFixed(3)}
              </div>
            </div>
          </div>
        ) : (
          <div style={{ fontSize: 10, color: "#4a4a55", marginBottom: 12 }}>
            Pool not yet initialized
          </div>
        )}

        <button
          onClick={(e) => { e.stopPropagation(); onBackClick(); }}
          style={{
            width: "100%",
            padding: "10px 0",
            borderRadius: 8,
            border: "none",
            background: "linear-gradient(135deg, #1e5c3a 0%, #1a7a42 100%)",
            color: "#fff",
            fontSize: 12,
            fontWeight: 800,
            textTransform: "uppercase",
            letterSpacing: 1,
            cursor: "pointer",
            transition: "all 0.15s",
            boxShadow: "0 2px 8px rgba(30,92,58,0.3)",
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = "linear-gradient(135deg, #24703e 0%, #20904a 100%)";
            e.currentTarget.style.boxShadow = "0 4px 16px rgba(30,92,58,0.5)";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = "linear-gradient(135deg, #1e5c3a 0%, #1a7a42 100%)";
            e.currentTarget.style.boxShadow = "0 2px 8px rgba(30,92,58,0.3)";
          }}
        >
          Back This Agent
        </button>
      </div>
    </div>
  );
}

function StatPill({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div style={{
      padding: "6px 8px",
      borderRadius: 6,
      background: "#0a0a12",
      border: "1px solid #161620",
    }}>
      <div style={{ fontSize: 8, color: "#3a3a48", fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 2 }}>
        {label}
      </div>
      <div style={{ fontSize: 14, fontWeight: 800, color: accent ? "#c9a83a" : "#c8c8c8", fontVariantNumeric: "tabular-nums" }}>
        {value}
      </div>
    </div>
  );
}
