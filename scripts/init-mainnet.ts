/**
 * Initialize staking pools on Solana mainnet.
 *
 * Usage:
 *   npx tsx scripts/init-mainnet.ts [start] [end]
 *
 * Defaults to pool indices 8-15 if no args provided.
 * The CHIPS token must be minted before running this script.
 */

import { Connection, Keypair, PublicKey } from "@solana/web3.js";
import { getMint } from "@solana/spl-token";
import { AnchorProvider, Program, BN } from "@coral-xyz/anchor";
import * as fs from "fs";
import * as path from "path";

const RPC_URL =
  process.env.SOLANA_RPC_URL ||
  "https://mainnet.helius-rpc.com/?api-key=fa9f0b54-4853-4415-b37e-1d2f0f03663e";

const PROGRAM_ID = new PublicKey("axjx66xJAyWxVTu73uCjqzSsAopBbqEbyetD5SUFTex");
const FEE_BPS = 100; // 1%

// ─── Helpers ──────────────────────────────────────────────────

function loadKeypair(filePath: string): Keypair {
  const raw = JSON.parse(fs.readFileSync(filePath, "utf-8"));
  return Keypair.fromSecretKey(new Uint8Array(raw));
}

function loadMintAddress(): PublicKey {
  const mintFile = path.join(__dirname, "../solana/keys/mint.json");
  const data = JSON.parse(fs.readFileSync(mintFile, "utf-8"));
  return new PublicKey(data.address);
}

function getPoolPDA(agentIndex: number): PublicKey {
  const [pda] = PublicKey.findProgramAddressSync(
    [Buffer.from("pool"), Buffer.from([agentIndex])],
    PROGRAM_ID
  );
  return pda;
}

function getVaultPDA(agentIndex: number): PublicKey {
  const [pda] = PublicKey.findProgramAddressSync(
    [Buffer.from("vault"), Buffer.from([agentIndex])],
    PROGRAM_ID
  );
  return pda;
}

function getFeeVaultPDA(agentIndex: number): PublicKey {
  const [pda] = PublicKey.findProgramAddressSync(
    [Buffer.from("fee_vault"), Buffer.from([agentIndex])],
    PROGRAM_ID
  );
  return pda;
}

// Minimal IDL for initializePool
const IDL = {
  address: PROGRAM_ID.toBase58(),
  metadata: { name: "chipsStaking", version: "0.1.0", spec: "0.1.0", description: "" },
  instructions: [
    {
      name: "initializePool",
      discriminator: [95, 180, 10, 172, 84, 174, 232, 40],
      accounts: [
        { name: "authority", signer: true, writable: true },
        { name: "pool", writable: true },
        { name: "vault", writable: true },
        { name: "feeVault", writable: true },
        { name: "mint" },
        { name: "systemProgram", address: "11111111111111111111111111111111" },
        { name: "tokenProgram", address: "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA" },
      ],
      args: [
        { name: "agentIndex", type: "u8" },
        { name: "feeBasisPoints", type: "u16" },
      ],
    },
  ],
  accounts: [
    {
      name: "pool",
      discriminator: [241, 154, 109, 4, 17, 177, 109, 188],
    },
  ],
  types: [
    {
      name: "pool",
      type: {
        kind: "struct" as const,
        fields: [
          { name: "agentIndex", type: "u8" },
          { name: "authority", type: "pubkey" },
          { name: "mint", type: "pubkey" },
          { name: "vault", type: "pubkey" },
          { name: "feeVault", type: "pubkey" },
          { name: "totalShares", type: "u64" },
          { name: "totalAssets", type: "u64" },
          { name: "depositedAmount", type: "u64" },
          { name: "feeBasisPoints", type: "u16" },
          { name: "paused", type: "bool" },
          { name: "bump", type: "u8" },
          { name: "vaultBump", type: "u8" },
          { name: "feeVaultBump", type: "u8" },
        ],
      },
    },
  ],
  errors: [],
};

// ─── Main ─────────────────────────────────────────────────────

async function main() {
  const args = process.argv.slice(2);
  const start = args[0] ? parseInt(args[0], 10) : 8;
  const end = args[1] ? parseInt(args[1], 10) : 15;

  if (isNaN(start) || isNaN(end) || start < 0 || end > 63 || start > end) {
    console.error("Usage: npx tsx scripts/init-mainnet.ts [start] [end]");
    console.error("  start/end must be 0-63, start <= end");
    process.exit(1);
  }

  console.log(`\n=== CHIPS Staking - Mainnet Pool Initialization ===`);
  console.log(`Program:  ${PROGRAM_ID.toBase58()}`);
  console.log(`RPC:      ${RPC_URL.replace(/api-key=.*/, "api-key=***")}`);
  console.log(`Pools:    ${start} - ${end}`);
  console.log(`Fee:      ${FEE_BPS} bps (${FEE_BPS / 100}%)\n`);

  // Load admin keypair
  const adminPath = path.join(__dirname, "../solana/keys/admin.json");
  if (!fs.existsSync(adminPath)) {
    console.error("Admin keypair not found at:", adminPath);
    process.exit(1);
  }
  const admin = loadKeypair(adminPath);
  console.log(`Admin:    ${admin.publicKey.toBase58()}`);

  // Load mint
  const mint = loadMintAddress();
  console.log(`Mint:     ${mint.toBase58()}`);

  // Connect
  const connection = new Connection(RPC_URL, "confirmed");

  // Verify mint exists on-chain
  try {
    const mintInfo = await getMint(connection, mint);
    console.log(`Mint verified on-chain (decimals: ${mintInfo.decimals}, supply: ${mintInfo.supply})`);
  } catch (e: any) {
    console.error(`\nMint ${mint.toBase58()} does not exist on-chain yet.`);
    console.error("The CHIPS token must be minted before initializing pools.");
    console.error("Run this script again after the token is live.\n");
    process.exit(0);
  }

  // Check admin SOL balance
  const balance = await connection.getBalance(admin.publicKey);
  console.log(`Admin SOL balance: ${(balance / 1e9).toFixed(4)} SOL\n`);

  if (balance < 0.05 * 1e9) {
    console.error("Insufficient SOL balance for pool initialization (need ~0.05 SOL per pool).");
    process.exit(1);
  }

  // Setup Anchor
  const wallet = {
    publicKey: admin.publicKey,
    signTransaction: async (tx: any) => { tx.partialSign(admin); return tx; },
    signAllTransactions: async (txs: any[]) => { txs.forEach(t => t.partialSign(admin)); return txs; },
    payer: admin,
  };
  const provider = new AnchorProvider(connection, wallet as any, { commitment: "confirmed" });
  const program = new Program(IDL as any, provider);

  // Initialize pools
  let created = 0;
  let skipped = 0;
  let failed = 0;

  for (let i = start; i <= end; i++) {
    const pool = getPoolPDA(i);
    const vault = getVaultPDA(i);
    const feeVault = getFeeVaultPDA(i);

    // Check if pool already exists
    const existing = await connection.getAccountInfo(pool);
    if (existing) {
      console.log(`  Pool ${i}: already exists (skipping)`);
      skipped++;
      continue;
    }

    try {
      const sig = await program.methods
        .initializePool(i, FEE_BPS)
        .accounts({
          authority: admin.publicKey,
          pool,
          vault,
          feeVault,
          mint,
          systemProgram: new PublicKey("11111111111111111111111111111111"),
          tokenProgram: new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"),
        } as any)
        .rpc();

      console.log(`  Pool ${i}: initialized | sig: ${sig.slice(0, 20)}...`);
      created++;

      // Small delay between txs to avoid rate limits
      await new Promise((r) => setTimeout(r, 500));
    } catch (e: any) {
      console.error(`  Pool ${i}: FAILED - ${e.message}`);
      failed++;
    }
  }

  console.log(`\n=== Summary ===`);
  console.log(`Created: ${created}`);
  console.log(`Skipped: ${skipped}`);
  console.log(`Failed:  ${failed}`);

  // Verify created pools
  if (created > 0) {
    console.log(`\n=== Verification ===`);
    for (let i = start; i <= end; i++) {
      const pool = getPoolPDA(i);
      const info = await connection.getAccountInfo(pool);
      const status = info ? "OK" : "MISSING";
      console.log(`  Pool ${i}: ${status}`);
    }
  }

  console.log("\nDone.");
}

main().catch((e) => {
  console.error("Fatal error:", e);
  process.exit(1);
});
