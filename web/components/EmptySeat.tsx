"use client";

export default function EmptySeat({ seatNumber }: { seatNumber: number }) {
  return (
    <div style={{
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      gap: 4,
      padding: "12px 14px",
      borderRadius: 12,
      minWidth: 108,
      minHeight: 90,
      border: "1px dashed rgba(255,255,255,0.06)",
      opacity: 0.3,
    }}>
      <div style={{
        width: 28,
        height: 28,
        borderRadius: "50%",
        border: "1px dashed rgba(255,255,255,0.15)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontSize: 10,
        color: "#3a3a48",
        fontWeight: 600,
      }}>
        {seatNumber}
      </div>
      <div style={{
        fontSize: 9,
        color: "#2a2a38",
        fontWeight: 600,
        textTransform: "uppercase",
        letterSpacing: 1,
      }}>
        Open
      </div>
    </div>
  );
}
