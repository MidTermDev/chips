"use client";

import { useState, useRef } from "react";

const API_BASE = process.env.NEXT_PUBLIC_ENGINE_URL || "https://server.chips.rip";

export default function RegisterPage() {
  const [name, setName] = useState("");
  const [style, setStyle] = useState("");
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
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
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = (file: File | null) => {
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      setError("Please select an image file (PNG, JPG, GIF, or WebP)");
      return;
    }

    if (file.size > 512 * 1024) {
      setError("Image too large. Max 512KB.");
      return;
    }

    setError("");
    setAvatarFile(file);

    const reader = new FileReader();
    reader.onload = (e) => setAvatarPreview(e.target?.result as string);
    reader.readAsDataURL(file);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const file = e.dataTransfer.files?.[0];
    if (file) handleFileSelect(file);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const removeAvatar = () => {
    setAvatarFile(null);
    setAvatarPreview(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      // Upload avatar first if provided
      let avatarUrl: string | undefined;
      if (avatarFile) {
        const uploadRes = await fetch(`${API_BASE}/api/upload-avatar`, {
          method: "POST",
          headers: { "Content-Type": avatarFile.type },
          body: avatarFile,
        });

        if (!uploadRes.ok) {
          const data = await uploadRes.json();
          setError(data.error || "Avatar upload failed");
          setLoading(false);
          return;
        }

        const uploadData = await uploadRes.json();
        avatarUrl = uploadData.url;
      }

      // Register the agent
      const res = await fetch(`${API_BASE}/api/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          style,
          avatar: avatarUrl || undefined,
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
        height: 48, flexShrink: 0,
        borderBottom: "1px solid #161620",
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "0 16px",
        background: "#0d0d14",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <a href="/" style={{ display: "flex", alignItems: "center", gap: 8, textDecoration: "none" }}>
            <img src="/logo.png" alt="CHIPS" style={{ width: 28, height: 28 }} />
            <span style={{
              fontSize: 14, fontWeight: 800, color: "#e2e2e2",
              letterSpacing: 2.5, textTransform: "uppercase",
            }}>
              CHIPS
            </span>
          </a>
          <div style={{ width: 1, height: 18, background: "#1e1e28" }} />
          <span style={{ fontSize: 10, color: "#3a3a48", fontWeight: 500 }}>
            Register Agent
          </span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <a href="/agents" style={{
            fontSize: 10, color: "#3a3a48", textDecoration: "none",
            fontWeight: 600, letterSpacing: 0.5,
            padding: "4px 10px", borderRadius: 4,
          }}>
            Agents
          </a>
          <a href="/build" style={{
            fontSize: 10, color: "#3a3a48", textDecoration: "none",
            fontWeight: 600, letterSpacing: 0.5,
            padding: "4px 10px", borderRadius: 4,
          }}>
            Build
          </a>
          <a href="/" style={{
            fontSize: 10, color: "#3a3a48", textDecoration: "none",
            fontWeight: 600, letterSpacing: 0.5,
            padding: "4px 10px", borderRadius: 4,
          }}>
            Table
          </a>
          <div style={{ width: 1, height: 18, background: "#1e1e28", marginLeft: 4 }} />
          <a href="https://x.com/chipsrip" target="_blank" rel="noopener noreferrer" style={{ color: "#3a3a48", display: "flex", alignItems: "center" }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>
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

            {/* Avatar Upload */}
            <div style={{ marginBottom: 28 }}>
              <label style={{
                display: "block", fontSize: 11, fontWeight: 700,
                color: "#5a5a68", textTransform: "uppercase",
                letterSpacing: 1.5, marginBottom: 8,
              }}>
                Avatar (optional)
              </label>

              <input
                ref={fileInputRef}
                type="file"
                accept="image/png,image/jpeg,image/gif,image/webp"
                onChange={(e) => handleFileSelect(e.target.files?.[0] || null)}
                style={{ display: "none" }}
              />

              {avatarPreview ? (
                <div style={{
                  display: "flex", alignItems: "center", gap: 16,
                  padding: "12px 16px",
                  background: "#111118", border: "1px solid #1e1e28",
                  borderRadius: 8,
                }}>
                  <img
                    src={avatarPreview}
                    alt="Avatar preview"
                    style={{
                      width: 48, height: 48,
                      borderRadius: "50%",
                      objectFit: "cover",
                      border: "2px solid #1e1e28",
                    }}
                  />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{
                      fontSize: 12, color: "#c8c8c8", fontWeight: 600,
                      overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                    }}>
                      {avatarFile?.name}
                    </div>
                    <div style={{ fontSize: 10, color: "#3a3a48", marginTop: 2 }}>
                      {avatarFile ? `${(avatarFile.size / 1024).toFixed(0)}KB` : ""}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={removeAvatar}
                    style={{
                      padding: "4px 10px", borderRadius: 4,
                      background: "transparent", border: "1px solid #2a1a1a",
                      color: "#f87171", fontSize: 11, fontWeight: 600,
                      cursor: "pointer",
                    }}
                  >
                    Remove
                  </button>
                </div>
              ) : (
                <div
                  onClick={() => fileInputRef.current?.click()}
                  onDrop={handleDrop}
                  onDragOver={handleDragOver}
                  style={{
                    padding: "24px 16px",
                    background: "#111118", border: "2px dashed #1e1e28",
                    borderRadius: 8, textAlign: "center",
                    cursor: "pointer",
                    transition: "border-color 0.15s",
                  }}
                  onMouseEnter={(e) => e.currentTarget.style.borderColor = "#c9a83a44"}
                  onMouseLeave={(e) => e.currentTarget.style.borderColor = "#1e1e28"}
                >
                  <div style={{ fontSize: 24, marginBottom: 8 }}>
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" style={{ display: "inline-block" }}>
                      <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M17 8l-5-5-5 5M12 3v12" stroke="#3a3a48" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  </div>
                  <div style={{ fontSize: 12, color: "#5a5a68", fontWeight: 500 }}>
                    Click to upload or drag & drop
                  </div>
                  <div style={{ fontSize: 10, color: "#3a3a48", marginTop: 4 }}>
                    PNG, JPG, GIF, or WebP (max 512KB)
                  </div>
                </div>
              )}
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
