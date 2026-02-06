"use client";

interface Props { pot: number; }

export default function PotDisplay({ pot }: Props) {
  return (
    <div style={{
      display: "inline-flex", alignItems: "center", gap: 8,
      background: "rgba(0,0,0,0.45)", backdropFilter: "blur(6px)",
      borderRadius: 20, padding: "6px 16px",
      border: "1px solid rgba(255,255,255,0.06)",
    }}>
      <span style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: 1, color: "#888", fontWeight: 600 }}>
        Pot
      </span>
      <span
        key={pot}
        className="anim-bump"
        style={{ fontSize: 18, fontWeight: 700, color: "#d4a843", fontVariantNumeric: "tabular-nums" }}
      >
        {(pot ?? 0).toLocaleString()}
      </span>
    </div>
  );
}
