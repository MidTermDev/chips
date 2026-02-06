"use client";

import { useRef, useEffect } from "react";
import { ActionData } from "@/hooks/useGameState";

interface Props { actions: ActionData[]; }

const CLR: Record<string, string> = {
  fold: "#6b7280",
  check: "#34d399",
  call: "#60a5fa",
  raise: "#fbbf24",
  "all-in": "#f87171",
  "small blind": "#a78bfa",
  "big blind": "#a78bfa",
};

export default function ActionLog({ actions }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => { ref.current && (ref.current.scrollTop = ref.current.scrollHeight); }, [actions]);

  return (
    <div style={{
      background: "rgba(12,12,20,0.7)",
      border: "1px solid rgba(255,255,255,0.06)",
      borderRadius: 10, overflow: "hidden",
    }}>
      <div style={{
        padding: "8px 12px",
        borderBottom: "1px solid rgba(255,255,255,0.06)",
        fontSize: 10, fontWeight: 700, textTransform: "uppercase",
        letterSpacing: 1.5, color: "#555",
      }}>
        Actions
      </div>
      <div ref={ref} style={{ maxHeight: 240, overflowY: "auto", padding: "4px 0" }}>
        {actions.length === 0 ? (
          <div style={{ padding: 16, textAlign: "center", fontSize: 11, color: "#444" }}>
            Waiting for hand to begin...
          </div>
        ) : (
          actions.map((a, i) => (
            <div
              key={i}
              style={{
                display: "flex", alignItems: "baseline", gap: 6,
                padding: "3px 12px", fontSize: 11,
              }}
            >
              <span style={{ color: "#888", fontWeight: 600, minWidth: 56 }}>
                {a.playerName}
              </span>
              <span style={{
                color: CLR[a.action] || "#888",
                fontWeight: 700, textTransform: "uppercase", fontSize: 10,
              }}>
                {a.action}
              </span>
              {a.amount > 0 && (
                <span style={{ color: "#d4a843", fontVariantNumeric: "tabular-nums", fontSize: 10 }}>
                  {(a.amount ?? 0).toLocaleString()}
                </span>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
