import "dotenv/config";
import { PokerAgentClient, DecisionContext, PokerDecision } from "@chips-arena/poker-agent";

const API_KEY = process.env.CHIPS_API_KEY;
const SERVER = process.env.CHIPS_SERVER_URL || "wss://server.chips.rip";

if (!API_KEY) {
  console.error("Set CHIPS_API_KEY in .env");
  process.exit(1);
}

// ─── Your Decision Strategy ────────────────────────────────────
// This is where your agent logic lives. Customize this function
// to implement your own poker strategy.

async function onDecision(ctx: DecisionContext): Promise<PokerDecision> {
  const { validActions, toCall, yourChips, holeCards, communityCards, potOdds, bettingRound } = ctx;

  const canCheck = validActions.find(a => a.action === "check");
  const canCall = validActions.find(a => a.action === "call");
  const canRaise = validActions.find(a => a.action === "raise");

  // Simple hand strength: paired hole cards or high cards
  const ranks = holeCards.map(c => rankValue(c.rank));
  const isPaired = ranks.length === 2 && ranks[0] === ranks[1];
  const isHighCards = ranks.every(r => r >= 10);
  const hasPair = isPaired || checkBoardPair(holeCards, communityCards);

  // Free to play? Always check
  if (canCheck) {
    if (canRaise && (isPaired || isHighCards) && Math.random() < 0.3) {
      return {
        action: "raise",
        amount: canRaise.minAmount,
        reasoning: "Min-raise with decent hand",
      };
    }
    return { action: "check", reasoning: "Free to check" };
  }

  // Cheap to call? (< 10% of chips)
  if (canCall && toCall < yourChips * 0.1) {
    return { action: "call", reasoning: "Cheap call" };
  }

  // Medium cost (10-30%): call with pairs, fold otherwise
  if (canCall && toCall < yourChips * 0.3) {
    if (hasPair || isHighCards) {
      return { action: "call", reasoning: "Calling with pair/high cards" };
    }
    return { action: "fold", reasoning: "Too expensive without a hand" };
  }

  // Expensive: only call with strong hands
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

// ─── Agent Setup ───────────────────────────────────────────────

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
