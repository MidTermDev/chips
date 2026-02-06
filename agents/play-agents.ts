import "dotenv/config";
import { readFileSync, writeFileSync, existsSync } from "fs";
import { join } from "path";
import { PokerAgentClient } from "../packages/poker-agent/src/client";
import { AI_AGENTS } from "./personalities";
import { createAIDecisionMaker } from "./ai-decision";

const WS_PORT = parseInt(process.env.WS_PORT || "8081");
const SERVER_URL = process.env.SERVER_URL || `ws://localhost:${WS_PORT}`;
const HTTP_URL = SERVER_URL.replace("ws://", "http://").replace("wss://", "https://");
const STAGGER_DELAY_MS = 500;
const KEYS_FILE = join(__dirname, "..", "data", "agent-keys.json");
const API_KEYS_FILE = join(__dirname, "..", "data", "api-keys.json");

const delay = (ms: number) => new Promise(r => setTimeout(r, ms));

const clients: PokerAgentClient[] = [];

function loadKeyCache(): Record<string, string> {
  // First try our own cache
  try {
    if (existsSync(KEYS_FILE)) {
      return JSON.parse(readFileSync(KEYS_FILE, "utf-8"));
    }
  } catch {}

  // Fall back to reading from the main api-keys store (same server)
  const cache: Record<string, string> = {};
  try {
    if (existsSync(API_KEYS_FILE)) {
      const records: Array<{ name: string; apiKey: string }> = JSON.parse(readFileSync(API_KEYS_FILE, "utf-8"));
      for (const r of records) {
        cache[r.name] = r.apiKey;
      }
      if (Object.keys(cache).length > 0) {
        saveKeyCache(cache);
      }
    }
  } catch {}
  return cache;
}

function saveKeyCache(cache: Record<string, string>): void {
  try {
    writeFileSync(KEYS_FILE, JSON.stringify(cache, null, 2));
  } catch {}
}

async function getOrRegisterApiKey(
  name: string,
  style: string,
  avatar: string,
  keyCache: Record<string, string>,
): Promise<string> {
  // Check cached key
  const cached = keyCache[name];
  if (cached) {
    try {
      const res = await fetch(`${HTTP_URL}/api/validate-key`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ apiKey: cached }),
      });
      if (res.ok) return cached;
    } catch {}
  }

  // Register new agent
  const res = await fetch(`${HTTP_URL}/api/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, style, avatar }),
  });

  if (res.ok) {
    const data = await res.json();
    keyCache[name] = data.apiKey;
    saveKeyCache(keyCache);
    return data.apiKey;
  }

  const errorData = await res.json().catch(() => ({ error: "unknown" }));
  throw new Error(`Failed to register ${name}: ${errorData.error || res.statusText}`);
}

async function connectAgents(): Promise<void> {
  const keyCache = loadKeyCache();

  for (const personality of AI_AGENTS) {
    try {
      const apiKey = await getOrRegisterApiKey(
        personality.name,
        personality.style,
        personality.avatar,
        keyCache,
      );

      const decisionMaker = createAIDecisionMaker(personality.systemPrompt);

      const client = new PokerAgentClient({
        serverUrl: SERVER_URL,
        apiKey,
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
    } catch (e: any) {
      console.error(`[agents] Failed to register ${personality.name}: ${e.message}`);
    }
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
