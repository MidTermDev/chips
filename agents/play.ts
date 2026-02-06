import "dotenv/config";
import { spawn, ChildProcess } from "child_process";
import { existsSync, unlinkSync } from "fs";
import { PokerAgentClient } from "../packages/poker-agent/src/client";
import { AI_AGENTS } from "./personalities";
import { createAIDecisionMaker } from "./ai-decision";

const WS_PORT = parseInt(process.env.WS_PORT || "8081");
const SERVER_URL = `ws://localhost:${WS_PORT}`;
const STAGGER_DELAY_MS = 500;

const delay = (ms: number) => new Promise(r => setTimeout(r, ms));

let engineProcess: ChildProcess | null = null;
const clients: PokerAgentClient[] = [];

async function startEngine(): Promise<void> {
  // Delete stale registry so agents get fresh seats
  if (existsSync("data/registry.json")) {
    unlinkSync("data/registry.json");
    console.log("[play] Deleted stale data/registry.json");
  }

  return new Promise((resolve, reject) => {
    engineProcess = spawn("npx", ["tsx", "engine/index.ts"], {
      env: {
        ...process.env,
        USE_HOUSE_BOTS: "false",
        USE_BLOCKCHAIN: "false",
      },
      stdio: ["ignore", "pipe", "pipe"],
      cwd: process.cwd(),
    });

    let resolved = false;

    engineProcess.stdout!.on("data", (data: Buffer) => {
      const line = data.toString();
      process.stdout.write(`[engine] ${line}`);
      if (!resolved && line.includes("Listening on port")) {
        resolved = true;
        // Give it a moment to fully initialize
        setTimeout(resolve, 1000);
      }
    });

    engineProcess.stderr!.on("data", (data: Buffer) => {
      process.stderr.write(`[engine:err] ${data.toString()}`);
    });

    engineProcess.on("error", (err) => {
      if (!resolved) {
        resolved = true;
        reject(err);
      }
    });

    engineProcess.on("exit", (code) => {
      console.log(`[engine] Process exited with code ${code}`);
      if (!resolved) {
        resolved = true;
        reject(new Error(`Engine exited with code ${code}`));
      }
    });

    // Timeout after 30s
    setTimeout(() => {
      if (!resolved) {
        resolved = true;
        reject(new Error("Engine failed to start within 30s"));
      }
    }, 30000);
  });
}

async function connectAgents(): Promise<void> {
  for (const personality of AI_AGENTS) {
    const decisionMaker = createAIDecisionMaker(personality.systemPrompt);

    const client = new PokerAgentClient({
      serverUrl: SERVER_URL,
      agentId: personality.agentId,
      name: personality.name,
      style: personality.style,
      avatar: personality.avatar,
      onDecision: decisionMaker,
      onConnect: (ack) => {
        console.log(`[${personality.name}] Seated at position ${ack.seat}`);
      },
      onGameEvent: (event) => {
        if (event.type === "hand_complete") {
          const data = event.data as any;
          const winners = data.winners || [];
          for (const w of winners) {
            if (w.name === personality.name) {
              console.log(`[${personality.name}] Won ${w.amount.toLocaleString()} CHIPS (${w.handDescription})`);
            }
          }
        }
      },
      onError: (err) => {
        console.error(`[${personality.name}] Error: ${err.message}`);
      },
      reconnect: true,
    });

    client.connect();
    clients.push(client);
    console.log(`[play] Connecting ${personality.name} (${personality.style})...`);
    await delay(STAGGER_DELAY_MS);
  }
}

async function shutdown(): Promise<void> {
  console.log("\n[play] Shutting down...");

  // Disconnect agents
  for (const client of clients) {
    try { client.disconnect(); } catch {}
  }

  // Kill engine
  if (engineProcess && !engineProcess.killed) {
    engineProcess.kill("SIGTERM");
    // Give it time to save state
    await delay(2000);
    if (!engineProcess.killed) {
      engineProcess.kill("SIGKILL");
    }
  }

  process.exit(0);
}

async function main(): Promise<void> {
  console.log("=== CHIPS: AI Agent Launcher ===\n");
  console.log(`Server: ${SERVER_URL}`);
  console.log(`Agents: ${AI_AGENTS.map(a => a.name).join(", ")}\n`);

  // Start engine
  console.log("[play] Starting engine...");
  await startEngine();
  console.log("[play] Engine ready.\n");

  // Connect agents
  await connectAgents();
  console.log(`\n[play] All ${AI_AGENTS.length} agents connected. Game will start automatically.\n`);
  console.log("Press Ctrl+C to stop.\n");

  // Handle graceful shutdown
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);

  // Keep alive
  await new Promise(() => {});
}

main().catch((e) => {
  console.error("Fatal error:", e);
  shutdown();
});
