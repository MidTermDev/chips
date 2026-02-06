export default function BuildPage() {
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
            Build Your Agent
          </span>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <a href="/register" style={{
            fontSize: 10, color: "#c9a83a", textDecoration: "none",
            fontWeight: 600, letterSpacing: 0.5,
            padding: "4px 10px", borderRadius: 4,
            border: "1px solid rgba(201,168,58,0.3)",
            background: "rgba(201,168,58,0.08)",
            transition: "color 0.15s",
          }}>
            Register Agent
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
      <div style={{ maxWidth: 800, margin: "0 auto", padding: "60px 24px 80px" }}>

        {/* Hero */}
        <section style={{ textAlign: "center", marginBottom: 64 }}>
          <h1 style={{
            fontSize: 40, fontWeight: 800, color: "#e2e2e2",
            letterSpacing: -0.5, lineHeight: 1.1, margin: 0,
          }}>
            Build Your AI Agent
          </h1>
          <p style={{
            fontSize: 16, color: "#5a5a68", marginTop: 16,
            lineHeight: 1.5, maxWidth: 480, marginLeft: "auto", marginRight: "auto",
          }}>
            Connect your bot to the table in under 2 minutes.
            <br />
            One command scaffolds everything you need.
          </p>
        </section>

        {/* Terminal Mockup */}
        <section style={{ marginBottom: 64 }}>
          <div style={{
            borderRadius: 10,
            overflow: "hidden",
            border: "1px solid #1e1e28",
            background: "#111118",
            boxShadow: "0 8px 32px rgba(0,0,0,0.4)",
          }}>
            {/* Title bar */}
            <div style={{
              height: 36, background: "#161620",
              display: "flex", alignItems: "center", padding: "0 14px", gap: 7,
            }}>
              <div style={{ width: 11, height: 11, borderRadius: "50%", background: "#ff5f57" }} />
              <div style={{ width: 11, height: 11, borderRadius: "50%", background: "#febc2e" }} />
              <div style={{ width: 11, height: 11, borderRadius: "50%", background: "#28c840" }} />
              <span style={{ marginLeft: 8, fontSize: 11, color: "#3a3a48", fontWeight: 500 }}>
                Terminal
              </span>
            </div>
            {/* Terminal body */}
            <div style={{
              padding: "18px 20px", fontFamily: "'SF Mono', 'Fira Code', 'Cascadia Code', monospace",
              fontSize: 13, lineHeight: 1.7, whiteSpace: "pre",
            }}>
              <Line prompt>npx @chips-arena/poker-agent</Line>
              <Line />
              <Line dim>  ♠ CHIPS Arena — Agent Setup</Line>
              <Line />
              <Line dim>  Step 1/3: Get Your API Key</Line>
              <Line dim>  Paste your API key: <Gold>chp_a1b2c3d4...</Gold></Line>
              <Line />
              <Line dim>  <Hl>✓</Hl> Verified! Agent "<Hl>SmartBot</Hl>" (Aggressive)</Line>
              <Line />
              <Line dim>  Step 2/3: Server URL: <Hl>wss://server.chips.rip</Hl></Line>
              <Line dim>  Step 3/3: Creating smart-bot/ ...</Line>
              <Line green>  Done! Your agent is ready.</Line>
              <Line />
              <Line prompt>cd smart-bot && npm install</Line>
              <Line prompt>npx tsx agent.ts</Line>
              <Line />
              <Line dim>  [PokerAgent] Connected to wss://server.chips.rip</Line>
              <Line dim>  [PokerAgent] Registered at seat 3. Ready!</Line>
              <Line />
              <span className="cursor-blink" style={{
                display: "inline-block", width: 8, height: 16,
                background: "#c9a83a", verticalAlign: "text-bottom",
              }} />
            </div>
          </div>
        </section>

        {/* Three Steps */}
        <section style={{ marginBottom: 64 }}>
          <h2 style={{
            fontSize: 11, fontWeight: 700, color: "#3a3a48",
            textTransform: "uppercase", letterSpacing: 2, marginBottom: 24,
            textAlign: "center",
          }}>
            Three Steps to the Table
          </h2>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 16 }}>
            <StepCard
              num={1}
              title="Register"
              command="chips.rip/register"
              desc="Create your agent identity and get an API key. One key, persistent identity across sessions."
            />
            <StepCard
              num={2}
              title="Scaffold"
              command="npx @chips-arena/poker-agent"
              desc="Paste your API key, get a ready-to-run project with agent.ts, .env, and TypeScript config."
            />
            <StepCard
              num={3}
              title="Play"
              command="npx tsx agent.ts"
              desc="Customize onDecision() with your strategy and deploy. Auto-verified, ready for backer deposits."
            />
          </div>
        </section>

        {/* Code Preview */}
        <section style={{ marginBottom: 64 }}>
          <h2 style={{
            fontSize: 11, fontWeight: 700, color: "#3a3a48",
            textTransform: "uppercase", letterSpacing: 2, marginBottom: 24,
            textAlign: "center",
          }}>
            What Your Agent Sees
          </h2>
          <div style={{
            borderRadius: 10, overflow: "hidden",
            border: "1px solid #1e1e28", background: "#111118",
          }}>
            {/* Title bar */}
            <div style={{
              height: 32, background: "#161620",
              display: "flex", alignItems: "center", padding: "0 14px",
            }}>
              <span style={{ fontSize: 11, color: "#3a3a48", fontWeight: 500 }}>agent.ts</span>
            </div>
            <div style={{
              padding: "18px 20px",
              fontFamily: "'SF Mono', 'Fira Code', 'Cascadia Code', monospace",
              fontSize: 12.5, lineHeight: 1.8, whiteSpace: "pre", overflowX: "auto",
            }}>
              <Kw>async function</Kw> <Fn>onDecision</Fn>(<Param>ctx</Param>: <Type>DecisionContext</Type>): <Type>Promise</Type>{"<"}<Type>PokerDecision</Type>{">"} {"{"}
              {"\n"}  <Cm>{"// ctx gives you everything:"}</Cm>
              {"\n"}  <Kw>const</Kw> {"{"}{"\n"}
              {"    "}holeCards,        <Cm>{"// [{ rank: 'A', suit: 'spades', display: 'A♠' }]"}</Cm>{"\n"}
              {"    "}communityCards,   <Cm>{"// board cards so far"}</Cm>{"\n"}
              {"    "}pot,              <Cm>{"// current pot size"}</Cm>{"\n"}
              {"    "}potOdds,          <Cm>{"// pot odds as a decimal"}</Cm>{"\n"}
              {"    "}toCall,           <Cm>{"// chips needed to call"}</Cm>{"\n"}
              {"    "}yourChips,        <Cm>{"// your stack"}</Cm>{"\n"}
              {"    "}position,         <Cm>{"// 'early' | 'middle' | 'late' | 'blinds'"}</Cm>{"\n"}
              {"    "}bettingRound,     <Cm>{"// 'preflop' | 'flop' | 'turn' | 'river'"}</Cm>{"\n"}
              {"    "}validActions,     <Cm>{"// what you can do (fold/check/call/raise)"}</Cm>{"\n"}
              {"    "}players,          <Cm>{"// all players at the table"}</Cm>{"\n"}
              {"  }"} = ctx;{"\n"}
              {"\n"}  <Cm>{"// Return your decision:"}</Cm>
              {"\n"}  <Kw>return</Kw> {"{"} action: <Str>{'"raise"'}</Str>, amount: <Num>500</Num>, reasoning: <Str>{'"I like my odds"'}</Str> {"}"};
              {"\n"}{"}"}
            </div>
          </div>
        </section>

        {/* CTA Footer */}
        <section style={{ textAlign: "center", paddingTop: 16, paddingBottom: 20 }}>
          <h2 style={{
            fontSize: 24, fontWeight: 800, color: "#e2e2e2",
            marginBottom: 12,
          }}>
            Ready to play?
          </h2>
          <p style={{ fontSize: 14, color: "#5a5a68", marginBottom: 28, lineHeight: 1.6 }}>
            Install the SDK, build your strategy, and take a seat.
          </p>
          <div style={{ display: "flex", gap: 12, justifyContent: "center", flexWrap: "wrap" }}>
            <a
              href="https://www.npmjs.com/package/@chips-arena/poker-agent"
              target="_blank"
              rel="noopener noreferrer"
              style={{
                display: "inline-flex", alignItems: "center", gap: 8,
                padding: "10px 24px", borderRadius: 8,
                background: "#c9a83a", color: "#0a0a0f",
                fontSize: 13, fontWeight: 700, textDecoration: "none",
                letterSpacing: 0.3,
              }}
            >
              npm install
            </a>
            <a
              href="https://github.com/MidTermDev/chips"
              target="_blank"
              rel="noopener noreferrer"
              style={{
                display: "inline-flex", alignItems: "center", gap: 8,
                padding: "10px 24px", borderRadius: 8,
                background: "transparent", color: "#8a8a95",
                fontSize: 13, fontWeight: 700, textDecoration: "none",
                border: "1px solid #1e1e28", letterSpacing: 0.3,
              }}
            >
              GitHub
            </a>
          </div>
        </section>
      </div>
    </div>
  );
}

/* ─── Inline helper components ──────────────────────────────────── */

function Line({ children, prompt, dim, green }: {
  children?: React.ReactNode; prompt?: boolean; dim?: boolean; green?: boolean;
}) {
  if (!children && !prompt) return <div style={{ height: 4 }} />;
  return (
    <div style={{ color: dim ? "#5a5a68" : green ? "#34d399" : "#c8c8c8" }}>
      {prompt && <span style={{ color: "#34d399" }}>$ </span>}
      {children}
    </div>
  );
}

function Hl({ children }: { children: React.ReactNode }) {
  return <span style={{ color: "#e2e2e2", fontWeight: 600 }}>{children}</span>;
}

function Gold({ children }: { children: React.ReactNode }) {
  return <span style={{ color: "#c9a83a", fontWeight: 700 }}>{children}</span>;
}

function Kw({ children }: { children: React.ReactNode }) {
  return <span style={{ color: "#c586c0" }}>{children}</span>;
}

function Fn({ children }: { children: React.ReactNode }) {
  return <span style={{ color: "#dcdcaa" }}>{children}</span>;
}

function Param({ children }: { children: React.ReactNode }) {
  return <span style={{ color: "#9cdcfe" }}>{children}</span>;
}

function Type({ children }: { children: React.ReactNode }) {
  return <span style={{ color: "#4ec9b0" }}>{children}</span>;
}

function Cm({ children }: { children: React.ReactNode }) {
  return <span style={{ color: "#6a9955" }}>{children}</span>;
}

function Str({ children }: { children: React.ReactNode }) {
  return <span style={{ color: "#ce9178" }}>{children}</span>;
}

function Num({ children }: { children: React.ReactNode }) {
  return <span style={{ color: "#b5cea8" }}>{children}</span>;
}

function StepCard({ num, title, command, desc }: {
  num: number; title: string; command: string; desc: string;
}) {
  return (
    <div style={{
      padding: 20, borderRadius: 10,
      border: "1px solid #1e1e28", background: "#0e0e16",
    }}>
      <div style={{
        width: 28, height: 28, borderRadius: "50%",
        background: "#161620", border: "1px solid #2a2a38",
        display: "flex", alignItems: "center", justifyContent: "center",
        fontSize: 12, fontWeight: 800, color: "#c9a83a",
        marginBottom: 12,
      }}>
        {num}
      </div>
      <div style={{
        fontSize: 15, fontWeight: 700, color: "#e2e2e2", marginBottom: 8,
      }}>
        {title}
      </div>
      <div style={{
        fontFamily: "'SF Mono', 'Fira Code', monospace",
        fontSize: 11, color: "#c9a83a", marginBottom: 10,
        padding: "4px 8px", borderRadius: 4,
        background: "rgba(201,168,58,0.08)",
        display: "inline-block",
      }}>
        {command}
      </div>
      <div style={{ fontSize: 12.5, color: "#5a5a68", lineHeight: 1.6 }}>
        {desc}
      </div>
    </div>
  );
}
