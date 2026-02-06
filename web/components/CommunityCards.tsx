"use client";

import Card from "./Card";
import { CardData } from "@/hooks/useGameState";

interface Props { cards: CardData[]; round: string; }

export default function CommunityCards({ cards, round }: Props) {
  const slots = Array.from({ length: 5 }, (_, i) => cards[i] || null);

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
      <span style={{
        fontSize: 10, fontWeight: 600, letterSpacing: 1.5,
        textTransform: "uppercase", color: "rgba(255,255,255,0.35)",
      }}>
        {round === "preflop" ? "pre-flop" : round || "waiting"}
      </span>
      <div style={{ display: "flex", gap: 6 }}>
        {slots.map((c, i) =>
          c ? (
            <div key={i} className="anim-fade">
              <Card card={c} size="lg" animate />
            </div>
          ) : (
            <div
              key={i}
              style={{
                width: 58, height: 82, borderRadius: 5,
                border: "1.5px dashed rgba(255,255,255,0.1)",
                background: "rgba(0,0,0,0.15)",
              }}
            />
          )
        )}
      </div>
    </div>
  );
}
