"use client";

import { CardData } from "@/hooks/useGameState";

const SUIT_SYMBOL: Record<string, string> = { h: "\u2665", d: "\u2666", c: "\u2663", s: "\u2660" };
const SUIT_CLR: Record<string, string> = { h: "#dc2626", d: "#dc2626", c: "#1e293b", s: "#1e293b" };
const RANK: Record<string, string> = {
  "2":"2","3":"3","4":"4","5":"5","6":"6","7":"7","8":"8","9":"9",
  T:"10",J:"J",Q:"Q",K:"K",A:"A",
};

interface Props {
  card?: CardData;
  faceDown?: boolean;
  size?: "sm" | "md" | "lg";
  animate?: boolean;
}

const SIZE = {
  sm:  { w: 32, h: 46, rank: 11, suit: 10 },
  md:  { w: 48, h: 68, rank: 15, suit: 14 },
  lg:  { w: 58, h: 82, rank: 18, suit: 16 },
} as const;

export default function Card({ card, faceDown, size = "md", animate }: Props) {
  const s = SIZE[size];

  /* ── face-down / empty ── */
  if (!card || faceDown) {
    return (
      <div
        className={animate ? "anim-deal" : ""}
        style={{
          width: s.w, height: s.h, borderRadius: 5, flexShrink: 0,
          background: "linear-gradient(145deg, #1c3f5e 0%, #254e72 50%, #1c3f5e 100%)",
          border: "1.5px solid #3b6a94",
          boxShadow: "0 2px 6px rgba(0,0,0,0.4)",
          display: "flex", alignItems: "center", justifyContent: "center",
        }}
      >
        <div style={{
          width: s.w - 8, height: s.h - 8, borderRadius: 3,
          border: "1px solid rgba(255,255,255,0.08)",
          background: "repeating-linear-gradient(135deg, transparent 0 3px, rgba(255,255,255,0.03) 3px 4px)",
        }}/>
      </div>
    );
  }

  /* ── face-up ── */
  const clr = SUIT_CLR[card.suit] || "#1e293b";
  const sym = SUIT_SYMBOL[card.suit] || "";
  const rk = RANK[card.rank] || card.rank;

  return (
    <div
      className={animate ? "anim-deal" : ""}
      style={{
        width: s.w, height: s.h, borderRadius: 5, flexShrink: 0,
        background: "#f8f7f2",
        border: "1px solid #c8c5ba",
        boxShadow: "0 2px 6px rgba(0,0,0,0.35)",
        display: "flex", flexDirection: "column",
        alignItems: "center", justifyContent: "center",
        gap: 0, position: "relative", overflow: "hidden",
        userSelect: "none",
      }}
    >
      {/* top-left corner */}
      <div style={{
        position: "absolute", top: 2, left: 3,
        display: "flex", flexDirection: "column", alignItems: "center",
        lineHeight: 1, color: clr,
      }}>
        <span style={{ fontSize: s.rank, fontWeight: 700 }}>{rk}</span>
        <span style={{ fontSize: s.suit - 2 }}>{sym}</span>
      </div>
      {/* center suit */}
      <span style={{ fontSize: s.suit + 6, color: clr, lineHeight: 1 }}>{sym}</span>
      {/* bottom-right corner (rotated) */}
      <div style={{
        position: "absolute", bottom: 2, right: 3,
        display: "flex", flexDirection: "column", alignItems: "center",
        lineHeight: 1, color: clr, transform: "rotate(180deg)",
      }}>
        <span style={{ fontSize: s.rank, fontWeight: 700 }}>{rk}</span>
        <span style={{ fontSize: s.suit - 2 }}>{sym}</span>
      </div>
    </div>
  );
}
