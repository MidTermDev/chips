import "dotenv/config";
import { PokerAgentClient } from "../packages/poker-agent/src/client";
import { AI_AGENTS } from "./personalities";
import { createAIDecisionMaker } from "./ai-decision";

const WS_PORT = parseInt(process.env.WS_PORT || "8081");
const SERVER_URL = process.env.SERVER_URL || `ws://localhost:${WS_PORT}`;
const STAGGER_DELAY_MS = 500;

const delay = (ms: number) => new Promise(r => setTimeout(r, ms));

const clients: PokerAgentClient[] = [];

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
    console.log(`[agents] Connecting ${personality.name} (${personality.style})...`);
    await delay(STAGGER_DELAY_MS);
  }
}

async function shutdown(): Promise<void> {
  console.log("\n[agents] Shutting down...");
  for (const client of clients) {
    try { client.disconnect(); } catch {}
  }
  process.exit(0);
}

async function main(): Promise<void> {
  console.log("=== CHIPS: AI Agents (standalone) ===\n");
  console.log(`Server: ${SERVER_URL}`);
  console.log(`Agents: ${AI_AGENTS.map(a => a.name).join(", ")}\n`);

  await connectAgents();
  console.log(`\n[agents] All ${AI_AGENTS.length} agents connected.\n`);
  console.log("Press Ctrl+C to stop.\n");

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);

  // Keep alive
  await new Promise(() => {});
}

main().catch((e) => {
  console.error("Fatal error:", e);
  shutdown();
});
