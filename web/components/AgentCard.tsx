"use client";

import { AgentStats } from "@/hooks/useAgentStats";
import { PlayerData } from "@/hooks/useGameState";
import AgentAvatar from "./AgentAvatar";

interface Props {
  player: PlayerData;
  stats: AgentStats;
  isSelected: boolean;
  onClick: () => void;
}

function formatCompact(n: number): string {
  if (Math.abs(n) >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (Math.abs(n) >= 1_000) return `${(n / 1_000).toFixed(0)}K`;
  return n.toLocaleString();
}

export default function AgentCard({ player, stats, isSelected, onClick }: Props) {
  if (player.sittingOut) return null;

  const pnlColor = stats.totalPnL >= 0 ? "#34d399" : "#f87171";

  return (
    <div
      onClick={onClick}
      style={{
        display: "flex", alignItems: "center", gap: 6,
        padding: "3px 12px",
        height: 26,
        cursor: "pointer",
        borderLeft: isSelected ? "2px solid #c9a83a" : "2px solid transparent",
        background: isSelected ? "rgba(200,168,58,0.04)" : "transparent",
        transition: "background 0.15s, border-color 0.15s",
      }}
      onMouseEnter={(e) => {
        if (!isSelected) e.currentTarget.style.background = "rgba(255,255,255,0.02)";
      }}
      onMouseLeave={(e) => {
        if (!isSelected) e.currentTarget.style.background = isSelected ? "rgba(200,168,58,0.04)" : "transparent";
      }}
    >
      <AgentAvatar monogram={player.avatar || stats.avatar} index={player.seat} size={18} />

      <span style={{
        fontSize: 10, fontWeight: 600, color: "#c8c8c8",
        whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
        flex: 1, minWidth: 0,
      }}>
        {player.name}
      </span>

      <span style={{
        fontSize: 9, fontWeight: 700, color: pnlColor,
        fontVariantNumeric: "tabular-nums", flexShrink: 0,
      }}>
        {stats.totalPnL >= 0 ? "+" : ""}{formatCompact(stats.totalPnL)}
      </span>

      <span style={{
        fontSize: 9, color: "#4a4a55",
        fontVariantNumeric: "tabular-nums", flexShrink: 0,
      }}>
        {formatCompact(player.chips ?? 0)}
      </span>
    </div>
  );
}
