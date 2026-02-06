import "dotenv/config";
import { PlayerRegistry } from "./registry/player-registry";
import { loadRegistry, saveRegistry } from "./registry/persistence";
import { ProfileStore } from "./registry/profile-store";
import { VerificationStore } from "./registry/verification-store";
import { GameServer } from "./server/websocket";
import { TurnManager } from "./game/turn-manager";
import { GameLoop } from "./game/game-loop";
import { PokerAgent } from "./agents/agent";
import { AGENT_PERSONALITIES } from "./agents/personalities";
import {
  getPoolData,
  initializePoolOnChain,
} from "./solana/transactions";
import {
  loadKeypair,
  loadMintAddress,
  getConnection,
} from "./solana/wallet";

const WS_PORT = parseInt(process.env.WS_PORT || "8080");
const USE_BLOCKCHAIN = process.env.USE_BLOCKCHAIN !== "false";
const USE_HOUSE_BOTS = process.env.USE_HOUSE_BOTS !== "false";

async function main() {
  console.log("=== CHIPS: Open Agent Poker Platform ===\n");

  // Initialize registry
  const registry = new PlayerRegistry();
  loadRegistry(registry);

  // Initialize profile store
  const profileStore = new ProfileStore();

  // Initialize verification store
  const verificationStore = new VerificationStore();

  // Initialize server
  const server = new GameServer(WS_PORT, registry, profileStore, verificationStore);

  // Initialize turn manager
  const turnManager = new TurnManager(server, registry);

  // Initialize game loop
  const gameLoop = new GameLoop(server, registry, turnManager, USE_BLOCKCHAIN, profileStore, verificationStore);
  await gameLoop.initialize();

  // Register house bots if enabled
  if (USE_HOUSE_BOTS) {
    console.log("\n[House Bots] Registering built-in AI agents...");
    for (let i = 0; i < AGENT_PERSONALITIES.length; i++) {
      const personality = AGENT_PERSONALITIES[i];

      // Skip if seat is already occupied from snapshot
      if (registry.getBySeat(i)) {
        console.log(`  Seat ${i}: ${personality.name} (restored from snapshot)`);
        // Still register the bot for turn manager
        const bot = new PokerAgent(personality);
        const existing = registry.getBySeat(i);
        if (existing) {
          existing.isHouseBot = true;
          existing.sittingOut = false;
          turnManager.registerHouseBot(existing.agentId, bot);
        }
        continue;
      }

      const agentId = `house-${personality.name.toLowerCase()}`;
      const result = registry.register({
        agentId,
        name: personality.name,
        style: personality.style,
        avatar: personality.avatar,
        ws: null,
        chips: USE_BLOCKCHAIN ? 0 : 50_000_000,
        isHouseBot: true,
      });

      if (typeof result !== "string") {
        const bot = new PokerAgent(personality);
        turnManager.registerHouseBot(agentId, bot);
        profileStore.upsert(agentId, {
          name: personality.name,
          style: personality.style,
          avatar: personality.avatar,
          description: personality.description,
        });

        console.log(`  Seat ${result.seat}: ${personality.name} (${personality.style}) - ${USE_BLOCKCHAIN ? "vault-backed" : "50,000,000 CHIPS"}`);
      }
    }
  } else {
    console.log("\n[House Bots] Disabled. Waiting for external agents to connect...");
  }

  // Handle external agent registration
  server.onAgentRegistered = (agent) => {
    console.log(`[GameLoop] Agent ${agent.name} ready at seat ${agent.seat}`);
    profileStore.upsert(agent.agentId, {
      name: agent.name,
      style: agent.style,
      avatar: agent.avatar,
      walletAddress: agent.walletAddress,
    });
    if (USE_BLOCKCHAIN) {
      // In blockchain mode, start with 0 chips (vault-derived)
      agent.chips = 0;
    }
  };

  // Handle agent verification
  server.onAgentVerified = async (agentId: string, seat: number) => {
    console.log(`[GameLoop] Agent ${agentId} verified at seat ${seat}`);
    if (USE_BLOCKCHAIN) {
      try {
        const connection = getConnection();
        const adminKeypair = loadKeypair("admin");
        const mint = loadMintAddress();

        // Check if pool exists for that seat
        const pool = await getPoolData(connection, adminKeypair, seat);
        if (!pool) {
          await initializePoolOnChain(connection, adminKeypair, mint, seat, 100); // 1% fee
          console.log(`[GameLoop] Pool initialized for seat ${seat}`);
        } else {
          console.log(`[GameLoop] Pool already exists for seat ${seat}`);
        }
      } catch (e: any) {
        console.error(`[GameLoop] Pool init error for seat ${seat}: ${e.message}`);
      }
    }
  };

  server.onAgentLeft = (agent, reason) => {
    console.log(`[GameLoop] Agent ${agent.name} left (${reason})`);
    profileStore.setStatus(agent.agentId, "offline");
    turnManager.removeHouseBot(agent.agentId);
    saveRegistry(registry);
  };

  // Graceful shutdown
  const shutdown = () => {
    console.log("\n[Shutdown] Saving state...");
    gameLoop.stop();
    saveRegistry(registry);
    server.close();
    process.exit(0);
  };
  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);

  // Start game loop
  await gameLoop.start();

  server.close();
}

main().catch((e) => {
  console.error("Fatal error:", e);
  process.exit(1);
});
