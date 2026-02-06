"use client";

import { useState } from "react";
import { PoolInfo, PositionInfo } from "@/hooks/useStaking";
import { AgentStats } from "@/hooks/useAgentStats";
import AgentAvatar from "./AgentAvatar";

interface Props {
  agentIndex: number;
  agentName: string;
  pool: PoolInfo | null | undefined;
  position: PositionInfo | null | undefined;
  connected: boolean;
  txPending: boolean;
  onDeposit: (agentIndex: number, amount: number) => Promise<void>;
  onWithdraw: (agentIndex: number, shares: number) => Promise<void>;
  onClose: () => void;
  stats?: AgentStats;
  agentOnline?: boolean;
}

const DECIMALS = 1e6;
const QUICK_AMOUNTS = [100, 500, 1000, 5000];

export default function BankrollPanel({
  agentIndex, agentName, pool, position, connected,
  txPending, onDeposit, onWithdraw, onClose, stats, agentOnline,
}: Props) {
  const [depositAmount, setDepositAmount] = useState("");
  const [withdrawPct, setWithdrawPct] = useState(100);
  const [error, setError] = useState("");
  const [activeSection, setActiveSection] = useState<"deposit" | "withdraw">("deposit");

  const vaultEmpty = !pool || pool.totalAssets === 0;

  const statusLabel = agentOnline === undefined ? null
    : agentOnline && !vaultEmpty ? { text: "Playing", color: "#34d399", dot: true }
    : agentOnline && vaultEmpty ? { text: "Needs Chips", color: "#fbbf24", dot: true }
    : !agentOnline && !vaultEmpty ? { text: "Offline", color: "#f87171", dot: false }
    : { text: "Offline", color: "#4a4a55", dot: false };

  const sharePrice = pool?.sharePrice ?? 1;
  const poolSize = pool ? pool.totalAssets / DECIMALS : 0;
  const userShares = position?.shares ?? 0;
  const userValue = position?.currentValue ?? 0;
  const pnl = position?.pnl ?? 0;

  const handleDeposit = async () => {
    setError("");
    const amt = parseFloat(depositAmount);
    if (!amt || amt <= 0) { setError("Enter a valid amount"); return; }
    try {
      await onDeposit(agentIndex, amt);
      setDepositAmount("");
    } catch (e: any) {
      console.error("Deposit error:", e);
      setError(e.message?.slice(0, 200) || "Transaction failed");
    }
  };

  const handleWithdraw = async () => {
    setError("");
    if (!userShares) { setError("No shares to withdraw"); return; }
    if (pool && pool.totalAssets === 0) { setError("Pool has no assets — nothing to withdraw"); return; }
    const sharesToBurn = Math.floor(userShares * withdrawPct / 100);
    if (sharesToBurn <= 0) { setError("Nothing to withdraw"); return; }
    try {
      await onWithdraw(agentIndex, sharesToBurn);
    } catch (e: any) {
      console.error("Withdraw error:", e);
      setError(e.message?.slice(0, 200) || "Transaction failed");
    }
  };

  return (
    <div style={{
      background: "#0e0e16",
      overflow: "hidden",
      width: "100%",
      display: "flex",
      flexDirection: "column",
      height: "100%",
    }}>
      {/* Header */}
      <div style={{
        padding: "16px 18px 14px",
        borderBottom: "1px solid #1a1a24",
        background: "linear-gradient(180deg, rgba(201,168,58,0.04) 0%, transparent 100%)",
      }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            {stats && <AgentAvatar monogram={stats.avatar} index={stats.seat} size={36} />}
            <div>
              <div style={{ fontSize: 14, fontWeight: 800, color: "#f0f0f0" }}>
                {agentName}
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 2 }}>
                <span style={{ fontSize: 10, color: "#5a5a68" }}>
                  {stats?.style || "Seat " + agentIndex}
                </span>
                {statusLabel && (
                  <span style={{
                    display: "inline-flex", alignItems: "center", gap: 4,
                    fontSize: 9, fontWeight: 700, color: statusLabel.color,
                    padding: "1px 6px", borderRadius: 4,
                    background: `${statusLabel.color}15`,
                  }}>
                    {statusLabel.dot && (
                      <span style={{
                        width: 5, height: 5, borderRadius: "50%",
                        background: statusLabel.color,
                        display: "inline-block",
                      }} />
                    )}
                    {statusLabel.text}
                  </span>
                )}
              </div>
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              background: "#161620", border: "1px solid #1e1e28", borderRadius: 6,
              color: "#5a5a68", cursor: "pointer", fontSize: 12,
              width: 28, height: 28,
              display: "flex", alignItems: "center", justifyContent: "center",
            }}
          >
            &times;
          </button>
        </div>
      </div>

      {/* Quick stats */}
      {stats && stats.handsPlayed > 0 && (
        <div style={{
          display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr",
          gap: 1, background: "#1a1a24",
          borderBottom: "1px solid #1a1a24",
        }}>
          <QuickStat label="W/R" value={`${stats.winRate.toFixed(0)}%`} color={stats.winRate > 50 ? "#34d399" : "#c8c8c8"} />
          <QuickStat label="P&L" value={`${stats.totalPnL >= 0 ? "+" : ""}${formatCompact(stats.totalPnL)}`} color={stats.totalPnL >= 0 ? "#34d399" : "#f87171"} />
          <QuickStat label="VPIP" value={`${stats.vpip.toFixed(0)}%`} />
          <QuickStat label="Hands" value={String(stats.handsPlayed)} />
        </div>
      )}

      {!pool ? (
        <div style={{ padding: "24px 18px", textAlign: "center" }}>
          <div style={{ fontSize: 24, marginBottom: 8, opacity: 0.3 }}>
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" style={{ display: "inline-block" }}>
              <circle cx="12" cy="12" r="10" stroke="#4a4a55" strokeWidth="1.5"/>
              <path d="M12 6v6l4 2" stroke="#4a4a55" strokeWidth="1.5" strokeLinecap="round"/>
            </svg>
          </div>
          <div style={{ fontSize: 12, color: "#4a4a55", fontWeight: 600 }}>
            Pool not initialized yet
          </div>
          <div style={{ fontSize: 10, color: "#3a3a48", marginTop: 4, lineHeight: 1.5 }}>
            The agent needs to be verified before backers can deposit.
          </div>
        </div>
      ) : (
        <>
          {/* Pool overview */}
          <div style={{ padding: "14px 18px", borderBottom: "1px solid #1a1a24" }}>
            <div style={{
              display: "grid", gridTemplateColumns: "1fr 1fr",
              gap: 8,
            }}>
              <InfoBox label="Pool Bankroll" value={`${formatCompact(poolSize)}`} unit="CHIPS" />
              <InfoBox label="Share Price" value={sharePrice.toFixed(4)} />
            </div>

            {/* Your position */}
            {connected && userShares > 0 && (
              <div style={{
                marginTop: 10, padding: "10px 12px",
                borderRadius: 8,
                background: "rgba(201,168,58,0.04)",
                border: "1px solid rgba(201,168,58,0.1)",
              }}>
                <div style={{ fontSize: 9, fontWeight: 700, color: "#5a5a68", textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 6 }}>
                  Your Position
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                  <span style={{ fontSize: 12, color: "#c8c8c8" }}>
                    {formatCompact(userValue / DECIMALS)} <span style={{ fontSize: 9, color: "#4a4a55" }}>CHIPS</span>
                  </span>
                  <span style={{
                    fontSize: 11, fontWeight: 700,
                    color: pnl >= 0 ? "#34d399" : "#f87171",
                    fontVariantNumeric: "tabular-nums",
                  }}>
                    {pnl >= 0 ? "+" : ""}{formatCompact(pnl / DECIMALS)} P&L
                  </span>
                </div>
              </div>
            )}
          </div>

          {/* Action area */}
          {connected ? (
            <div style={{ padding: "14px 18px", flex: 1 }}>
              {/* Tab toggle */}
              <div style={{
                display: "flex", borderRadius: 8, overflow: "hidden",
                border: "1px solid #1e1e28",
                marginBottom: 14,
              }}>
                <TabBtn
                  label="Deposit"
                  active={activeSection === "deposit"}
                  onClick={() => setActiveSection("deposit")}
                />
                <TabBtn
                  label="Withdraw"
                  active={activeSection === "withdraw"}
                  disabled={userShares === 0}
                  onClick={() => setActiveSection("withdraw")}
                />
              </div>

              {activeSection === "deposit" ? (
                <div>
                  {vaultEmpty && (
                    <div style={{
                      padding: "8px 10px", borderRadius: 6, marginBottom: 12,
                      background: "rgba(251,191,36,0.06)",
                      border: "1px solid rgba(251,191,36,0.15)",
                      fontSize: 10, color: "#fbbf24", lineHeight: 1.5,
                    }}>
                      This agent has no chips. Deposit to fund their bankroll and earn returns when they win.
                    </div>
                  )}

                  {/* Quick amount buttons */}
                  <div style={{
                    display: "flex", gap: 6, marginBottom: 10,
                  }}>
                    {QUICK_AMOUNTS.map((amt) => (
                      <button
                        key={amt}
                        onClick={() => setDepositAmount(String(amt))}
                        style={{
                          flex: 1, padding: "6px 0", borderRadius: 6,
                          background: depositAmount === String(amt) ? "rgba(30,92,58,0.2)" : "#0a0a12",
                          border: depositAmount === String(amt) ? "1px solid rgba(30,92,58,0.4)" : "1px solid #1a1a24",
                          color: depositAmount === String(amt) ? "#34d399" : "#5a5a68",
                          fontSize: 10, fontWeight: 700, cursor: "pointer",
                          transition: "all 0.15s",
                        }}
                      >
                        {formatCompact(amt)}
                      </button>
                    ))}
                  </div>

                  <div style={{ display: "flex", gap: 8 }}>
                    <input
                      type="number"
                      placeholder="Custom amount"
                      value={depositAmount}
                      onChange={(e) => setDepositAmount(e.target.value)}
                      style={{
                        flex: 1, background: "#0a0a12", border: "1px solid #1e1e28",
                        borderRadius: 8, padding: "10px 12px", color: "#e2e2e2",
                        fontSize: 13, outline: "none", minWidth: 0,
                        fontVariantNumeric: "tabular-nums",
                      }}
                    />
                    <button
                      onClick={handleDeposit}
                      disabled={txPending || pool.paused}
                      style={{
                        padding: "10px 20px", borderRadius: 8, border: "none",
                        background: txPending || pool.paused ? "#1a1a24" : "linear-gradient(135deg, #1e5c3a 0%, #1a7a42 100%)",
                        color: txPending || pool.paused ? "#3a3a48" : "#fff",
                        fontSize: 12, fontWeight: 800, cursor: txPending || pool.paused ? "not-allowed" : "pointer",
                        textTransform: "uppercase", letterSpacing: 0.5,
                        transition: "all 0.15s",
                        boxShadow: txPending || pool.paused ? "none" : "0 2px 8px rgba(30,92,58,0.3)",
                      }}
                    >
                      {txPending ? "..." : "Back"}
                    </button>
                  </div>

                  <div style={{ fontSize: 9, color: "#3a3a48", marginTop: 8, lineHeight: 1.5 }}>
                    You receive pool shares proportional to your deposit. {pool.feeBasisPoints > 0 ? `${pool.feeBasisPoints / 100}% fee applies.` : ""}
                  </div>
                </div>
              ) : (
                <div>
                  {/* Withdraw percentage */}
                  <div style={{ marginBottom: 12 }}>
                    <div style={{
                      display: "flex", justifyContent: "space-between", alignItems: "center",
                      marginBottom: 8,
                    }}>
                      <span style={{ fontSize: 11, color: "#8a8a95", fontWeight: 600 }}>
                        Withdraw {withdrawPct}%
                      </span>
                      <span style={{ fontSize: 10, color: "#4a4a55", fontVariantNumeric: "tabular-nums" }}>
                        ~{formatCompact(Math.floor(userValue * withdrawPct / 100 / DECIMALS))} CHIPS
                      </span>
                    </div>

                    {/* Percentage buttons */}
                    <div style={{ display: "flex", gap: 6 }}>
                      {[25, 50, 75, 100].map((pct) => (
                        <button
                          key={pct}
                          onClick={() => setWithdrawPct(pct)}
                          style={{
                            flex: 1, padding: "8px 0", borderRadius: 6,
                            background: withdrawPct === pct ? "rgba(248,113,113,0.1)" : "#0a0a12",
                            border: withdrawPct === pct ? "1px solid rgba(248,113,113,0.3)" : "1px solid #1a1a24",
                            color: withdrawPct === pct ? "#f87171" : "#5a5a68",
                            fontSize: 11, fontWeight: 700, cursor: "pointer",
                            transition: "all 0.15s",
                          }}
                        >
                          {pct}%
                        </button>
                      ))}
                    </div>
                  </div>

                  <button
                    onClick={handleWithdraw}
                    disabled={txPending}
                    style={{
                      width: "100%", padding: "10px 0", borderRadius: 8, border: "none",
                      background: txPending ? "#1a1a24" : "linear-gradient(135deg, #5c1e1e 0%, #7a2a2a 100%)",
                      color: txPending ? "#3a3a48" : "#fff",
                      fontSize: 12, fontWeight: 800, cursor: txPending ? "not-allowed" : "pointer",
                      textTransform: "uppercase", letterSpacing: 0.5,
                      transition: "all 0.15s",
                      boxShadow: txPending ? "none" : "0 2px 8px rgba(92,30,30,0.3)",
                    }}
                  >
                    {txPending ? "Processing..." : "Withdraw"}
                  </button>

                  {!agentOnline && (
                    <div style={{ fontSize: 9, color: "#4a4a55", marginTop: 8, lineHeight: 1.5 }}>
                      Agent is offline, but you can still withdraw your share of the pool.
                    </div>
                  )}
                </div>
              )}

              {error && (
                <div style={{
                  padding: "8px 10px", borderRadius: 6, marginTop: 10,
                  background: "rgba(248,113,113,0.08)",
                  border: "1px solid rgba(248,113,113,0.15)",
                  fontSize: 10, color: "#f87171",
                }}>
                  {error}
                </div>
              )}
            </div>
          ) : (
            <div style={{
              padding: "24px 18px", textAlign: "center",
            }}>
              <div style={{ fontSize: 12, color: "#5a5a68", fontWeight: 600, marginBottom: 4 }}>
                Connect your wallet to back this agent
              </div>
              <div style={{ fontSize: 10, color: "#3a3a48", lineHeight: 1.5 }}>
                Deposit CHIPS tokens to fund their bankroll and earn a share of their winnings.
              </div>
            </div>
          )}

          {pool.paused && (
            <div style={{
              padding: "8px 18px", background: "rgba(248,113,113,0.06)",
              borderTop: "1px solid rgba(248,113,113,0.15)",
              fontSize: 10, color: "#f87171", fontWeight: 700, textAlign: "center",
            }}>
              POOL PAUSED
            </div>
          )}
        </>
      )}
    </div>
  );
}

/* ── Sub-components ── */

function QuickStat({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div style={{
      padding: "8px 0", textAlign: "center", background: "#0e0e16",
    }}>
      <div style={{ fontSize: 8, color: "#3a3a48", fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5 }}>
        {label}
      </div>
      <div style={{ fontSize: 11, fontWeight: 800, color: color || "#8a8a95", fontVariantNumeric: "tabular-nums" }}>
        {value}
      </div>
    </div>
  );
}

function InfoBox({ label, value, unit }: { label: string; value: string; unit?: string }) {
  return (
    <div style={{
      padding: "8px 10px", borderRadius: 6,
      background: "#0a0a12", border: "1px solid #161620",
    }}>
      <div style={{ fontSize: 8, color: "#3a3a48", fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 2 }}>
        {label}
      </div>
      <div style={{ fontSize: 14, fontWeight: 800, color: "#c8c8c8", fontVariantNumeric: "tabular-nums" }}>
        {value}
        {unit && <span style={{ fontSize: 9, color: "#4a4a55", marginLeft: 3 }}>{unit}</span>}
      </div>
    </div>
  );
}

function TabBtn({ label, active, disabled, onClick }: { label: string; active: boolean; disabled?: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        flex: 1, padding: "8px 0", border: "none",
        background: active ? "#161620" : "transparent",
        color: disabled ? "#2a2a38" : active ? "#e2e2e2" : "#5a5a68",
        fontSize: 11, fontWeight: 700, cursor: disabled ? "not-allowed" : "pointer",
        transition: "all 0.15s",
      }}
    >
      {label}
    </button>
  );
}

function formatCompact(n: number): string {
  if (Math.abs(n) >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (Math.abs(n) >= 1_000) return `${(n / 1_000).toFixed(0)}K`;
  return n.toLocaleString();
}
