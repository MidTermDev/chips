"use client";

import { useState } from "react";
import { WinnerData } from "@/hooks/useGameState";

interface Entry {
  handNumber: number;
  winners: WinnerData[];
  players: { index: number; name: string; chips: number; avatar: string }[];
}

interface Props { history: Entry[]; }

export default function HandHistory({ history }: Props) {
  const [open, setOpen] = useState<number | null>(null);

  if (history.length === 0) {
    return <div style={{ padding: "8px 14px", fontSize: 10, color: "#1e1e28" }}>No hands yet</div>;
  }

  return (
    <div style={{ overflow: "auto", padding: "0 0 4px" }}>
      {[...history].reverse().map((h) => (
        <div key={h.handNumber}>
          <button
            onClick={() => setOpen(open === h.handNumber ? null : h.handNumber)}
            style={{
              width: "100%", textAlign: "left", background: "none", border: "none",
              color: "inherit", cursor: "pointer",
              padding: "3px 14px", display: "flex", justifyContent: "space-between",
              alignItems: "center", fontSize: 10,
            }}
          >
            <span style={{ color: "#2a2a38" }}>#{h.handNumber}</span>
            <span style={{ color: "#5a5040", fontWeight: 600, fontSize: 9 }}>
              {h.winners.map((w) => `${w.playerName} +${(w.amount ?? 0).toLocaleString()}`).join(", ")}
            </span>
          </button>
          {open === h.handNumber && (
            <div className="anim-fade" style={{ padding: "2px 14px 6px" }}>
              {h.winners.map((w, i) => (
                <div key={i} style={{ fontSize: 9, color: "#4a4a55", marginBottom: 1 }}>
                  <span style={{ color: "#c9a83a", fontWeight: 600 }}>{w.playerName}</span>
                  {" "}{w.handDescription}
                </div>
              ))}
              <div style={{ marginTop: 4 }}>
                {h.players.sort((a, b) => b.chips - a.chips).map((p) => (
                  <div key={p.index} style={{
                    display: "flex", justifyContent: "space-between",
                    fontSize: 9, color: "#2a2a38", padding: "1px 0",
                  }}>
                    <span>{p.name}</span>
                    <span style={{ fontVariantNumeric: "tabular-nums" }}>{(p.chips ?? 0).toLocaleString()}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
