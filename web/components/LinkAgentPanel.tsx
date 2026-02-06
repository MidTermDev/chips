"use client";

import { useState } from "react";

interface Props {
  onClose: () => void;
}

function getServerHttpUrl(): string {
  const wsUrl = process.env.NEXT_PUBLIC_WS_URL || "ws://localhost:8081";
  return wsUrl.replace(/^wss:/, "https:").replace(/^ws:/, "http:");
}

export default function LinkAgentPanel({ onClose }: Props) {
  const [key, setKey] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [result, setResult] = useState<{ agentId: string; seat: number } | null>(null);
  const [errorMsg, setErrorMsg] = useState("");

  const handleVerify = async () => {
    const trimmed = key.trim().toUpperCase();
    if (!trimmed || trimmed.length !== 6) {
      setErrorMsg("Enter a 6-character verification key");
      setStatus("error");
      return;
    }

    setStatus("loading");
    setErrorMsg("");

    try {
      const serverUrl = getServerHttpUrl();
      const res = await fetch(`${serverUrl}/api/verify`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: trimmed }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({ error: "Request failed" }));
        throw new Error(data.error || "Verification failed");
      }

      const data = await res.json();
      setResult({ agentId: data.agentId, seat: data.seat });
      setStatus("success");
    } catch (e: any) {
      setErrorMsg(e.message || "Verification failed");
      setStatus("error");
    }
  };

  return (
    <div style={panelStyle}>
      {/* Header */}
      <div style={{
        display: "flex", justifyContent: "space-between", alignItems: "center",
        padding: "10px 14px", borderBottom: "1px solid #1a1a24",
      }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: "#e2e2e2" }}>
          Link Agent
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

      <div style={{ padding: "14px" }}>
        {status === "success" && result ? (
          <div>
            <div style={{
              fontSize: 11, fontWeight: 700, color: "#34d399",
              marginBottom: 8,
            }}>
              Agent verified!
            </div>
            <div style={{ fontSize: 10, color: "#8a8a95", marginBottom: 4 }}>
              Agent <span style={{ color: "#e2e2e2", fontWeight: 600 }}>{result.agentId}</span> at Seat {result.seat}
            </div>
            <div style={{ fontSize: 10, color: "#4a4a55", marginTop: 12 }}>
              Deposit CHIPS to the agent's vault to start playing.
            </div>
          </div>
        ) : (
          <>
            <div style={{ fontSize: 10, color: "#4a4a55", marginBottom: 10 }}>
              Enter the 6-character key your agent received on connect.
            </div>

            <div style={{ display: "flex", gap: 6 }}>
              <input
                type="text"
                placeholder="ABC123"
                value={key}
                onChange={(e) => {
                  setKey(e.target.value.toUpperCase().slice(0, 6));
                  if (status === "error") setStatus("idle");
                }}
                onKeyDown={(e) => e.key === "Enter" && handleVerify()}
                maxLength={6}
                style={{
                  ...inputStyle,
                  letterSpacing: 4,
                  textAlign: "center",
                  fontWeight: 700,
                  fontSize: 14,
                  textTransform: "uppercase",
                }}
              />
              <button
                onClick={handleVerify}
                disabled={status === "loading"}
                style={{
                  ...btnStyle,
                  background: status === "loading" ? "#1a1a24" : "#1e5c3a",
                  color: status === "loading" ? "#3a3a48" : "#34d399",
                  opacity: status === "loading" ? 0.5 : 1,
                }}
              >
                {status === "loading" ? "..." : "Verify"}
              </button>
            </div>

            {status === "error" && errorMsg && (
              <div style={{ fontSize: 10, color: "#f87171", marginTop: 8 }}>
                {errorMsg}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

const panelStyle: React.CSSProperties = {
  background: "#0e0e16",
  overflow: "hidden",
  width: "100%",
};

const inputStyle: React.CSSProperties = {
  flex: 1,
  background: "#0a0a12",
  border: "1px solid #1a1a24",
  borderRadius: 4,
  padding: "8px 10px",
  color: "#c8c8c8",
  fontSize: 11,
  outline: "none",
  minWidth: 0,
};

const btnStyle: React.CSSProperties = {
  border: "none",
  borderRadius: 4,
  padding: "8px 14px",
  fontSize: 10,
  fontWeight: 700,
  textTransform: "uppercase",
  letterSpacing: 0.5,
  cursor: "pointer",
  whiteSpace: "nowrap",
  transition: "opacity 0.15s",
};
