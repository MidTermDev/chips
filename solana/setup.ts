import "dotenv/config";
import {
  Connection,
  Keypair,
  LAMPORTS_PER_SOL,
  PublicKey,
  SystemProgram,
  Transaction,
  sendAndConfirmTransaction,
} from "@solana/web3.js";
import {
  createMint,
  getOrCreateAssociatedTokenAccount,
  mintTo,
} from "@solana/spl-token";
import * as fs from "fs";
import * as path from "path";

const KEYS_DIR = path.join(__dirname, "keys");
const RPC_URL = process.env.SOLANA_RPC_URL || "https://api.devnet.solana.com";
const AGENT_NAMES = [
  "Ace",
  "Bluff",
  "Calcula",
  "Daring",
  "Eagle",
  "Foxworth",
  "Grinder",
  "Hustler",
];
const CHIPS_PER_AGENT = 50_000_000;
const DECIMALS = 6;

function ensureDir(dir: string) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function saveKeypair(name: string, kp: Keypair) {
  const filePath = path.join(KEYS_DIR, `${name}.json`);
  fs.writeFileSync(filePath, JSON.stringify(Array.from(kp.secretKey)));
  console.log(`  Saved ${name}: ${kp.publicKey.toBase58()}`);
}

function loadKeypair(name: string): Keypair | null {
  const filePath = path.join(KEYS_DIR, `${name}.json`);
  if (!fs.existsSync(filePath)) return null;
  const secret = JSON.parse(fs.readFileSync(filePath, "utf-8"));
  return Keypair.fromSecretKey(new Uint8Array(secret));
}

async function airdropWithRetry(
  connection: Connection,
  pubkey: PublicKey,
  lamports: number,
  retries = 5
) {
  const solAmount = lamports / LAMPORTS_PER_SOL;
  const addr = pubkey.toBase58();

  for (let i = 0; i < retries; i++) {
    try {
      // Try RPC airdrop (works well with Helius)
      const sig = await connection.requestAirdrop(pubkey, lamports);
      await connection.confirmTransaction(sig, "confirmed");
      console.log(`  Airdropped ${solAmount} SOL to ${addr.slice(0, 8)}...`);
      return;
    } catch (e: any) {
      if (i < retries - 1) {
        const wait = 3000 * (i + 1);
        console.log(`  Airdrop attempt ${i + 1} failed, retrying in ${wait / 1000}s...`);
        await new Promise((r) => setTimeout(r, wait));
      } else {
        console.log(`  WARNING: Could not airdrop to ${addr.slice(0, 8)}... after ${retries} attempts.`);
        console.log(`  Please manually airdrop via: https://faucet.solana.com/ to ${addr}`);
        throw e;
      }
    }
  }
}

async function main() {
  console.log("=== AI Poker Platform - Solana Setup ===\n");
  ensureDir(KEYS_DIR);

  const connection = new Connection(RPC_URL, "confirmed");
  console.log(`Connected to: ${RPC_URL}\n`);

  // 1. Admin keypair
  console.log("1. Setting up admin keypair...");
  let admin = loadKeypair("admin");
  if (!admin) {
    admin = Keypair.generate();
    saveKeypair("admin", admin);
  } else {
    console.log(`  Loaded existing admin: ${admin.publicKey.toBase58()}`);
  }
  const adminBalance = await connection.getBalance(admin.publicKey);
  console.log(`  Admin balance: ${adminBalance / LAMPORTS_PER_SOL} SOL`);
  if (adminBalance < 0.1 * LAMPORTS_PER_SOL) {
    console.error("  ERROR: Admin needs SOL! Please airdrop via https://faucet.solana.com/");
    process.exit(1);
  }

  // 2. Create CHIPS token mint
  console.log("\n2. Creating CHIPS token mint...");
  let mintAddress: PublicKey;
  const mintFile = path.join(KEYS_DIR, "mint.json");
  if (fs.existsSync(mintFile)) {
    const saved = JSON.parse(fs.readFileSync(mintFile, "utf-8"));
    mintAddress = new PublicKey(saved.address);
    console.log(`  Loaded existing mint: ${mintAddress.toBase58()}`);
  } else {
    mintAddress = await createMint(
      connection,
      admin,
      admin.publicKey,
      null,
      DECIMALS
    );
    fs.writeFileSync(mintFile, JSON.stringify({ address: mintAddress.toBase58() }));
    console.log(`  Created mint: ${mintAddress.toBase58()}`);
  }

  // 3. Generate agent keypairs + pot keypair
  console.log("\n3. Setting up agent and pot wallets...");
  const wallets: { name: string; keypair: Keypair }[] = [];

  for (const name of AGENT_NAMES) {
    let kp = loadKeypair(`agent-${name.toLowerCase()}`);
    if (!kp) {
      kp = Keypair.generate();
      saveKeypair(`agent-${name.toLowerCase()}`, kp);
    } else {
      console.log(`  Loaded existing agent ${name}: ${kp.publicKey.toBase58().slice(0, 8)}...`);
    }
    wallets.push({ name, keypair: kp });
  }

  let potKp = loadKeypair("pot");
  if (!potKp) {
    potKp = Keypair.generate();
    saveKeypair("pot", potKp);
  } else {
    console.log(`  Loaded existing pot: ${potKp.publicKey.toBase58().slice(0, 8)}...`);
  }
  wallets.push({ name: "pot", keypair: potKp });

  // 4. Fund wallets with SOL from admin
  console.log("\n4. Funding wallets with SOL from admin...");
  for (const w of wallets) {
    try {
      const balance = await connection.getBalance(w.keypair.publicKey);
      if (balance < 0.05 * LAMPORTS_PER_SOL) {
        const tx = new Transaction().add(
          SystemProgram.transfer({
            fromPubkey: admin.publicKey,
            toPubkey: w.keypair.publicKey,
            lamports: 0.1 * LAMPORTS_PER_SOL,
          })
        );
        const sig = await sendAndConfirmTransaction(connection, tx, [admin], { commitment: "confirmed" });
        console.log(`  Sent 0.1 SOL to ${w.name} (${w.keypair.publicKey.toBase58().slice(0, 8)}...) | sig: ${sig.slice(0, 16)}...`);
      } else {
        console.log(`  ${w.name} already has ${balance / LAMPORTS_PER_SOL} SOL`);
      }
    } catch (e: any) {
      console.log(`  Warning: Could not fund ${w.name}: ${e.message}`);
    }
    await new Promise((r) => setTimeout(r, 500));
  }

  // 5. Create ATAs and mint tokens
  console.log("\n5. Creating token accounts and minting CHIPS...");
  for (const w of wallets) {
    try {
      const ata = await getOrCreateAssociatedTokenAccount(
        connection,
        admin,
        mintAddress,
        w.keypair.publicKey
      );
      console.log(`  ${w.name} ATA: ${ata.address.toBase58().slice(0, 8)}...`);

      // Mint tokens to agents (not pot)
      if (w.name !== "pot") {
        const amount = BigInt(CHIPS_PER_AGENT) * BigInt(10 ** DECIMALS);
        const currentBalance = ata.amount;
        if (currentBalance < amount) {
          const toMint = amount - currentBalance;
          await mintTo(
            connection,
            admin,
            mintAddress,
            ata.address,
            admin,
            toMint
          );
          console.log(`  Minted ${CHIPS_PER_AGENT} CHIPS to ${w.name}`);
        } else {
          console.log(`  ${w.name} already has sufficient CHIPS`);
        }
      }
    } catch (e: any) {
      console.error(`  Error with ${w.name}: ${e.message}`);
    }
    await new Promise((r) => setTimeout(r, 1000));
  }

  // 6. Summary
  console.log("\n=== Setup Complete ===");
  console.log(`Mint Address: ${mintAddress.toBase58()}`);
  console.log(`Admin: ${admin.publicKey.toBase58()}`);
  console.log(`Pot: ${potKp.publicKey.toBase58()}`);
  console.log("\nAgent Wallets:");
  for (const w of wallets.filter((w) => w.name !== "pot")) {
    console.log(`  ${w.name}: ${w.keypair.publicKey.toBase58()}`);
  }
  console.log("\nRun 'npm run engine' to start the game!");
}

main().catch(console.error);
