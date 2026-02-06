import {
  Connection,
  Keypair,
  PublicKey,
  Transaction,
  sendAndConfirmTransaction,
} from "@solana/web3.js";
import {
  getAssociatedTokenAddress,
  getAccount,
  createTransferInstruction,
  createBurnInstruction,
  getOrCreateAssociatedTokenAccount,
} from "@solana/spl-token";
import { AnchorProvider, Program, BN } from "@coral-xyz/anchor";

const STAKING_PROGRAM_ID = new PublicKey("6K4Er44wfQDDnGNUbRc8ucrceb5iwAJi8bEtbbpzKbQc");

const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 2000;

async function withRetry<T>(fn: () => Promise<T>, label: string): Promise<T> {
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      return await fn();
    } catch (e: any) {
      console.error(`  [${label}] Attempt ${attempt}/${MAX_RETRIES} failed: ${e.message}`);
      if (attempt < MAX_RETRIES) {
        await new Promise((r) => setTimeout(r, RETRY_DELAY_MS * attempt));
      } else {
        throw e;
      }
    }
  }
  throw new Error("unreachable");
}

export async function transferTokens(
  connection: Connection,
  mintAddress: PublicKey,
  from: Keypair,
  to: PublicKey,
  amount: bigint,
  payer?: Keypair
): Promise<string> {
  return withRetry(async () => {
    const fromAta = await getAssociatedTokenAddress(mintAddress, from.publicKey);
    // Ensure the recipient ATA exists
    const toAtaAccount = await getOrCreateAssociatedTokenAccount(
      connection,
      payer || from,
      mintAddress,
      to
    );

    const tx = new Transaction().add(
      createTransferInstruction(
        fromAta,
        toAtaAccount.address,
        from.publicKey,
        amount
      )
    );

    const sig = await sendAndConfirmTransaction(connection, tx, [payer || from, from].filter(
      (v, i, a) => a.findIndex(k => k.publicKey.equals(v.publicKey)) === i
    ), {
      commitment: "confirmed",
    });

    console.log(`  Transfer ${amount} tokens: ${from.publicKey.toBase58().slice(0, 8)}... -> ${to.toBase58().slice(0, 8)}... | sig: ${sig.slice(0, 16)}...`);
    return sig;
  }, "transfer");
}

export async function burnTokens(
  connection: Connection,
  mintAddress: PublicKey,
  owner: Keypair,
  amount: bigint
): Promise<string> {
  return withRetry(async () => {
    const ata = await getAssociatedTokenAddress(mintAddress, owner.publicKey);

    const tx = new Transaction().add(
      createBurnInstruction(ata, mintAddress, owner.publicKey, amount)
    );

    const sig = await sendAndConfirmTransaction(connection, tx, [owner], {
      commitment: "confirmed",
    });

    console.log(`  Burned ${amount} tokens from ${owner.publicKey.toBase58().slice(0, 8)}... | sig: ${sig.slice(0, 16)}...`);
    return sig;
  }, "burn");
}

// ─── Staking pool bankroll update ────────────────────────────

let stakingProgram: Program | null = null;

function getStakingProgram(connection: Connection, authority: Keypair): Program {
  if (stakingProgram) return stakingProgram;

  const wallet = {
    publicKey: authority.publicKey,
    signTransaction: async (tx: any) => { tx.partialSign(authority); return tx; },
    signAllTransactions: async (txs: any[]) => { txs.forEach(t => t.partialSign(authority)); return txs; },
    payer: authority,
  };
  const provider = new AnchorProvider(connection, wallet as any, { commitment: "confirmed" });

  // Minimal IDL for update_bankroll only
  const IDL = {
    address: STAKING_PROGRAM_ID.toBase58(),
    metadata: { name: "chipsStaking", version: "0.1.0", spec: "0.1.0", description: "" },
    instructions: [
      {
        name: "updateBankroll",
        discriminator: [70, 42, 17, 210, 31, 149, 35, 191],
        accounts: [
          { name: "authority", signer: true },
          { name: "pool", writable: true },
        ],
        args: [{ name: "newTotal", type: "u64" }],
      },
      {
        name: "coverLoss",
        discriminator: [219, 214, 110, 40, 255, 84, 61, 60],
        accounts: [
          { name: "authority", signer: true },
          { name: "pool", writable: true },
          { name: "vault", writable: true },
          { name: "destination", writable: true },
          { name: "tokenProgram", address: "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA" },
        ],
        args: [{ name: "amount", type: "u64" }],
      },
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
    accounts: [{
      name: "pool",
      discriminator: [241, 154, 109, 4, 17, 177, 109, 188],
    }],
    types: [{
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
    }],
    errors: [],
  };

  stakingProgram = new Program(IDL as any, provider);
  return stakingProgram;
}

function getPoolPDA(agentIndex: number): PublicKey {
  const [pda] = PublicKey.findProgramAddressSync(
    [Buffer.from("pool"), Buffer.from([agentIndex])],
    STAKING_PROGRAM_ID
  );
  return pda;
}

function getVaultPDA(agentIndex: number): PublicKey {
  const [pda] = PublicKey.findProgramAddressSync(
    [Buffer.from("vault"), Buffer.from([agentIndex])],
    STAKING_PROGRAM_ID
  );
  return pda;
}

export async function getVaultBalance(
  connection: Connection,
  agentIndex: number,
  expectedMint?: PublicKey,
): Promise<bigint> {
  try {
    const vault = getVaultPDA(agentIndex);
    const account = await getAccount(connection, vault);
    // If mint specified, only return balance if vault mint matches
    if (expectedMint && !account.mint.equals(expectedMint)) {
      return BigInt(0);
    }
    return account.amount;
  } catch {
    return BigInt(0);
  }
}

export async function getPoolData(
  connection: Connection,
  authority: Keypair,
  agentIndex: number,
): Promise<{ totalAssets: bigint; totalShares: bigint } | null> {
  try {
    const program = getStakingProgram(connection, authority);
    const pda = getPoolPDA(agentIndex);
    const raw: any = await (program.account as any).pool.fetch(pda);
    return {
      totalAssets: BigInt(raw.totalAssets.toString()),
      totalShares: BigInt(raw.totalShares.toString()),
    };
  } catch {
    return null;
  }
}

export async function transferToVault(
  connection: Connection,
  mintAddress: PublicKey,
  from: Keypair,
  agentIndex: number,
  amount: bigint,
): Promise<string> {
  return withRetry(async () => {
    const fromAta = await getAssociatedTokenAddress(mintAddress, from.publicKey);
    const vault = getVaultPDA(agentIndex);

    const tx = new Transaction().add(
      createTransferInstruction(fromAta, vault, from.publicKey, amount)
    );

    const sig = await sendAndConfirmTransaction(connection, tx, [from], {
      commitment: "confirmed",
    });

    console.log(`  [staking] Agent ${agentIndex} -> vault: ${amount} tokens | sig: ${sig.slice(0, 16)}...`);
    return sig;
  }, "transferToVault");
}

export async function updatePoolBankroll(
  connection: Connection,
  authority: Keypair,
  agentIndex: number,
  newTotalTokens: bigint,
): Promise<string | null> {
  try {
    const program = getStakingProgram(connection, authority);
    const pool = getPoolPDA(agentIndex);

    // Check if pool exists first
    const accountInfo = await connection.getAccountInfo(pool);
    if (!accountInfo) return null; // Pool not initialized, skip

    const sig = await program.methods
      .updateBankroll(new BN(newTotalTokens.toString()))
      .accounts({
        authority: authority.publicKey,
        pool,
      } as any)
      .rpc();

    return sig;
  } catch (e: any) {
    console.error(`  [staking] updateBankroll agent ${agentIndex}: ${e.message}`);
    return null;
  }
}

export async function coverLoss(
  connection: Connection,
  authority: Keypair,
  agentIndex: number,
  amount: bigint,
  destination: PublicKey,
): Promise<string | null> {
  try {
    const program = getStakingProgram(connection, authority);
    const pool = getPoolPDA(agentIndex);
    const vault = getVaultPDA(agentIndex);

    const sig = await program.methods
      .coverLoss(new BN(amount.toString()))
      .accounts({
        authority: authority.publicKey,
        pool,
        vault,
        destination,
        tokenProgram: new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"),
      } as any)
      .rpc();

    console.log(`  [staking] Covered loss for agent ${agentIndex}: ${amount} tokens | sig: ${sig.slice(0, 16)}...`);
    return sig;
  } catch (e: any) {
    console.error(`  [staking] coverLoss agent ${agentIndex}: ${e.message}`);
    return null;
  }
}

export async function transferToVaultPDA(
  connection: Connection,
  mint: PublicKey,
  from: Keypair,
  vaultPDA: PublicKey,
  amount: bigint,
): Promise<string> {
  return withRetry(async () => {
    const fromAta = await getAssociatedTokenAddress(mint, from.publicKey);

    const tx = new Transaction().add(
      createTransferInstruction(fromAta, vaultPDA, from.publicKey, amount)
    );

    const sig = await sendAndConfirmTransaction(connection, tx, [from], {
      commitment: "confirmed",
    });

    console.log(`  [staking] Transferred ${amount} to vault PDA | sig: ${sig.slice(0, 16)}...`);
    return sig;
  }, "transferToVaultPDA");
}

export async function initializePoolOnChain(
  connection: Connection,
  authority: Keypair,
  mint: PublicKey,
  agentIndex: number,
  feeBps: number,
): Promise<string | null> {
  try {
    const program = getStakingProgram(connection, authority);

    // Add initialize_pool to IDL if not already present
    const pool = getPoolPDA(agentIndex);
    const vault = getVaultPDA(agentIndex);

    // Check if pool already exists
    const existingPool = await connection.getAccountInfo(pool);
    if (existingPool) {
      // Check if existing pool's vault uses the correct mint
      try {
        const vaultAccount = await getAccount(connection, vault);
        if (!vaultAccount.mint.equals(mint)) {
          console.log(`  [staking] Pool ${agentIndex} exists with WRONG mint (${vaultAccount.mint.toBase58().slice(0,8)}... vs ${mint.toBase58().slice(0,8)}...) — cannot reuse`);
          return null;
        }
      } catch {}
      console.log(`  [staking] Pool for agent ${agentIndex} already exists`);
      return null;
    }

    const [feeVault] = PublicKey.findProgramAddressSync(
      [Buffer.from("fee_vault"), Buffer.from([agentIndex])],
      STAKING_PROGRAM_ID
    );

    const sig = await program.methods
      .initializePool(agentIndex, feeBps)
      .accounts({
        authority: authority.publicKey,
        pool,
        vault,
        feeVault,
        mint,
        systemProgram: new PublicKey("11111111111111111111111111111111"),
        tokenProgram: new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"),
      } as any)
      .rpc();

    console.log(`  [staking] Initialized pool for agent ${agentIndex} | sig: ${sig.slice(0, 16)}...`);
    return sig;
  } catch (e: any) {
    console.error(`  [staking] initializePool agent ${agentIndex}: ${e.message}`);
    return null;
  }
}

// Re-export vault helpers for external use
export { getVaultPDA, getPoolPDA };
