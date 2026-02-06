import { Program, AnchorProvider, BN, Wallet } from "@coral-xyz/anchor";
import { Connection, PublicKey, Keypair, SystemProgram } from "@solana/web3.js";
import { TOKEN_PROGRAM_ID, getAssociatedTokenAddress } from "@solana/spl-token";
import IDL from "../target/idl/chips_staking.json";

export const PROGRAM_ID = new PublicKey("axjx66xJAyWxVTu73uCjqzSsAopBbqEbyetD5SUFTex");

// ─── PDA helpers ────────────────────────────────────────────

export function getPoolPDA(agentIndex: number): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("pool"), Buffer.from([agentIndex])],
    PROGRAM_ID
  );
}

export function getVaultPDA(agentIndex: number): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("vault"), Buffer.from([agentIndex])],
    PROGRAM_ID
  );
}

export function getFeeVaultPDA(agentIndex: number): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("fee_vault"), Buffer.from([agentIndex])],
    PROGRAM_ID
  );
}

export function getPositionPDA(pool: PublicKey, user: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("position"), pool.toBuffer(), user.toBuffer()],
    PROGRAM_ID
  );
}

// ─── Types ──────────────────────────────────────────────────

export interface PoolData {
  agentIndex: number;
  authority: PublicKey;
  mint: PublicKey;
  vault: PublicKey;
  feeVault: PublicKey;
  totalShares: BN;
  totalAssets: BN;
  depositedAmount: BN;
  feeBasisPoints: number;
  paused: boolean;
  bump: number;
  vaultBump: number;
  feeVaultBump: number;
}

export interface PositionData {
  pool: PublicKey;
  owner: PublicKey;
  shares: BN;
  depositedAmount: BN;
  bump: number;
}

// ─── Client ─────────────────────────────────────────────────

export function getProgram(provider: AnchorProvider) {
  return new Program(IDL as any, provider);
}

export function createProvider(connection: Connection, wallet: Wallet): AnchorProvider {
  return new AnchorProvider(connection, wallet, { commitment: "confirmed" });
}

export function keypairWallet(kp: Keypair): Wallet {
  return {
    publicKey: kp.publicKey,
    signTransaction: async (tx: any) => { tx.partialSign(kp); return tx; },
    signAllTransactions: async (txs: any[]) => { txs.forEach(tx => tx.partialSign(kp)); return txs; },
    payer: kp,
  } as any;
}

// ─── Instructions ───────────────────────────────────────────

export async function initializePool(
  program: Program,
  authority: PublicKey,
  agentIndex: number,
  mint: PublicKey,
  feeBasisPoints: number = 100, // 1%
): Promise<string> {
  const [pool] = getPoolPDA(agentIndex);
  const [vault] = getVaultPDA(agentIndex);
  const [feeVault] = getFeeVaultPDA(agentIndex);

  return program.methods
    .initializePool(agentIndex, feeBasisPoints)
    .accounts({
      authority,
      pool,
      vault,
      feeVault,
      mint,
      systemProgram: SystemProgram.programId,
      tokenProgram: TOKEN_PROGRAM_ID,
    } as any)
    .rpc();
}

export async function deposit(
  program: Program,
  user: PublicKey,
  agentIndex: number,
  amount: BN,
  mint: PublicKey,
): Promise<string> {
  const [pool] = getPoolPDA(agentIndex);
  const poolData = await getPool(program, agentIndex);
  const userTokenAccount = await getAssociatedTokenAddress(mint, user);
  const [position] = getPositionPDA(pool, user);

  return program.methods
    .deposit(amount)
    .accounts({
      user,
      pool,
      vault: poolData.vault,
      feeVault: poolData.feeVault,
      position,
      userTokenAccount,
      systemProgram: SystemProgram.programId,
      tokenProgram: TOKEN_PROGRAM_ID,
    } as any)
    .rpc();
}

export async function withdraw(
  program: Program,
  user: PublicKey,
  agentIndex: number,
  shares: BN,
  mint: PublicKey,
): Promise<string> {
  const [pool] = getPoolPDA(agentIndex);
  const poolData = await getPool(program, agentIndex);
  const userTokenAccount = await getAssociatedTokenAddress(mint, user);
  const [position] = getPositionPDA(pool, user);

  return program.methods
    .withdraw(shares)
    .accounts({
      user,
      pool,
      vault: poolData.vault,
      feeVault: poolData.feeVault,
      position,
      userTokenAccount,
      tokenProgram: TOKEN_PROGRAM_ID,
    } as any)
    .rpc();
}

export async function coverLoss(
  program: Program,
  authority: PublicKey,
  agentIndex: number,
  amount: BN,
  destination: PublicKey,
): Promise<string> {
  const [pool] = getPoolPDA(agentIndex);
  const poolData = await getPool(program, agentIndex);

  return program.methods
    .coverLoss(amount)
    .accounts({
      authority,
      pool,
      vault: poolData.vault,
      destination,
      tokenProgram: TOKEN_PROGRAM_ID,
    } as any)
    .rpc();
}

export async function updateBankroll(
  program: Program,
  authority: PublicKey,
  agentIndex: number,
  newTotal: BN,
): Promise<string> {
  const [pool] = getPoolPDA(agentIndex);

  return program.methods
    .updateBankroll(newTotal)
    .accounts({
      authority,
      pool,
    } as any)
    .rpc();
}

// ─── Queries ────────────────────────────────────────────────

export async function getPool(program: Program, agentIndex: number): Promise<PoolData> {
  const [pool] = getPoolPDA(agentIndex);
  return program.account.pool.fetch(pool) as any;
}

export async function getPoolSafe(program: Program, agentIndex: number): Promise<PoolData | null> {
  try {
    return await getPool(program, agentIndex);
  } catch {
    return null;
  }
}

export async function getPosition(
  program: Program,
  agentIndex: number,
  user: PublicKey,
): Promise<PositionData | null> {
  const [pool] = getPoolPDA(agentIndex);
  const [position] = getPositionPDA(pool, user);
  try {
    return await program.account.position.fetch(position) as any;
  } catch {
    return null;
  }
}

export async function getAllPools(program: Program): Promise<(PoolData | null)[]> {
  const pools: (PoolData | null)[] = [];
  for (let i = 0; i < 8; i++) {
    pools.push(await getPoolSafe(program, i));
  }
  return pools;
}

export async function getUserPositions(
  program: Program,
  user: PublicKey,
): Promise<{ agentIndex: number; position: PositionData }[]> {
  const positions: { agentIndex: number; position: PositionData }[] = [];
  for (let i = 0; i < 8; i++) {
    const pos = await getPosition(program, i, user);
    if (pos && pos.shares.gt(new BN(0))) {
      positions.push({ agentIndex: i, position: pos });
    }
  }
  return positions;
}

// ─── Share math helpers ─────────────────────────────────────

export function sharesToAssets(shares: BN, pool: PoolData): BN {
  if (pool.totalShares.isZero()) return new BN(0);
  return shares.mul(pool.totalAssets).div(pool.totalShares);
}

export function assetsToShares(assets: BN, pool: PoolData): BN {
  if (pool.totalShares.isZero()) return assets;
  return assets.mul(pool.totalShares).div(pool.totalAssets);
}

export function sharePrice(pool: PoolData): number {
  if (pool.totalShares.isZero()) return 1;
  return pool.totalAssets.toNumber() / pool.totalShares.toNumber();
}
