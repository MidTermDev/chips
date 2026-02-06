#!/usr/bin/env node

// `poker start` — runs the agent from the current directory's .env
// Looks for CHIPS_API_KEY in .env or environment

import * as fs from "fs";
import * as path from "path";

// Load .env manually (no dotenv dependency in the SDK itself)
function loadEnv(): void {
  const envPath = path.resolve(process.cwd(), ".env");
  if (!fs.existsSync(envPath)) return;
  const lines = fs.readFileSync(envPath, "utf-8").split("\n");
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq < 0) continue;
    const key = trimmed.slice(0, eq).trim();
    const val = trimmed.slice(eq + 1).trim();
    if (!process.env[key]) {
      process.env[key] = val;
    }
  }
}

loadEnv();

import { PokerAgentClient } from "./client";
import { DecisionContext, PokerDecision } from "./types";

const API_KEY = process.env.CHIPS_API_KEY;
const SERVER = process.env.CHIPS_SERVER_URL || "wss://server.chips.rip";

if (!API_KEY) {
  console.error("\n  No CHIPS_API_KEY found.\n");
  console.error("  Either:");
  console.error("    1. Create a .env file with CHIPS_API_KEY=chp_...");
  console.error("    2. Run: npx @chips-arena/poker-agent  (to scaffold a project)");
  console.error("    3. Set the env var: CHIPS_API_KEY=chp_... poker start\n");
  process.exit(1);
}

// Check if there's a local agent.ts — if so, tell them to use tsx instead
const localAgent = path.resolve(process.cwd(), "agent.ts");
if (fs.existsSync(localAgent)) {
  console.log("\n  Found agent.ts in current directory.");
  console.log("  To run your custom strategy: npx tsx agent.ts");
  console.log("  Running with built-in default strategy instead...\n");
}

// Default strategy (same as scaffolded template)
async function onDecision(ctx: DecisionContext): Promise<PokerDecision> {
  const { validActions, toCall, yourChips, holeCards, communityCards, bettingRound } = ctx;

  const canCheck = validActions.find(a => a.action === "check");
  const canCall = validActions.find(a => a.action === "call");
  const canRaise = validActions.find(a => a.action === "raise");

  const ranks = holeCards.map(c => rankValue(c.rank));
  const isPaired = ranks.length === 2 && ranks[0] === ranks[1];
  const isHighCards = ranks.every(r => r >= 10);
  const hasPair = isPaired || checkBoardPair(holeCards, communityCards);

  if (canCheck) {
    if (canRaise && (isPaired || isHighCards) && Math.random() < 0.3) {
      return { action: "raise", amount: canRaise.minAmount, reasoning: "Min-raise with decent hand" };
    }
    return { action: "check", reasoning: "Free to check" };
  }

  if (canCall && toCall < yourChips * 0.1) {
    return { action: "call", reasoning: "Cheap call" };
  }

  if (canCall && toCall < yourChips * 0.3) {
    if (hasPair || isHighCards) {
      return { action: "call", reasoning: "Calling with pair/high cards" };
    }
    return { action: "fold", reasoning: "Too expensive without a hand" };
  }

  if (canCall && (isPaired || (hasPair && bettingRound !== "preflop"))) {
    return { action: "call", reasoning: "Calling expensive with strong hand" };
  }

  return { action: "fold", reasoning: "Folding weak hand" };
}

function rankValue(rank: string): number {
  const map: Record<string, number> = {
    "2": 2, "3": 3, "4": 4, "5": 5, "6": 6, "7": 7, "8": 8,
    "9": 9, "T": 10, "J": 11, "Q": 12, "K": 13, "A": 14, "10": 10,
  };
  return map[rank] || 0;
}

function checkBoardPair(holeCards: { rank: string }[], communityCards: { rank: string }[]): boolean {
  for (const h of holeCards) {
    for (const c of communityCards) {
      if (h.rank === c.rank) return true;
    }
  }
  return false;
}

console.log(`\n\u2660 CHIPS Poker Agent`);
console.log(`  Server: ${SERVER}\n`);

const client = new PokerAgentClient({
  serverUrl: SERVER,
  apiKey: API_KEY,
  onDecision,
  onGameEvent: (event) => {
    switch (event.type) {
      case "new_hand":
        console.log(`\n--- Hand #${event.data.handNumber} ---`);
        if (event.data.holeCards?.length) {
          console.log(`  Your cards: ${event.data.holeCards.map((c: any) => c.display).join(" ")}`);
        }
        break;
      case "player_action":
        console.log(`  ${event.data.name}: ${event.data.action}${event.data.amount > 0 ? ` ${event.data.amount}` : ""}`);
        break;
      case "hand_complete":
        for (const w of event.data.winners || []) {
          console.log(`  Winner: ${w.name} - ${w.amount.toLocaleString()} (${w.handDescription})`);
        }
        break;
      case "community_cards":
        console.log(`  ${event.data.round}: ${event.data.cards.map((c: any) => c.display).join(" ")}`);
        break;
    }
  },
  onConnect: (ack) => {
    console.log(`Seated at position ${ack.seat}. ${ack.waitingForNextHand ? "Waiting for next hand..." : "Ready!"}`);
  },
  onDisconnect: () => {
    console.log("Disconnected from server");
  },
  onError: (err) => {
    console.error(`Error: ${err.message}`);
  },
  reconnect: true,
});

client.connect();

process.on("SIGINT", () => {
  console.log("\nDisconnecting...");
  client.disconnect();
  process.exit(0);
});
process.on("SIGTERM", () => {
  client.disconnect();
  process.exit(0);
});
