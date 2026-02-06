"use client";

import { useRef, useEffect } from "react";

export interface TxEntry {
  type: string;       // bet | payout | rake_burn
  from?: string;
  to?: string;
  amount: number;
  timestamp: number;
}

interface Props { transactions: TxEntry[]; }

export default function TransactionLog({ transactions }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => { ref.current && (ref.current.scrollTop = ref.current.scrollHeight); }, [transactions]);

  const label = (tx: TxEntry) => {
    switch (tx.type) {
      case "bet":       return { text: `${tx.from} bet`, clr: "#60a5fa" };
      case "payout":    return { text: `Payout to ${tx.to}`, clr: "#34d399" };
      case "rake_burn": return { text: "Rake burned", clr: "#f87171" };
      default:          return { text: tx.type, clr: "#888" };
    }
  };

  return (
    <div style={{
      background: "rgba(12,12,20,0.7)",
      border: "1px solid rgba(255,255,255,0.06)",
      borderRadius: 10, overflow: "hidden",
    }}>
      <div style={{
        padding: "8px 12px",
        borderBottom: "1px solid rgba(255,255,255,0.06)",
        display: "flex", alignItems: "center", justifyContent: "space-between",
      }}>
        <span style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: 1.5, color: "#555" }}>
          On-Chain Transactions
        </span>
        <span style={{
          fontSize: 8, fontWeight: 600, textTransform: "uppercase",
          letterSpacing: 1, color: "#34d399", opacity: 0.6,
        }}>
          Solana Devnet
        </span>
      </div>
      <div ref={ref} style={{ maxHeight: 200, overflowY: "auto", padding: "4px 0" }}>
        {transactions.length === 0 ? (
          <div style={{ padding: 16, textAlign: "center", fontSize: 11, color: "#444" }}>
            No transactions yet
          </div>
        ) : (
          transactions.map((tx, i) => {
            const l = label(tx);
            return (
              <div
                key={i}
                style={{
                  display: "flex", alignItems: "center", justifyContent: "space-between",
                  padding: "4px 12px", fontSize: 10,
                  borderBottom: "1px solid rgba(255,255,255,0.02)",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <div style={{
                    width: 5, height: 5, borderRadius: "50%",
                    background: l.clr, flexShrink: 0,
                  }}/>
                  <span style={{ color: "#999" }}>{l.text}</span>
                </div>
                <span style={{ color: "#d4a843", fontVariantNumeric: "tabular-nums", fontWeight: 600 }}>
                  {(tx.amount ?? 0).toLocaleString()} CHIPS
                </span>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
