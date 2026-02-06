import "dotenv/config";
import { Connection, Keypair, PublicKey } from "@solana/web3.js";
import { AnchorProvider, Program } from "@coral-xyz/anchor";
import * as fs from "fs";
import * as path from "path";
import IDL from "../target/idl/chips_staking.json";
import {
  PROGRAM_ID,
  getPoolPDA,
  getPoolSafe,
  initializePool,
  keypairWallet,
} from "./client";

const KEYS_DIR = path.join(__dirname, "../solana/keys");
const FEE_BPS = 100; // 1%

function loadKeypair(name: string): Keypair {
  const filePath = path.join(KEYS_DIR, `${name}.json`);
  const secret = JSON.parse(fs.readFileSync(filePath, "utf-8"));
  return Keypair.fromSecretKey(new Uint8Array(secret));
}

function loadMintAddress(): PublicKey {
  const mintFile = path.join(KEYS_DIR, "mint.json");
  const data = JSON.parse(fs.readFileSync(mintFile, "utf-8"));
  return new PublicKey(data.address);
}

const AGENT_NAMES = [
  "Ace", "Bluff", "Calcula", "Daring",
  "Eagle", "Foxworth", "Grinder", "Hustler",
];

async function main() {
  console.log("=== Setting up Staking Pools ===\n");

  const rpcUrl = process.env.SOLANA_RPC_URL || "https://api.devnet.solana.com";
  const connection = new Connection(rpcUrl, "confirmed");
  const adminKeypair = loadKeypair("admin");
  const mintAddress = loadMintAddress();

  console.log(`Admin: ${adminKeypair.publicKey.toBase58()}`);
  console.log(`Mint: ${mintAddress.toBase58()}`);
  console.log(`Program: ${PROGRAM_ID.toBase58()}\n`);

  const wallet = keypairWallet(adminKeypair);
  const provider = new AnchorProvider(connection, wallet, { commitment: "confirmed" });
  const program = new Program(IDL as any, provider);

  for (let i = 0; i < 8; i++) {
    const name = AGENT_NAMES[i];
    const [poolPDA] = getPoolPDA(i);

    // Check if already initialized
    const existing = await getPoolSafe(program, i);
    if (existing) {
      console.log(`  [${i}] ${name}: Pool already exists at ${poolPDA.toBase58()}`);
      continue;
    }

    try {
      const sig = await initializePool(program, adminKeypair.publicKey, i, mintAddress, FEE_BPS);
      console.log(`  [${i}] ${name}: Pool initialized | sig: ${sig.slice(0, 24)}...`);
    } catch (e: any) {
      console.error(`  [${i}] ${name}: Error - ${e.message}`);
    }

    // Small delay between transactions
    await new Promise((r) => setTimeout(r, 1000));
  }

  console.log("\n=== Pool Setup Complete ===");

  // Verify all pools
  console.log("\nVerifying pools:");
  for (let i = 0; i < 8; i++) {
    const pool = await getPoolSafe(program, i);
    if (pool) {
      console.log(`  [${i}] ${AGENT_NAMES[i]}: shares=${pool.totalShares.toString()} assets=${pool.totalAssets.toString()} fee=${pool.feeBasisPoints}bps`);
    } else {
      console.log(`  [${i}] ${AGENT_NAMES[i]}: NOT FOUND`);
    }
  }
}

main().catch((e) => {
  console.error("Fatal error:", e);
  process.exit(1);
});
