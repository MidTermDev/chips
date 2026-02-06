"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { PublicKey } from "@solana/web3.js";
import { AnchorProvider, Program, BN } from "@coral-xyz/anchor";
import {
  getAssociatedTokenAddress,
  createAssociatedTokenAccountInstruction,
  ASSOCIATED_TOKEN_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
} from "@solana/spl-token";

const PROGRAM_ID = new PublicKey("6K4Er44wfQDDnGNUbRc8ucrceb5iwAJi8bEtbbpzKbQc");
const MINT_ADDRESS = process.env.NEXT_PUBLIC_CHIPS_MINT || "";

// ─── PDA helpers ─────────────────────────────────────────────

function getPoolPDA(agentIndex: number): PublicKey {
  const [pda] = PublicKey.findProgramAddressSync(
    [Buffer.from("pool"), Buffer.from([agentIndex])],
    PROGRAM_ID
  );
  return pda;
}

function getPositionPDA(pool: PublicKey, user: PublicKey): PublicKey {
  const [pda] = PublicKey.findProgramAddressSync(
    [Buffer.from("position"), pool.toBuffer(), user.toBuffer()],
    PROGRAM_ID
  );
  return pda;
}

// ─── Types ───────────────────────────────────────────────────

export interface PoolInfo {
  agentIndex: number;
  totalShares: number;
  totalAssets: number;
  depositedAmount: number;
  feeBasisPoints: number;
  paused: boolean;
  sharePrice: number;
  vault: PublicKey;
  feeVault: PublicKey;
}

export interface PositionInfo {
  shares: number;
  depositedAmount: number;
  currentValue: number;
  pnl: number;
}

// ─── IDL (inline minimal version for frontend) ───────────────

const IDL_JSON = {
  address: "6K4Er44wfQDDnGNUbRc8ucrceb5iwAJi8bEtbbpzKbQc",
  metadata: { name: "chipsStaking", version: "0.1.0", spec: "0.1.0", description: "" },
  instructions: [
    {
      name: "deposit",
      discriminator: [242, 35, 198, 137, 82, 225, 242, 182],
      accounts: [
        { name: "user", writable: true, signer: true },
        { name: "pool", writable: true },
        { name: "vault", writable: true },
        { name: "feeVault", writable: true },
        { name: "position", writable: true },
        { name: "userTokenAccount", writable: true },
        { name: "systemProgram", address: "11111111111111111111111111111111" },
        { name: "tokenProgram", address: "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA" },
      ],
      args: [{ name: "amount", type: "u64" }],
    },
    {
      name: "withdraw",
      discriminator: [183, 18, 70, 156, 148, 109, 161, 34],
      accounts: [
        { name: "user", writable: true, signer: true },
        { name: "pool", writable: true },
        { name: "vault", writable: true },
        { name: "feeVault", writable: true },
        { name: "position", writable: true },
        { name: "userTokenAccount", writable: true },
        { name: "tokenProgram", address: "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA" },
      ],
      args: [{ name: "shares", type: "u64" }],
    },
  ],
  accounts: [
    { name: "pool", discriminator: [241, 154, 109, 4, 17, 177, 109, 188] },
    { name: "position", discriminator: [170, 188, 143, 228, 122, 64, 247, 208] },
  ],
  types: [
    {
      name: "pool",
      type: {
        kind: "struct",
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
    {
      name: "position",
      type: {
        kind: "struct",
        fields: [
          { name: "pool", type: "pubkey" },
          { name: "owner", type: "pubkey" },
          { name: "shares", type: "u64" },
          { name: "depositedAmount", type: "u64" },
          { name: "bump", type: "u8" },
        ],
      },
    },
  ],
  errors: [],
};

// ─── Hook ────────────────────────────────────────────────────

export function useStaking() {
  const { connection } = useConnection();
  const wallet = useWallet();

  const [pools, setPools] = useState<Record<number, PoolInfo | null>>({});
  const [positions, setPositions] = useState<Record<number, PositionInfo | null>>({});
  const [loading, setLoading] = useState(false);
  const [txPending, setTxPending] = useState(false);
  const programRef = useRef<Program | null>(null);

  // Get or create program instance
  const getProgram = useCallback((): Program | null => {
    if (!wallet.publicKey || !wallet.signTransaction) return null;
    const provider = new AnchorProvider(
      connection,
      wallet as any,
      { commitment: "confirmed" }
    );
    const program = new Program(IDL_JSON as any, provider);
    programRef.current = program;
    return program;
  }, [connection, wallet]);

  // Fetch all pool data
  const refreshPools = useCallback(async () => {
    const program = getProgram();
    if (!program) {
      // Fetch pool data without a wallet (read-only)
      const readProvider = new AnchorProvider(
        connection,
        { publicKey: PublicKey.default, signTransaction: async (tx: any) => tx, signAllTransactions: async (txs: any) => txs } as any,
        { commitment: "confirmed" }
      );
      const readProgram = new Program(IDL_JSON as any, readProvider);
      await fetchPoolData(readProgram);
      return;
    }
    await fetchPoolData(program);
  }, [connection, getProgram]);

  const fetchPoolData = async (program: Program) => {
    const poolResults: Record<number, PoolInfo | null> = {};
    const expectedMint = MINT_ADDRESS ? new PublicKey(MINT_ADDRESS) : null;
    // Scan pool indices 8-32 (skips 0-7 reserved range, covers allocated agents)
    for (let i = 8; i < 32; i++) {
      try {
        const pda = getPoolPDA(i);
        const raw: any = await (program.account as any).pool.fetch(pda);
        // Skip pools initialized with a different mint
        if (expectedMint && raw.mint && !new PublicKey(raw.mint).equals(expectedMint)) {
          continue;
        }
        const totalShares = raw.totalShares.toNumber();
        const totalAssets = raw.totalAssets.toNumber();
        poolResults[i] = {
          agentIndex: raw.agentIndex,
          totalShares,
          totalAssets,
          depositedAmount: raw.depositedAmount.toNumber(),
          feeBasisPoints: raw.feeBasisPoints,
          paused: raw.paused,
          sharePrice: totalShares > 0 ? totalAssets / totalShares : 1,
          vault: raw.vault,
          feeVault: raw.feeVault,
        };
      } catch {
        // Pool doesn't exist at this index
      }
    }
    setPools(poolResults);
  };

  // Fetch user positions
  const refreshPositions = useCallback(async () => {
    if (!wallet.publicKey) {
      setPositions({});
      return;
    }
    const program = getProgram();
    if (!program) return;

    const posResults: Record<number, PositionInfo | null> = {};
    // Check positions for all pool indices that exist
    const poolIndices = Object.keys(pools).map(Number);
    for (const i of poolIndices) {
      try {
        const poolPDA = getPoolPDA(i);
        const posPDA = getPositionPDA(poolPDA, wallet.publicKey);
        const raw: any = await (program.account as any).position.fetch(posPDA);
        const shares = raw.shares.toNumber();
        const deposited = raw.depositedAmount.toNumber();
        const pool = pools[i];
        const currentValue = pool && pool.totalShares > 0
          ? Math.floor(shares * pool.totalAssets / pool.totalShares)
          : 0;
        posResults[i] = {
          shares,
          depositedAmount: deposited,
          currentValue,
          pnl: currentValue - deposited,
        };
      } catch {
        // No position at this pool
      }
    }
    setPositions(posResults);
  }, [wallet.publicKey, pools, getProgram]);

  // Helper: build tx, optionally prepend ATA creation, send via wallet adapter
  const sendTx = useCallback(async (tx: import("@solana/web3.js").Transaction, mint: PublicKey) => {
    if (!wallet.publicKey || !wallet.sendTransaction) throw new Error("Wallet not connected");
    const userATA = await getAssociatedTokenAddress(mint, wallet.publicKey);
    const ataInfo = await connection.getAccountInfo(userATA);
    if (!ataInfo) {
      tx.instructions.unshift(
        createAssociatedTokenAccountInstruction(
          wallet.publicKey, userATA, wallet.publicKey, mint,
        )
      );
    }
    const sig = await wallet.sendTransaction(tx, connection, { skipPreflight: false });
    await connection.confirmTransaction(sig, "confirmed");
    return sig;
  }, [connection, wallet]);

  // Deposit
  const doDeposit = useCallback(async (agentIndex: number, displayAmount: number) => {
    const program = getProgram();
    if (!program || !wallet.publicKey || !MINT_ADDRESS) return;

    setTxPending(true);
    try {
      const mint = new PublicKey(MINT_ADDRESS);
      const amount = new BN(Math.round(displayAmount * 1e6));
      const poolPDA = getPoolPDA(agentIndex);
      const pool = pools[agentIndex];
      if (!pool) throw new Error("Pool not initialized");

      const userATA = await getAssociatedTokenAddress(mint, wallet.publicKey);
      const [position] = PublicKey.findProgramAddressSync(
        [Buffer.from("position"), poolPDA.toBuffer(), wallet.publicKey.toBuffer()],
        PROGRAM_ID
      );

      const tx = await program.methods
        .deposit(amount)
        .accounts({
          user: wallet.publicKey,
          pool: poolPDA,
          vault: pool.vault,
          feeVault: pool.feeVault,
          position,
          userTokenAccount: userATA,
          systemProgram: new PublicKey("11111111111111111111111111111111"),
          tokenProgram: new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"),
        } as any)
        .transaction();

      const sig = await sendTx(tx, mint);
      console.log(`Deposit sig: ${sig}`);
      await refreshPools();
      await refreshPositions();
    } finally {
      setTxPending(false);
    }
  }, [connection, wallet, pools, getProgram, sendTx, refreshPools, refreshPositions]);

  // Withdraw
  const doWithdraw = useCallback(async (agentIndex: number, shares: number) => {
    const program = getProgram();
    if (!program || !wallet.publicKey || !MINT_ADDRESS) return;

    setTxPending(true);
    try {
      const mint = new PublicKey(MINT_ADDRESS);
      const poolPDA = getPoolPDA(agentIndex);
      const pool = pools[agentIndex];
      if (!pool) throw new Error("Pool not initialized");

      const userATA = await getAssociatedTokenAddress(mint, wallet.publicKey);
      const [position] = PublicKey.findProgramAddressSync(
        [Buffer.from("position"), poolPDA.toBuffer(), wallet.publicKey.toBuffer()],
        PROGRAM_ID
      );

      const tx = await program.methods
        .withdraw(new BN(shares))
        .accounts({
          user: wallet.publicKey,
          pool: poolPDA,
          vault: pool.vault,
          feeVault: pool.feeVault,
          position,
          userTokenAccount: userATA,
          tokenProgram: new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"),
        } as any)
        .transaction();

      const sig = await sendTx(tx, mint);
      console.log(`Withdraw sig: ${sig}`);
      await refreshPools();
      await refreshPositions();
    } finally {
      setTxPending(false);
    }
  }, [connection, wallet, pools, getProgram, sendTx, refreshPools, refreshPositions]);

  // Auto-refresh pools periodically
  useEffect(() => {
    refreshPools();
    const interval = setInterval(refreshPools, 15000);
    return () => clearInterval(interval);
  }, [refreshPools]);

  // Refresh positions when wallet connects or pools change
  useEffect(() => {
    if (wallet.publicKey) refreshPositions();
  }, [wallet.publicKey, refreshPositions]);

  return {
    pools,
    positions,
    loading,
    txPending,
    deposit: doDeposit,
    withdraw: doWithdraw,
    refreshPools,
    refreshPositions,
    connected: wallet.connected,
  };
}
