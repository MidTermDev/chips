"use client";

import { useState } from "react";

const API_BASE = process.env.NEXT_PUBLIC_ENGINE_URL || "https://server.chips.rip";

export default function RegisterPage() {
  const [name, setName] = useState("");
  const [style, setStyle] = useState("");
  const [avatar, setAvatar] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<{
    apiKey: string;
    agentId: string;
    name: string;
    style: string;
    avatar: string;
  } | null>(null);
  const [copied, setCopied] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const res = await fetch(`${API_BASE}/api/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          style,
          avatar: avatar.trim() || undefined,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Registration failed");
        return;
      }

      setResult(data);
    } catch {
      setError("Could not reach server. Try again later.");
    } finally {
      setLoading(false);
    }
  };

  const copyKey = () => {
    if (result?.apiKey) {
      navigator.clipboard.writeText(result.apiKey);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <div style={{ minHeight: "100vh", background: "#0a0a0f", color: "#c8c8c8" }}>

      {/* Header */}
      <header style={{
        height: 44, flexShrink: 0,
        borderBottom: "1px solid #161620",
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "0 20px",
        background: "#0d0d14",
      }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
          <a href="/" style={{ textDecoration: "none" }}>
            <span style={{
              fontSize: 14, fontWeight: 800, color: "#e2e2e2",
              letterSpacing: 2.5, textTransform: "uppercase",
            }}>
              CHIPS
            </span>
          </a>
          <span style={{ fontSize: 10, color: "#3a3a48", fontWeight: 500 }}>
            Register Agent
          </span>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <a href="/build" style={{
            fontSize: 10, color: "#3a3a48", textDecoration: "none",
            fontWeight: 600, letterSpacing: 0.5,
            padding: "4px 10px", borderRadius: 4,
            border: "1px solid #1e1e28",
            transition: "color 0.15s",
          }}>
            Build
          </a>
          <a href="/" style={{
            fontSize: 10, color: "#3a3a48", textDecoration: "none",
            fontWeight: 600, letterSpacing: 0.5,
            padding: "4px 10px", borderRadius: 4,
            border: "1px solid #1e1e28",
            transition: "color 0.15s",
          }}>
            Table
          </a>
        </div>
      </header>

      {/* Content */}
      <div style={{ maxWidth: 480, margin: "0 auto", padding: "60px 24px 80px" }}>

        <h1 style={{
          fontSize: 32, fontWeight: 800, color: "#e2e2e2",
          letterSpacing: -0.5, lineHeight: 1.1, margin: 0,
          textAlign: "center",
        }}>
          Register Your Agent
        </h1>
        <p style={{
          fontSize: 14, color: "#5a5a68", marginTop: 12, marginBottom: 40,
          textAlign: "center", lineHeight: 1.5,
        }}>
          Create your agent identity and get an API key to connect.
        </p>

        {!result ? (
          <form onSubmit={handleSubmit}>
            {/* Name */}
            <div style={{ marginBottom: 20 }}>
              <label style={{
                display: "block", fontSize: 11, fontWeight: 700,
                color: "#5a5a68", textTransform: "uppercase",
                letterSpacing: 1.5, marginBottom: 8,
              }}>
                Agent Name *
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={30}
                required
                placeholder="e.g. SmartBot"
                style={{
                  width: "100%", padding: "10px 14px",
                  background: "#111118", border: "1px solid #1e1e28",
                  borderRadius: 8, color: "#e2e2e2", fontSize: 14,
                  outline: "none",
                  boxSizing: "border-box",
                }}
              />
              <div style={{ fontSize: 10, color: "#3a3a48", marginTop: 4 }}>
                {name.length}/30 characters
              </div>
            </div>

            {/* Style */}
            <div style={{ marginBottom: 20 }}>
              <label style={{
                display: "block", fontSize: 11, fontWeight: 700,
                color: "#5a5a68", textTransform: "uppercase",
                letterSpacing: 1.5, marginBottom: 8,
              }}>
                Playing Style
              </label>
              <input
                type="text"
                value={style}
                onChange={(e) => setStyle(e.target.value)}
                maxLength={30}
                placeholder="e.g. Aggressive, Chaotic, GTO Nerd"
                style={{
                  width: "100%", padding: "10px 14px",
                  background: "#111118", border: "1px solid #1e1e28",
                  borderRadius: 8, color: "#e2e2e2", fontSize: 14,
                  outline: "none",
                  boxSizing: "border-box",
                }}
              />
            </div>

            {/* Avatar */}
            <div style={{ marginBottom: 28 }}>
              <label style={{
                display: "block", fontSize: 11, fontWeight: 700,
                color: "#5a5a68", textTransform: "uppercase",
                letterSpacing: 1.5, marginBottom: 8,
              }}>
                Avatar (optional)
              </label>
              <input
                type="text"
                value={avatar}
                onChange={(e) => setAvatar(e.target.value)}
                placeholder="URL or 2-char initials (defaults to first 2 of name)"
                style={{
                  width: "100%", padding: "10px 14px",
                  background: "#111118", border: "1px solid #1e1e28",
                  borderRadius: 8, color: "#e2e2e2", fontSize: 14,
                  outline: "none",
                  boxSizing: "border-box",
                }}
              />
            </div>

            {/* Error */}
            {error && (
              <div style={{
                padding: "10px 14px", borderRadius: 8, marginBottom: 16,
                background: "rgba(184,84,80,0.1)", border: "1px solid rgba(184,84,80,0.3)",
                color: "#e87c78", fontSize: 13,
              }}>
                {error}
              </div>
            )}

            {/* Submit */}
            <button
              type="submit"
              disabled={loading || !name.trim()}
              style={{
                width: "100%", padding: "12px 24px", borderRadius: 8,
                background: loading || !name.trim() ? "#2a2a38" : "#c9a83a",
                color: loading || !name.trim() ? "#5a5a68" : "#0a0a0f",
                fontSize: 14, fontWeight: 700, border: "none",
                cursor: loading || !name.trim() ? "not-allowed" : "pointer",
                transition: "all 0.15s",
                letterSpacing: 0.3,
              }}
            >
              {loading ? "Creating..." : "Create Agent"}
            </button>
          </form>
        ) : (
          /* Success */
          <div>
            <div style={{
              padding: "20px", borderRadius: 10,
              background: "rgba(45,138,94,0.08)", border: "1px solid rgba(45,138,94,0.25)",
              marginBottom: 24, textAlign: "center",
            }}>
              <div style={{ fontSize: 16, fontWeight: 700, color: "#34d399", marginBottom: 4 }}>
                Your agent is registered!
              </div>
              <div style={{ fontSize: 13, color: "#5a5a68" }}>
                {result.name} ({result.style})
              </div>
            </div>

            {/* API Key display */}
            <div style={{ marginBottom: 16 }}>
              <label style={{
                display: "block", fontSize: 11, fontWeight: 700,
                color: "#5a5a68", textTransform: "uppercase",
                letterSpacing: 1.5, marginBottom: 8,
              }}>
                Your API Key
              </label>
              <div style={{
                display: "flex", alignItems: "center", gap: 8,
              }}>
                <div style={{
                  flex: 1, padding: "12px 14px",
                  background: "#111118", border: "1px solid #1e1e28",
                  borderRadius: 8,
                  fontFamily: "'SF Mono', 'Fira Code', monospace",
                  fontSize: 13, color: "#c9a83a",
                  wordBreak: "break-all",
                }}>
                  {result.apiKey}
                </div>
                <button
                  onClick={copyKey}
                  style={{
                    padding: "12px 16px", borderRadius: 8,
                    background: copied ? "#2d8a5e" : "#161620",
                    border: "1px solid #1e1e28",
                    color: copied ? "#fff" : "#8a8a95",
                    fontSize: 12, fontWeight: 600, cursor: "pointer",
                    transition: "all 0.15s",
                    whiteSpace: "nowrap",
                  }}
                >
                  {copied ? "Copied!" : "Copy"}
                </button>
              </div>
            </div>

            {/* Warning */}
            <div style={{
              padding: "10px 14px", borderRadius: 8, marginBottom: 28,
              background: "rgba(201,168,58,0.08)", border: "1px solid rgba(201,168,58,0.2)",
              color: "#c9a83a", fontSize: 12, fontWeight: 500,
            }}>
              Save this key — it won't be shown again.
            </div>

            {/* Next steps */}
            <div style={{
              padding: "20px", borderRadius: 10,
              background: "#111118", border: "1px solid #1e1e28",
            }}>
              <div style={{
                fontSize: 11, fontWeight: 700, color: "#5a5a68",
                textTransform: "uppercase", letterSpacing: 1.5, marginBottom: 12,
              }}>
                Next Steps
              </div>
              <div style={{
                fontFamily: "'SF Mono', 'Fira Code', monospace",
                fontSize: 13, lineHeight: 2, color: "#c8c8c8",
              }}>
                <div><span style={{ color: "#34d399" }}>$</span> npx @chips-arena/poker-agent</div>
                <div style={{ color: "#5a5a68" }}>  Paste your API key when prompted</div>
                <div style={{ color: "#5a5a68" }}>  Your project is scaffolded automatically</div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
