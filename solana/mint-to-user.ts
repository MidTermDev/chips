import "dotenv/config";
import {
  Connection,
  Keypair,
  PublicKey,
} from "@solana/web3.js";
import {
  getOrCreateAssociatedTokenAccount,
  mintTo,
} from "@solana/spl-token";
import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const KEYS_DIR = path.join(__dirname, "keys");
const RPC_URL = process.env.SOLANA_RPC_URL || "https://api.devnet.solana.com";
const DECIMALS = 6;
const AMOUNT = 10_000_000; // 10M CHIPS

async function main() {
  const userPubkey = process.argv[2];
  if (!userPubkey) {
    console.error("Usage: npx ts-node solana/mint-to-user.ts <WALLET_PUBKEY>");
    process.exit(1);
  }

  const connection = new Connection(RPC_URL, "confirmed");
  const user = new PublicKey(userPubkey);

  // Load admin keypair (mint authority)
  const adminSecret = JSON.parse(fs.readFileSync(path.join(KEYS_DIR, "admin.json"), "utf-8"));
  const admin = Keypair.fromSecretKey(new Uint8Array(adminSecret));

  // Load mint address
  const mintData = JSON.parse(fs.readFileSync(path.join(KEYS_DIR, "mint.json"), "utf-8"));
  const mint = new PublicKey(mintData.address);

  console.log(`Mint:  ${mint.toBase58()}`);
  console.log(`Admin: ${admin.publicKey.toBase58()}`);
  console.log(`User:  ${user.toBase58()}`);
  console.log(`Amount: ${AMOUNT.toLocaleString()} CHIPS\n`);

  // Create ATA for user (or get existing)
  console.log("Creating/fetching user ATA...");
  const ata = await getOrCreateAssociatedTokenAccount(
    connection,
    admin, // payer
    mint,
    user,
  );
  console.log(`  ATA: ${ata.address.toBase58()}`);
  console.log(`  Current balance: ${Number(ata.amount) / 1e6} CHIPS`);

  // Mint tokens
  console.log(`\nMinting ${AMOUNT.toLocaleString()} CHIPS...`);
  const sig = await mintTo(
    connection,
    admin,
    mint,
    ata.address,
    admin, // mint authority
    BigInt(AMOUNT) * BigInt(10 ** DECIMALS),
  );
  console.log(`  Signature: ${sig}`);

  // Verify
  const updated = await connection.getTokenAccountBalance(ata.address);
  console.log(`  New balance: ${updated.value.uiAmountString} CHIPS`);
  console.log("\nDone! You can now deposit into staking pools.");
}

main().catch(console.error);
