import "dotenv/config";
import { Connection, Keypair, PublicKey } from "@solana/web3.js";
import { AnchorProvider, Program, BN } from "@coral-xyz/anchor";
import { getAccount } from "@solana/spl-token";
import * as fs from "fs";
import * as path from "path";
import IDL from "../target/idl/chips_staking.json";
import {
  PROGRAM_ID,
  getPoolPDA,
  getVaultPDA,
  getPoolSafe,
  updateBankroll,
  keypairWallet,
  PoolData,
} from "./client";

const KEYS_DIR = path.join(__dirname, "../solana/keys");
const DECIMALS = 1e6;

const AGENT_NAMES = [
  "Ace", "Bluff", "Calcula", "Daring",
  "Eagle", "Foxworth", "Grinder", "Hustler",
];

function loadKeypair(name: string): Keypair {
  const filePath = path.join(KEYS_DIR, `${name}.json`);
  const secret = JSON.parse(fs.readFileSync(filePath, "utf-8"));
  return Keypair.fromSecretKey(new Uint8Array(secret));
}

async function getVaultBalance(connection: Connection, agentIndex: number): Promise<bigint> {
  const [vault] = getVaultPDA(agentIndex);
  try {
    const account = await getAccount(connection, vault);
    return account.amount;
  } catch {
    return BigInt(0);
  }
}

async function main() {
  console.log("=== Repair Staking Pools ===");
  console.log("Resets each pool's totalAssets to match vault's actual token balance.\n");

  const rpcUrl = process.env.SOLANA_RPC_URL || "https://api.devnet.solana.com";
  const connection = new Connection(rpcUrl, "confirmed");
  const adminKeypair = loadKeypair("admin");

  console.log(`Admin: ${adminKeypair.publicKey.toBase58()}`);
  console.log(`Program: ${PROGRAM_ID.toBase58()}\n`);

  const wallet = keypairWallet(adminKeypair);
  const provider = new AnchorProvider(connection, wallet, { commitment: "confirmed" });
  const program = new Program(IDL as any, provider);

  let repaired = 0;
  let skipped = 0;

  for (let i = 0; i < 8; i++) {
    const name = AGENT_NAMES[i];
    const pool = await getPoolSafe(program, i);

    if (!pool) {
      console.log(`  [${i}] ${name}: No pool — skipping`);
      skipped++;
      continue;
    }

    const vaultBalance = await getVaultBalance(connection, i);
    const totalAssets = pool.totalAssets;
    const totalAssetsNum = totalAssets.toNumber();
    const vaultNum = Number(vaultBalance);

    console.log(`  [${i}] ${name}:`);
    console.log(`       totalAssets = ${totalAssetsNum.toLocaleString()} (${(totalAssetsNum / DECIMALS).toLocaleString()} CHIPS)`);
    console.log(`       vaultBalance = ${vaultNum.toLocaleString()} (${(vaultNum / DECIMALS).toLocaleString()} CHIPS)`);
    console.log(`       totalShares  = ${pool.totalShares.toNumber().toLocaleString()}`);

    if (totalAssetsNum === vaultNum) {
      console.log(`       ✓ Already correct\n`);
      skipped++;
      continue;
    }

    const delta = totalAssetsNum - vaultNum;
    console.log(`       ✗ Off by ${delta.toLocaleString()} raw (${(delta / DECIMALS).toLocaleString()} CHIPS)`);

    try {
      const sig = await updateBankroll(
        program,
        adminKeypair.publicKey,
        i,
        new BN(vaultBalance.toString()),
      );
      console.log(`       → Fixed! sig: ${sig.slice(0, 24)}...`);

      // Verify
      const fixed = await getPoolSafe(program, i);
      if (fixed) {
        const newAssets = fixed.totalAssets.toNumber();
        const price = fixed.totalShares.toNumber() > 0
          ? newAssets / fixed.totalShares.toNumber()
          : 1;
        console.log(`       → New totalAssets = ${newAssets.toLocaleString()} | sharePrice = ${price.toFixed(6)}\n`);
      }
      repaired++;
    } catch (e: any) {
      console.error(`       → Error: ${e.message}\n`);
    }

    await new Promise((r) => setTimeout(r, 500));
  }

  console.log(`=== Done: ${repaired} repaired, ${skipped} skipped ===`);
}

main().catch((e) => {
  console.error("Fatal error:", e);
  process.exit(1);
});
