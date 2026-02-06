"use client";

import { useState } from "react";
import { PoolInfo, PositionInfo } from "@/hooks/useStaking";
import { AgentStats } from "@/hooks/useAgentStats";
import AgentAvatar from "./AgentAvatar";

interface Props {
  agentIndex: number;
  agentName: string;
  pool: PoolInfo | null;
  position: PositionInfo | null;
  connected: boolean;
  txPending: boolean;
  onDeposit: (agentIndex: number, amount: number) => Promise<void>;
  onWithdraw: (agentIndex: number, shares: number) => Promise<void>;
  onClose: () => void;
  stats?: AgentStats;
  agentOnline?: boolean;
}

const DECIMALS = 1e6;

export default function BankrollPanel({
  agentIndex, agentName, pool, position, connected,
  txPending, onDeposit, onWithdraw, onClose, stats, agentOnline,
}: Props) {
  const [depositAmount, setDepositAmount] = useState("");
  const [withdrawPct, setWithdrawPct] = useState(100);
  const [error, setError] = useState("");

  /* ── Header ── */
  const header = (
    <div style={{
      display: "flex", justifyContent: "space-between", alignItems: "center",
      padding: "10px 14px", borderBottom: "1px solid #1a1a24",
      background: "linear-gradient(180deg, rgba(30,92,58,0.06) 0%, transparent 100%)",
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        {stats && <AgentAvatar monogram={stats.avatar} index={stats.seat} size={24} />}
        <div>
          <div style={{ fontSize: 12, fontWeight: 700, color: "#e2e2e2" }}>
            {agentName}
          </div>
          <div style={{ fontSize: 9, color: "#3a3a48" }}>
            {stats?.style || "Bankroll Backing"}
          </div>
        </div>
      </div>
      <button
        onClick={onClose}
        style={{
          background: "none", border: "none", color: "#3a3a48",
          cursor: "pointer", fontSize: 14, padding: 4,
        }}
      >
        &times;
      </button>
    </div>
  );

  if (!pool) {
    return (
      <div style={panelStyle}>
        {header}
        <div style={{ padding: 14, fontSize: 11, color: "#3a3a48" }}>
          Pool not initialized yet. Verify this agent first to create a pool.
        </div>
      </div>
    );
  }

  const vaultEmpty = pool.totalAssets === 0;
  const statusLabel = agentOnline === undefined ? null
    : agentOnline && !vaultEmpty ? { text: "Active", color: "#34d399" }
    : agentOnline && vaultEmpty ? { text: "Needs Backing", color: "#fbbf24" }
    : !agentOnline && !vaultEmpty ? { text: "Offline", color: "#f87171" }
    : { text: "Offline", color: "#4a4a55" };

  const sharePrice = pool.sharePrice;
  const poolSizeDisplay = (pool.totalAssets / DECIMALS).toLocaleString(undefined, { maximumFractionDigits: 0 });
  const userShares = position?.shares ?? 0;
  const userValue = position?.currentValue ?? 0;
  const userValueDisplay = (userValue / DECIMALS).toLocaleString(undefined, { maximumFractionDigits: 0 });
  const pnl = position?.pnl ?? 0;
  const pnlDisplay = (pnl / DECIMALS).toLocaleString(undefined, { maximumFractionDigits: 0 });
  const pnlColor = pnl >= 0 ? "#34d399" : "#f87171";

  const handleDeposit = async () => {
    setError("");
    const amt = parseFloat(depositAmount);
    if (!amt || amt <= 0) { setError("Enter a valid amount"); return; }
    try {
      await onDeposit(agentIndex, amt);
      setDepositAmount("");
    } catch (e: any) {
      setError(e.message?.slice(0, 80) || "Transaction failed");
    }
  };

  const handleWithdraw = async () => {
    setError("");
    if (!userShares) { setError("No shares to withdraw"); return; }
    const sharesToBurn = Math.floor(userShares * withdrawPct / 100);
    if (sharesToBurn <= 0) { setError("Nothing to withdraw"); return; }
    try {
      await onWithdraw(agentIndex, sharesToBurn);
    } catch (e: any) {
      setError(e.message?.slice(0, 80) || "Transaction failed");
    }
  };

  return (
    <div style={panelStyle}>
      {header}

      {/* Performance summary */}
      {stats && stats.handsPlayed > 0 && (
        <div style={{ padding: "10px 14px", borderBottom: "1px solid #1a1a24" }}>
          <div style={{
            display: "flex", justifyContent: "space-between", alignItems: "center",
            marginBottom: 6,
          }}>
            <span style={sectionLabel}>Performance</span>
            <span style={{
              fontSize: 10, fontWeight: 700,
              color: stats.totalPnL >= 0 ? "#34d399" : "#f87171",
              fontVariantNumeric: "tabular-nums",
            }}>
              {stats.totalPnL >= 0 ? "+" : ""}{stats.totalPnL.toLocaleString()} P&amp;L
            </span>
          </div>
          <div style={{ display: "flex", gap: 12 }}>
            <MiniStat label="WR" value={`${stats.winRate.toFixed(0)}%`} />
            <MiniStat label="VPIP" value={`${stats.vpip.toFixed(0)}%`} />
            <MiniStat label="PFR" value={`${stats.pfr.toFixed(0)}%`} />
            <MiniStat label="Hands" value={String(stats.handsPlayed)} />
          </div>
        </div>
      )}

      {/* Status + Pool stats */}
      <div style={{ padding: "10px 14px", borderBottom: "1px solid #1a1a24" }}>
        {statusLabel && (
          <div style={{
            display: "flex", alignItems: "center", gap: 5, marginBottom: 6,
          }}>
            <div style={{
              width: 6, height: 6, borderRadius: "50%",
              background: statusLabel.color,
            }} />
            <span style={{ fontSize: 10, fontWeight: 700, color: statusLabel.color }}>
              {statusLabel.text}
            </span>
            {!agentOnline && !vaultEmpty && (
              <span style={{ fontSize: 9, color: "#4a4a55", marginLeft: 4 }}>
                Backers can still withdraw
              </span>
            )}
          </div>
        )}
        {vaultEmpty && (
          <div style={{ fontSize: 10, color: "#fbbf24", marginBottom: 6 }}>
            Agent needs backing to play. Deposit CHIPS below.
          </div>
        )}
        <Row label="Pool Size" value={`${poolSizeDisplay} CHIPS`} />
        <Row label="Share Price" value={sharePrice.toFixed(6)} />
        <Row label="Fee" value={`${pool.feeBasisPoints / 100}%`} />
        {pool.paused && (
          <div style={{ fontSize: 10, color: "#f87171", fontWeight: 700, marginTop: 4 }}>
            PAUSED
          </div>
        )}
      </div>

      {/* User position */}
      {connected && position && userShares > 0 && (
        <div style={{ padding: "10px 14px", borderBottom: "1px solid #1a1a24" }}>
          <div style={{ ...sectionLabel, marginBottom: 6 }}>Your Position</div>
          <Row label="Shares" value={(userShares / DECIMALS).toLocaleString(undefined, { maximumFractionDigits: 0 })} />
          <Row label="Value" value={`${userValueDisplay} CHIPS`} />
          <Row label="P&L" value={`${pnl >= 0 ? "+" : ""}${pnlDisplay}`} valueColor={pnlColor} />
        </div>
      )}

      {/* Deposit / Withdraw */}
      {connected ? (
        <div style={{ padding: "10px 14px" }}>
          <div style={{ marginBottom: 10 }}>
            <div style={{ ...sectionLabel, marginBottom: 6 }}>Deposit</div>
            <div style={{ display: "flex", gap: 6 }}>
              <input
                type="number"
                placeholder="CHIPS amount"
                value={depositAmount}
                onChange={(e) => setDepositAmount(e.target.value)}
                style={inputStyle}
              />
              <button
                onClick={handleDeposit}
                disabled={txPending || pool.paused}
                style={{
                  ...btnStyle,
                  background: txPending ? "#1a1a24" : "#1e5c3a",
                  color: txPending ? "#3a3a48" : "#34d399",
                  opacity: txPending || pool.paused ? 0.5 : 1,
                }}
              >
                {txPending ? "..." : "Back"}
              </button>
            </div>
          </div>

          {userShares > 0 && (
            <div>
              <div style={{ ...sectionLabel, marginBottom: 6 }}>Withdraw</div>
              <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                <select
                  value={withdrawPct}
                  onChange={(e) => setWithdrawPct(Number(e.target.value))}
                  style={inputStyle}
                >
                  <option value={25}>25%</option>
                  <option value={50}>50%</option>
                  <option value={75}>75%</option>
                  <option value={100}>100%</option>
                </select>
                <button
                  onClick={handleWithdraw}
                  disabled={txPending}
                  style={{
                    ...btnStyle,
                    background: txPending ? "#1a1a24" : "#5c1e1e",
                    color: txPending ? "#3a3a48" : "#f87171",
                    opacity: txPending ? 0.5 : 1,
                  }}
                >
                  {txPending ? "..." : "Exit"}
                </button>
              </div>
            </div>
          )}

          {error && (
            <div style={{ fontSize: 10, color: "#f87171", marginTop: 8 }}>
              {error}
            </div>
          )}
        </div>
      ) : (
        <div style={{ padding: "10px 14px", fontSize: 11, color: "#3a3a48" }}>
          Connect wallet to back this agent
        </div>
      )}
    </div>
  );
}

/* ── Sub-components ── */

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div style={{ fontSize: 8, color: "#3a3a48", fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.3 }}>
        {label}
      </div>
      <div style={{ fontSize: 10, fontWeight: 700, color: "#8a8a95", fontVariantNumeric: "tabular-nums" }}>
        {value}
      </div>
    </div>
  );
}

function Row({ label, value, valueColor }: { label: string; value: string; valueColor?: string }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 3 }}>
      <span style={{ fontSize: 10, color: "#4a4a55" }}>{label}</span>
      <span style={{ fontSize: 10, fontWeight: 600, color: valueColor || "#8a8a95", fontVariantNumeric: "tabular-nums" }}>
        {value}
      </span>
    </div>
  );
}

/* ── Styles ── */

const panelStyle: React.CSSProperties = {
  background: "#0e0e16",
  overflow: "hidden",
  width: "100%",
};

const sectionLabel: React.CSSProperties = {
  fontSize: 9,
  color: "#2a2a38",
  fontWeight: 700,
  textTransform: "uppercase",
  letterSpacing: 1,
};

const inputStyle: React.CSSProperties = {
  flex: 1,
  background: "#0a0a12",
  border: "1px solid #1a1a24",
  borderRadius: 4,
  padding: "6px 8px",
  color: "#c8c8c8",
  fontSize: 11,
  outline: "none",
  minWidth: 0,
};

const btnStyle: React.CSSProperties = {
  border: "none",
  borderRadius: 4,
  padding: "6px 14px",
  fontSize: 10,
  fontWeight: 700,
  textTransform: "uppercase",
  letterSpacing: 0.5,
  cursor: "pointer",
  whiteSpace: "nowrap",
  transition: "opacity 0.15s",
};
