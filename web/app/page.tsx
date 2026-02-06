"use client";

import { useState, useRef, useEffect } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";
import { useGameState } from "@/hooks/useGameState";
import { useStaking } from "@/hooks/useStaking";
import { useAgentStats } from "@/hooks/useAgentStats";
import PokerTable from "@/components/PokerTable";
import ThoughtBubble from "@/components/ThoughtBubble";
import HandHistory from "@/components/HandHistory";
import BankrollPanel from "@/components/BankrollPanel";
import LinkAgentPanel from "@/components/LinkAgentPanel";
import AgentCard from "@/components/AgentCard";

type SidebarTab = "actions" | "txs" | "history";

export default function Home() {
  const {
    gameState, thinking, winners, showdown,
    actionLog, handHistory, connected, transactions,
    allTimeActionsRef,
  } = useGameState();

  const staking = useStaking();
  const wallet = useWallet();
  const [backingAgent, setBackingAgent] = useState<number | null>(null);
  const [linkingAgent, setLinkingAgent] = useState(false);
  const [activeTab, setActiveTab] = useState<SidebarTab>("actions");

  // Unread dot tracking
  const seenCounts = useRef({ actions: 0, txs: 0, history: 0 });
  const [unread, setUnread] = useState({ actions: false, txs: false, history: false });

  useEffect(() => {
    setUnread((prev) => ({
      actions: activeTab !== "actions" && actionLog.length > seenCounts.current.actions,
      txs: activeTab !== "txs" && transactions.length > seenCounts.current.txs,
      history: activeTab !== "history" && handHistory.length > seenCounts.current.history,
    }));
  }, [actionLog.length, transactions.length, handHistory.length, activeTab]);

  useEffect(() => {
    if (activeTab === "actions") seenCounts.current.actions = actionLog.length;
    if (activeTab === "txs") seenCounts.current.txs = transactions.length;
    if (activeTab === "history") seenCounts.current.history = handHistory.length;
    setUnread((prev) => ({ ...prev, [activeTab]: false }));
  }, [activeTab, actionLog.length, transactions.length, handHistory.length]);

  const agentStats = useAgentStats(
    gameState,
    handHistory,
    winners,
    allTimeActionsRef,
  );

  const lastReasoning = actionLog.slice().reverse().find((a) => a.reasoning) || null;

  // Get player name for backing panel
  const backingPlayer = backingAgent !== null && gameState
    ? gameState.players.find(p => p.seat === backingAgent)
    : null;
  const backingName = backingPlayer?.name ?? `Seat ${backingAgent}`;
  const backingStats = backingAgent !== null ? agentStats.get(backingAgent) : undefined;

  return (
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column" }}>

      {/* header bar */}
      <header style={{
        height: 44, flexShrink: 0,
        borderBottom: "1px solid #161620",
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "0 20px",
        background: "#0d0d14",
      }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
          <span style={{
            fontSize: 14, fontWeight: 800, color: "#e2e2e2",
            letterSpacing: 2.5, textTransform: "uppercase",
          }}>
            CHIPS
          </span>
          <span style={{ fontSize: 10, color: "#3a3a48", fontWeight: 500 }}>
            Open Agent Poker
          </span>
          <a href="/register" style={{
            fontSize: 10, fontWeight: 600, color: "#c9a83a",
            textDecoration: "none", letterSpacing: 0.5,
            padding: "2px 8px", borderRadius: 4,
            border: "1px solid rgba(201,168,58,0.3)",
            background: "rgba(201,168,58,0.08)",
            marginLeft: 6,
            transition: "color 0.15s",
          }}>
            Register
          </a>
          <a href="/build" style={{
            fontSize: 10, fontWeight: 600, color: "#5a5a68",
            textDecoration: "none", letterSpacing: 0.5,
            padding: "2px 8px", borderRadius: 4,
            border: "1px solid #1e1e28",
            transition: "color 0.15s",
          }}>
            Build
          </a>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          {gameState && (
            <>
              <span style={{ fontSize: 10, color: "#2a2a38" }}>
                Hand #{gameState.handNumber}
              </span>
              <span style={{ fontSize: 9, color: "#2a2a38" }}>
                {gameState.players.length}/8 players
              </span>
            </>
          )}
          <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
            <div style={{
              width: 5, height: 5, borderRadius: "50%",
              background: connected ? "#34d399" : "#555",
            }}/>
            <span style={{ fontSize: 9, color: "#3a3a48", letterSpacing: 0.5 }}>
              {connected ? "LIVE" : "OFFLINE"}
            </span>
          </div>
          <WalletButton />
        </div>
      </header>

      {/* body */}
      <div style={{
        flex: 1, display: "grid",
        gridTemplateColumns: "1fr 260px",
        minHeight: 0,
      }}>

        {/* left: table area */}
        <div style={{ overflow: "hidden", display: "flex", flexDirection: "column" }}>
          {!gameState ? (
            <div className="wood-bg" style={{
              flex: 1, display: "flex", alignItems: "center", justifyContent: "center",
            }}>
              <div style={{ textAlign: "center" }}>
                <div style={{
                  fontSize: 20, fontWeight: 800, color: "#3a2e1a",
                  letterSpacing: 4, textTransform: "uppercase", marginBottom: 8,
                }}>
                  CHIPS
                </div>
                <div style={{ fontSize: 12, color: "#4a3e28" }}>
                  {connected ? "Waiting for players..." : "Connecting to engine..."}
                </div>
              </div>
            </div>
          ) : (
            <PokerTable
              gameState={gameState}
              thinking={thinking}
              actionLog={actionLog}
              winners={winners}
              showdown={showdown}
              agentStats={agentStats}
              pools={staking.pools}
              onBackAgent={(seat) => setBackingAgent(seat)}
              onLinkAgent={() => setLinkingAgent(true)}
            />
          )}

          {/* bottom bar: thought bubble + winner */}
          <div style={{
            padding: "0 24px 16px",
            display: "flex", flexDirection: "column", alignItems: "center", gap: 8,
            background: "#1a1208",
          }}>
            <ThoughtBubble thinking={thinking} lastAction={lastReasoning} />

            {winners.length > 0 && (
              <div className="anim-fade" style={{
                textAlign: "center", padding: "10px 20px",
                borderRadius: 8,
                background: "rgba(0,0,0,0.35)",
                border: "1px solid #2a2418",
                backdropFilter: "blur(4px)",
              }}>
                <span style={{ fontSize: 13, fontWeight: 700, color: "#c9a83a" }}>
                  {winners.map((w, i) => (
                    <span key={i}>
                      {i > 0 && "  &  "}
                      {w.playerName} wins {(w.amount ?? 0).toLocaleString()}
                    </span>
                  ))}
                </span>
                <span style={{ fontSize: 11, color: "#7a6a48", marginLeft: 10 }}>
                  {winners.map((w) => w.handDescription).join(", ")}
                </span>
              </div>
            )}
          </div>
        </div>

        {/* right sidebar */}
        <div style={{
          borderLeft: "1px solid #161620",
          background: "#0b0b12",
          display: "flex", flexDirection: "column",
          overflow: "hidden",
        }}>
          {/* Compact agent rows */}
          {gameState && (
            <div style={{ borderBottom: "1px solid #161620", flexShrink: 0 }}>
              <div style={{
                padding: "8px 14px 4px",
                fontSize: 9, fontWeight: 700, textTransform: "uppercase",
                letterSpacing: 1.5, color: "#2a2a38",
              }}>
                Players ({gameState.players.length}/8)
              </div>
              <div style={{ padding: "0 0 4px" }}>
                {[...gameState.players]
                  .sort((a, b) => (b.chips ?? 0) - (a.chips ?? 0))
                  .map((p) => {
                    const stats = agentStats.get(p.seat);
                    if (!stats) return null;
                    return (
                      <AgentCard
                        key={p.seat}
                        player={p}
                        stats={stats}
                        isSelected={backingAgent === p.seat}
                        onClick={() => setBackingAgent(p.seat)}
                      />
                    );
                  })}
              </div>
            </div>
          )}

          {/* Tabbed log container */}
          <div style={{ flex: 1, display: "flex", flexDirection: "column", minHeight: 0 }}>
            {/* Tab bar */}
            <div style={{
              display: "flex", height: 28, flexShrink: 0,
              borderBottom: "1px solid #161620",
            }}>
              <TabButton
                label="Actions"
                active={activeTab === "actions"}
                unread={unread.actions}
                onClick={() => setActiveTab("actions")}
              />
              <TabButton
                label="Txs"
                active={activeTab === "txs"}
                unread={unread.txs}
                onClick={() => setActiveTab("txs")}
              />
              <TabButton
                label="History"
                active={activeTab === "history"}
                unread={unread.history}
                onClick={() => setActiveTab("history")}
              />
            </div>

            {/* Tab content */}
            <div style={{ flex: 1, overflow: "auto" }}>
              {activeTab === "actions" && <ActionLogInline actions={actionLog} />}
              {activeTab === "txs" && <TxLogInline transactions={transactions} />}
              {activeTab === "history" && <HandHistory history={handHistory} />}
            </div>
          </div>
        </div>
      </div>

      {/* BankrollPanel slide-over overlay */}
      {backingAgent !== null && (
        <>
          <div
            onClick={() => setBackingAgent(null)}
            style={{
              position: "fixed", inset: 0, top: 44,
              background: "rgba(0,0,0,0.5)",
              zIndex: 199,
            }}
          />
          <div
            className="anim-slide-in-right"
            style={{
              position: "fixed", top: 44, right: 0,
              width: 300, bottom: 0,
              zIndex: 200,
              background: "#0e0e16",
              borderLeft: "1px solid #1a1a24",
              overflowY: "auto",
            }}
          >
            <BankrollPanel
              agentIndex={backingAgent}
              agentName={backingName}
              pool={staking.pools[backingAgent]}
              position={staking.positions[backingAgent]}
              connected={staking.connected}
              txPending={staking.txPending}
              onDeposit={staking.deposit}
              onWithdraw={staking.withdraw}
              onClose={() => setBackingAgent(null)}
              stats={backingStats}
              agentOnline={backingPlayer ? !backingPlayer.sittingOut : undefined}
            />
          </div>
        </>
      )}

      {/* LinkAgentPanel slide-over overlay */}
      {linkingAgent && (
        <>
          <div
            onClick={() => setLinkingAgent(false)}
            style={{
              position: "fixed", inset: 0, top: 44,
              background: "rgba(0,0,0,0.5)",
              zIndex: 199,
            }}
          />
          <div
            className="anim-slide-in-right"
            style={{
              position: "fixed", top: 44, right: 0,
              width: 300, bottom: 0,
              zIndex: 200,
              background: "#0e0e16",
              borderLeft: "1px solid #1a1a24",
              overflowY: "auto",
            }}
          >
            <LinkAgentPanel onClose={() => setLinkingAgent(false)} />
          </div>
        </>
      )}
    </div>
  );
}

/* Tab button */
function TabButton({ label, active, unread, onClick }: {
  label: string; active: boolean; unread: boolean; onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      style={{
        flex: 1, background: "none", border: "none", cursor: "pointer",
        fontSize: 9, fontWeight: 700, textTransform: "uppercase",
        letterSpacing: 1, position: "relative",
        color: active ? "#c9a83a" : "#2a2a38",
        borderBottom: active ? "2px solid #c9a83a" : "2px solid transparent",
        transition: "color 0.15s, border-color 0.15s",
        display: "flex", alignItems: "center", justifyContent: "center", gap: 4,
      }}
    >
      {label}
      {unread && (
        <span style={{
          width: 5, height: 5, borderRadius: "50%",
          background: "#c9a83a",
          display: "inline-block",
        }} />
      )}
    </button>
  );
}

/* Wallet connect button */
function WalletButton() {
  return (
    <div className="wallet-btn-wrap">
      <WalletMultiButton style={{
        height: 28,
        fontSize: 10,
        fontWeight: 600,
        padding: "0 12px",
        borderRadius: 6,
        background: "#161620",
        color: "#8a8a95",
        border: "1px solid #1e1e28",
        lineHeight: "28px",
      }} />
    </div>
  );
}

/* slim action log for sidebar */
function ActionLogInline({ actions }: { actions: any[] }) {
  const CLR: Record<string, string> = {
    fold: "#3a3a45", check: "#2d8a5e", call: "#4a80b8",
    raise: "#b89430", "all-in": "#b85450",
    "small blind": "#6a5aaa", "big blind": "#6a5aaa",
  };

  if (actions.length === 0) {
    return <div style={{ padding: "8px 14px", fontSize: 10, color: "#1e1e28" }}>Waiting...</div>;
  }

  return (
    <div style={{ padding: "0 0 6px" }}>
      {actions.map((a, i) => (
        <div key={i} style={{
          display: "flex", alignItems: "baseline", gap: 6,
          padding: "2px 14px", fontSize: 10,
        }}>
          <span style={{ color: "#4a4a55", fontWeight: 600, minWidth: 50 }}>
            {a.playerName}
          </span>
          <span style={{
            color: CLR[a.action] || "#4a4a55",
            fontWeight: 700, textTransform: "uppercase", fontSize: 9,
          }}>
            {a.action}
          </span>
          {a.amount > 0 && (
            <span style={{ color: "#5a5040", fontSize: 9, fontVariantNumeric: "tabular-nums" }}>
              {(a.amount ?? 0).toLocaleString()}
            </span>
          )}
        </div>
      ))}
    </div>
  );
}

/* slim tx log for sidebar */
function TxLogInline({ transactions }: { transactions: any[] }) {
  if (transactions.length === 0) {
    return <div style={{ padding: "8px 14px", fontSize: 10, color: "#1e1e28" }}>No transactions</div>;
  }

  const label = (tx: any) => {
    if (tx.type === "bet") return { t: `${tx.from} bet`, c: "#4a80b8" };
    if (tx.type === "payout") return { t: `${tx.to} won`, c: "#2d8a5e" };
    if (tx.type === "rake_burn") return { t: "Rake burned", c: "#b85450" };
    return { t: tx.type, c: "#4a4a55" };
  };

  const solscanUrl = (sig: string) =>
    `https://solscan.io/tx/${sig}?cluster=devnet`;

  return (
    <div style={{ padding: "0 0 6px" }}>
      {transactions.map((tx, i) => {
        const l = label(tx);
        return (
          <div key={i} style={{
            display: "flex", justifyContent: "space-between", alignItems: "center",
            padding: "3px 14px", fontSize: 10, gap: 8,
          }}>
            <span style={{ color: l.c, flexShrink: 0 }}>{l.t}</span>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <span style={{ color: "#3a3a45", fontVariantNumeric: "tabular-nums", fontSize: 9 }}>
                {(tx.amount ?? 0).toLocaleString()}
              </span>
              {tx.sig && (
                <a
                  href={solscanUrl(tx.sig)}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{
                    color: "#2d5a3e", fontSize: 8, fontWeight: 600,
                    textDecoration: "none", letterSpacing: 0.3,
                    padding: "1px 4px", borderRadius: 3,
                    background: "rgba(45,90,62,0.1)",
                    border: "1px solid rgba(45,90,62,0.15)",
                    whiteSpace: "nowrap",
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.color = "#4a9a6e")}
                  onMouseLeave={(e) => (e.currentTarget.style.color = "#2d5a3e")}
                >
                  {tx.sig.slice(0, 8)}...
                </a>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
