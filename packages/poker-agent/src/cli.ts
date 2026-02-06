#!/usr/bin/env node

import { PokerAgentClient, DecisionContext, PokerDecision } from "./index";

const SERVER_URL = process.env.CHIPS_SERVER_URL || "ws://localhost:8080";
const AGENT_NAME = process.env.CHIPS_AGENT_NAME || parseArg("--name") || "TemplateBot";
const AGENT_ID = process.env.CHIPS_AGENT_ID || parseArg("--id") || `bot-${Date.now()}`;
const AGENT_STYLE = process.env.CHIPS_AGENT_STYLE || parseArg("--style") || "Balanced";
const SERVER = parseArg("--server") || SERVER_URL;

function parseArg(flag: string): string | undefined {
  const idx = process.argv.indexOf(flag);
  if (idx >= 0 && idx + 1 < process.argv.length) return process.argv[idx + 1];
  return undefined;
}

/**
 * Simple template strategy:
 * - Check/call if free or cheap (< 10% of chips)
 * - Fold if expensive (> 30% of chips) with no pair
 * - Occasionally min-raise with good cards
 */
async function templateDecision(ctx: DecisionContext): Promise<PokerDecision> {
  const { validActions, toCall, yourChips, holeCards, communityCards, potOdds, bettingRound } = ctx;

  const canCheck = validActions.find(a => a.action === "check");
  const canCall = validActions.find(a => a.action === "call");
  const canRaise = validActions.find(a => a.action === "raise");

  // Simple hand strength: paired hole cards or high cards
  const ranks = holeCards.map(c => rankValue(c.rank));
  const isPaired = ranks.length === 2 && ranks[0] === ranks[1];
  const isHighCards = ranks.every(r => r >= 10); // T+
  const hasPair = isPaired || checkBoardPair(holeCards, communityCards);

  // Free to play? Always check
  if (canCheck) {
    // Raise sometimes with strong hands
    if (canRaise && (isPaired || isHighCards) && Math.random() < 0.3) {
      return {
        action: "raise",
        amount: canRaise.minAmount,
        reasoning: "Template: min-raise with decent hand",
      };
    }
    return { action: "check", reasoning: "Template: free to check" };
  }

  // Cheap to call? (< 10% of chips)
  const callCost = toCall;
  if (canCall && callCost < yourChips * 0.1) {
    return { action: "call", reasoning: "Template: cheap call" };
  }

  // Medium cost (10-30%): call with pairs, fold otherwise
  if (canCall && callCost < yourChips * 0.3) {
    if (hasPair || isHighCards) {
      return { action: "call", reasoning: "Template: calling with pair/high cards" };
    }
    return { action: "fold", reasoning: "Template: too expensive without a hand" };
  }

  // Expensive: only call with strong hands
  if (canCall && (isPaired || (hasPair && bettingRound !== "preflop"))) {
    return { action: "call", reasoning: "Template: calling expensive with strong hand" };
  }

  return { action: "fold", reasoning: "Template: folding weak hand" };
}

function rankValue(rank: string): number {
  const map: Record<string, number> = {
    "2": 2, "3": 3, "4": 4, "5": 5, "6": 6, "7": 7, "8": 8,
    "9": 9, "T": 10, "J": 11, "Q": 12, "K": 13, "A": 14,
    "10": 10,
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

// ─── Main ──────────────────────────────────────────────────────

console.log(`\n🃏 CHIPS Poker Agent - Template Bot`);
console.log(`   Name: ${AGENT_NAME}`);
console.log(`   ID: ${AGENT_ID}`);
console.log(`   Server: ${SERVER}\n`);

const client = new PokerAgentClient({
  serverUrl: SERVER,
  agentId: AGENT_ID,
  name: AGENT_NAME,
  style: AGENT_STYLE,
  onDecision: templateDecision,
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

// Graceful shutdown
process.on("SIGINT", () => {
  console.log("\nDisconnecting...");
  client.disconnect();
  process.exit(0);
});
process.on("SIGTERM", () => {
  client.disconnect();
  process.exit(0);
});
