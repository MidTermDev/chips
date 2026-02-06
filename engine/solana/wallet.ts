import {
  Connection,
  Keypair,
  PublicKey,
} from "@solana/web3.js";
import {
  getAssociatedTokenAddress,
  getAccount,
  TokenAccountNotFoundError,
} from "@solana/spl-token";
import * as fs from "fs";
import * as path from "path";

const KEYS_DIR = path.join(__dirname, "../../solana/keys");

export function loadKeypair(name: string): Keypair {
  const filePath = path.join(KEYS_DIR, `${name}.json`);
  const secret = JSON.parse(fs.readFileSync(filePath, "utf-8"));
  return Keypair.fromSecretKey(new Uint8Array(secret));
}

export function loadMintAddress(): PublicKey {
  const mintFile = path.join(KEYS_DIR, "mint.json");
  const data = JSON.parse(fs.readFileSync(mintFile, "utf-8"));
  return new PublicKey(data.address);
}

export function getConnection(): Connection {
  const rpcUrl = process.env.SOLANA_RPC_URL || "https://mainnet.helius-rpc.com/?api-key=fa9f0b54-4853-4415-b37e-1d2f0f03663e";
  return new Connection(rpcUrl, "confirmed");
}

export async function getTokenBalance(
  connection: Connection,
  mintAddress: PublicKey,
  owner: PublicKey
): Promise<bigint> {
  try {
    const ata = await getAssociatedTokenAddress(mintAddress, owner);
    const account = await getAccount(connection, ata);
    return account.amount;
  } catch (e) {
    if (e instanceof TokenAccountNotFoundError) return BigInt(0);
    throw e;
  }
}

export function tokenAmountToDisplay(amount: bigint, decimals = 6): number {
  return Number(amount) / 10 ** decimals;
}

export function displayToTokenAmount(display: number, decimals = 6): bigint {
  return BigInt(Math.round(display * 10 ** decimals));
}
