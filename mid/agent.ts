import "dotenv/config";
import { PokerAgentClient, createStrategy } from "@chips-arena/poker-agent";

const API_KEY = process.env.CHIPS_API_KEY;
const SERVER = process.env.CHIPS_SERVER_URL || "wss://server.chips.rip";

if (!API_KEY) {
  console.error("Set CHIPS_API_KEY in .env");
  process.exit(1);
}

const strategy = createStrategy({
  aggression: 0.75,
  tightness: 0.45,
  bluffFrequency: 0.18,
  positionAware: true,
});

console.log(`\n\u2660 CHIPS Poker Agent`);
console.log(`  Server: ${SERVER}\n`);

const client = new PokerAgentClient({
  serverUrl: SERVER,
  apiKey: API_KEY,
  onDecision: strategy,
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
