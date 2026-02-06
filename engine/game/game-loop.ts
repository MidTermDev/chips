import { Connection, Keypair, PublicKey } from "@solana/web3.js";
import { PokerGame } from "../poker/game";
import { GameState, BettingRound, cardToDisplay } from "../poker/types";
import { GameServer } from "../server/websocket";
import { PlayerRegistry } from "../registry/player-registry";
import { TurnManager } from "./turn-manager";
import { saveRegistry } from "../registry/persistence";
import { ProfileStore, HandResult } from "../registry/profile-store";
import {
  HAND_DELAY_MS,
  ACTION_DELAY_MS,
  SHOWDOWN_DELAY_MS,
  BETWEEN_ROUNDS_DELAY_MS,
  MIN_PLAYERS,
  MAX_PLAYERS,
} from "../protocol/constants";
import { CardData } from "../protocol/messages";
import {
  loadKeypair,
  loadMintAddress,
  getConnection,
  tokenAmountToDisplay,
  displayToTokenAmount,
} from "../solana/wallet";
import {
  burnTokens,
  updatePoolBankroll,
  getVaultBalance,
  coverLoss,
  transferToVaultPDA,
  getVaultPDA,
} from "../solana/transactions";
import { VerificationStore } from "../registry/verification-store";
import { getAssociatedTokenAddress } from "@solana/spl-token";

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

function cardToCardData(c: { rank: string; suit: string }): CardData {
  return { rank: c.rank, suit: c.suit, display: cardToDisplay(c as any) };
}

export class GameLoop {
  private server: GameServer;
  private registry: PlayerRegistry;
  private turnManager: TurnManager;
  private game: PokerGame | null = null;
  private running: boolean = false;

  // Solana resources
  private useBlockchain: boolean;
  private connection!: Connection;
  private mintAddress!: PublicKey;
  private adminKeypair!: Keypair;
  private potKeypair!: Keypair;
  private potATA!: PublicKey;

  // Profile tracking
  private profileStore: ProfileStore | null;
  private verificationStore: VerificationStore | null;
  private handActionTrackers: Map<number, { vpip: boolean; pfr: boolean; bets: number; raises: number; startChips: number }> = new Map();

  constructor(
    server: GameServer,
    registry: PlayerRegistry,
    turnManager: TurnManager,
    useBlockchain: boolean,
    profileStore?: ProfileStore,
    verificationStore?: VerificationStore,
  ) {
    this.server = server;
    this.registry = registry;
    this.turnManager = turnManager;
    this.useBlockchain = useBlockchain;
    this.profileStore = profileStore || null;
    this.verificationStore = verificationStore || null;
  }

  async initialize(): Promise<void> {
    if (this.useBlockchain) {
      this.connection = getConnection();
      this.mintAddress = loadMintAddress();
      this.adminKeypair = loadKeypair("admin");
      this.potKeypair = loadKeypair("pot");
      this.potATA = await getAssociatedTokenAddress(this.mintAddress, this.potKeypair.publicKey);
      console.log(`Mint: ${this.mintAddress.toBase58()}`);
      console.log(`Pot wallet: ${this.potKeypair.publicKey.toBase58()}`);
      console.log(`Pot ATA: ${this.potATA.toBase58()}`);
    } else {
      console.log("[Mode] Running WITHOUT blockchain transactions");
      this.connection = null as any;
      this.mintAddress = null as any;
      this.adminKeypair = null as any;
      this.potKeypair = null as any;
      this.potATA = null as any;
    }
  }

  async start(): Promise<void> {
    this.running = true;
    let handCount = 0;

    console.log("\n=== Starting Game Loop ===\n");
    console.log("[GameLoop] Waiting for players...");

    while (this.running) {
      // Wait for minimum players — periodically sync vault balances
      // so agents with funded vaults get nonzero chip counts
      while (this.running && this.registry.getActiveCount() < MIN_PLAYERS) {
        if (this.useBlockchain) {
          let updated = false;
          for (const agent of this.registry.getSeatedAgents()) {
            if (agent.sittingOut) continue;
            try {
              const vaultBal = await getVaultBalance(this.connection, agent.poolIndex, this.mintAddress);
              const displayBal = tokenAmountToDisplay(vaultBal);
              if (displayBal !== agent.chips) {
                this.registry.updateChips(agent.seat, displayBal);
                console.log(`[GameLoop] ${agent.name} (pool ${agent.poolIndex}): vault balance ${displayBal.toLocaleString()}`);
                updated = true;
              }
            } catch {}
          }
          if (updated) {
            this.server.broadcastLobbyState();
          }
        }
        await delay(3000);
      }
      if (!this.running) break;

      // Sync registry to game
      this.syncGameFromRegistry();

      // Check again after sync
      const activePlayers = this.registry.getActiveAgents();
      if (activePlayers.length < MIN_PLAYERS) continue;

      handCount++;
      this.server.setHandInProgress(true);

      console.log(`\n${"=".repeat(60)}`);
      console.log(`  HAND #${handCount}`);
      console.log(`${"=".repeat(60)}\n`);

      await this.playHand(handCount);

      this.server.setHandInProgress(false);

      // Save registry snapshot
      saveRegistry(this.registry);

      // Check if game should end
      const remainingPlayers = this.registry.getActiveAgents().filter(a => a.chips > 0);
      if (remainingPlayers.length <= 1 && this.registry.getSeatedAgents().length > 1) {
        if (remainingPlayers.length === 1) {
          console.log(`\n=== ${remainingPlayers[0].name} wins the tournament! ===`);
        }
        // Don't break - wait for new players to join
      }

      console.log(`\n  Waiting ${HAND_DELAY_MS / 1000}s before next hand...`);
      await delay(HAND_DELAY_MS);
    }
  }

  stop(): void {
    this.running = false;
  }

  private syncGameFromRegistry(): void {
    const agents = this.registry.getSeatedAgents();
    const names: string[] = new Array(MAX_PLAYERS).fill("");
    const chips: number[] = new Array(MAX_PLAYERS).fill(0);

    for (const agent of agents) {
      names[agent.seat] = agent.name;
      chips[agent.seat] = agent.sittingOut ? 0 : agent.chips;
    }

    if (!this.game) {
      this.game = new PokerGame(names, chips);
    } else {
      // Update existing game
      for (let i = 0; i < MAX_PLAYERS; i++) {
        if (names[i]) {
          this.game.addPlayer(i, names[i], chips[i]);
        } else {
          this.game.removePlayer(i);
        }
      }
      this.game.updatePlayerChips(chips);
    }
  }

  private async playHand(handCount: number): Promise<void> {
    if (!this.game) return;

    // Update chip counts from vault balances (blockchain mode)
    // Sync ALL seated agents (not just active) so newly funded agents get picked up
    if (this.useBlockchain) {
      for (const agent of this.registry.getSeatedAgents()) {
        if (agent.sittingOut) continue;
        try {
          const vaultBal = await getVaultBalance(this.connection, agent.poolIndex, this.mintAddress);
          const displayBal = tokenAmountToDisplay(vaultBal);
          this.game.addPlayer(agent.seat, agent.name, displayBal);
          this.registry.updateChips(agent.seat, displayBal);
        } catch {}
      }
    }

    // Start new hand
    const blinds = this.game.startNewHand();
    const state = this.game.getState();
    this.server.setHandCount(handCount);

    // Initialize per-seat action trackers for profile stats
    this.handActionTrackers.clear();
    for (const agent of this.registry.getActiveAgents()) {
      const p = state.players[agent.seat];
      this.handActionTrackers.set(agent.seat, {
        vpip: false, pfr: false, bets: 0, raises: 0,
        startChips: p ? p.chips : agent.chips,
      });
    }

    console.log(`  Dealer: ${state.players[state.dealerIndex]?.name}`);
    console.log(`  SB: ${state.players[state.smallBlindIndex]?.name} (${blinds.smallBlind.amount})`);
    console.log(`  BB: ${state.players[state.bigBlindIndex]?.name} (${blinds.bigBlind.amount})`);

    // Build player info for broadcast
    const playerInfos = this.buildPlayerInfos(state);

    // Broadcast new_hand to each agent with their hole cards
    for (const agent of this.registry.getSeatedAgents()) {
      const player = state.players[agent.seat];
      if (!player || player.sittingOut) continue;

      this.server.sendToAgent(agent.agentId, "new_hand", {
        type: "new_hand",
        handNumber: state.handNumber,
        holeCards: player.holeCards.map(cardToCardData),
        dealer: state.dealerIndex,
        smallBlind: { seat: state.smallBlindIndex, amount: blinds.smallBlind.amount },
        bigBlind: { seat: state.bigBlindIndex, amount: blinds.bigBlind.amount },
        players: playerInfos,
      });
    }

    // Broadcast new_hand to spectators (no hole cards)
    this.server.broadcastSpectators("new_hand", {
      type: "new_hand",
      handNumber: state.handNumber,
      holeCards: [],
      dealer: state.dealerIndex,
      smallBlind: { seat: state.smallBlindIndex, amount: blinds.smallBlind.amount },
      bigBlind: { seat: state.bigBlindIndex, amount: blinds.bigBlind.amount },
      players: playerInfos,
    });

    // Post blinds on-chain (vault -> pot via coverLoss)
    if (this.useBlockchain) {
      await this.postBlindsOnChain(blinds);
    }

    this.server.broadcast("blinds_posted", {
      type: "blinds_posted",
      smallBlind: { seat: state.smallBlindIndex, name: state.players[state.smallBlindIndex]?.name, amount: blinds.smallBlind.amount },
      bigBlind: { seat: state.bigBlindIndex, name: state.players[state.bigBlindIndex]?.name, amount: blinds.bigBlind.amount },
      pot: state.pot,
    });

    // Log hole cards
    for (const p of state.players) {
      if (!p.sittingOut && p.holeCards.length > 0) {
        console.log(`  ${p.name}: ${p.holeCards.map(cardToDisplay).join(" ")}`);
      }
    }

    // Betting rounds
    const rounds: BettingRound[] = ["preflop", "flop", "turn", "river"];
    let handOver = false;

    for (const round of rounds) {
      if (handOver) break;

      if (round !== "preflop") {
        const canBet = this.game.startBettingRound(round);
        const updatedState = this.game.getState();

        if (updatedState.communityCards.length > 0) {
          console.log(
            `\n  --- ${round.toUpperCase()} --- [${updatedState.communityCards.map(cardToDisplay).join(" ")}]`
          );

          this.server.broadcast("community_cards", {
            type: "community_cards",
            round,
            cards: updatedState.communityCards.map(cardToCardData),
          });

          await delay(BETWEEN_ROUNDS_DELAY_MS);
        }

        if (!canBet) {
          console.log(`  (No betting possible this round)`);
          continue;
        }
      } else {
        console.log(`\n  --- PREFLOP ---`);
      }

      // Betting loop
      let roundComplete = false;
      let safetyCounter = 0;
      const maxActions = MAX_PLAYERS * 4;

      while (!roundComplete && safetyCounter < maxActions) {
        safetyCounter++;
        const currentState = this.game.getState();
        const activePlayers = this.game.getActivePlayers();

        if (activePlayers.length <= 1) {
          handOver = true;
          break;
        }

        const validActions = this.game.getValidActions();
        if (validActions.length === 0) {
          roundComplete = true;
          break;
        }

        const activePlayer = currentState.players[currentState.activePlayerIndex];
        const seat = currentState.activePlayerIndex;
        const agent = this.registry.getBySeat(seat);

        // Sync disconnect status: if agent disconnected mid-hand, fold them
        if (agent && (agent.sittingOut || !agent.ws) && !activePlayer.sittingOut && !activePlayer.folded) {
          console.log(`  ${activePlayer.name} disconnected mid-hand, auto-folding`);
          this.game.applyAction("fold", 0);
          this.server.broadcast("player_action", {
            type: "player_action",
            seat,
            name: activePlayer.name,
            action: "fold",
            amount: 0,
            reasoning: "Agent disconnected",
            pot: this.game.getState().pot,
          });
          roundComplete = this.game.advanceToNextPlayer();
          continue;
        }

        if (activePlayer.folded || activePlayer.allIn || activePlayer.sittingOut) {
          roundComplete = this.game.advanceToNextPlayer();
          continue;
        }

        // Broadcast thinking state
        this.server.broadcast("agent_thinking", {
          type: "agent_thinking",
          seat,
          name: agent?.name || activePlayer.name,
          avatar: agent?.avatar || "",
        });

        console.log(`  ${activePlayer.name}'s turn...`);

        // Get decision
        const decision = await this.turnManager.requestAction(seat, currentState, validActions);
        console.log(
          `  ${activePlayer.name}: ${decision.action}${decision.amount > 0 ? ` ${decision.amount.toLocaleString()}` : ""} - "${decision.reasoning}"`
        );

        // Apply action
        const actionRecord = this.game.applyAction(decision.action, decision.amount);
        actionRecord.reasoning = decision.reasoning;

        // Track stats for profile
        const tracker = this.handActionTrackers.get(seat);
        if (tracker) {
          const currentRound = this.game.getState().bettingRound;
          if (decision.action === "call" || decision.action === "raise" || decision.action === "all-in") {
            if (currentRound === "preflop") tracker.vpip = true;
          }
          if (decision.action === "raise" || decision.action === "all-in") {
            if (currentRound === "preflop") tracker.pfr = true;
            tracker.raises++;
          }
          if (decision.action === "call") {
            tracker.bets++;
          }
        }

        // On-chain transfer for calls/raises/all-ins (vault -> pot via coverLoss)
        if (this.useBlockchain && actionRecord.amount > 0 && agent) {
          try {
            const sig = await coverLoss(
              this.connection, this.adminKeypair, agent.poolIndex,
              displayToTokenAmount(actionRecord.amount), this.potATA,
            );
            if (sig) {
              this.server.broadcast("transaction", {
                type: "transaction",
                txType: "bet",
                from: activePlayer.name,
                amount: actionRecord.amount,
                sig,
              });
            }
          } catch (e: any) {
            console.error(`  coverLoss error (bet): ${e.message}`);
          }
        }

        // Broadcast action
        this.server.broadcast("player_action", {
          type: "player_action",
          seat,
          name: activePlayer.name,
          action: decision.action,
          amount: actionRecord.amount,
          reasoning: decision.reasoning,
          pot: this.game.getState().pot,
        });

        this.server.broadcast("game_state", this.buildGameStateMessage());

        await delay(ACTION_DELAY_MS);

        roundComplete = this.game.advanceToNextPlayer();
      }

      if (handOver) break;
    }

    // Showdown
    await this.handleShowdown();
  }

  private async handleShowdown(): Promise<void> {
    if (!this.game) return;

    console.log(`\n  --- SHOWDOWN ---`);
    const winners = this.game.resolveShowdown();
    const finalState = this.game.getState();

    this.server.broadcast("showdown", {
      type: "showdown",
      communityCards: finalState.communityCards.map(cardToCardData),
      players: finalState.players
        .filter(p => !p.folded && !p.sittingOut)
        .map(p => ({
          seat: p.index,
          name: p.name,
          holeCards: p.holeCards.map(cardToCardData),
        })),
      winners: winners.map(w => ({
        seat: w.playerIndex,
        name: finalState.players[w.playerIndex]?.name,
        amount: w.amount,
        handDescription: w.handDescription,
      })),
    });

    await delay(SHOWDOWN_DELAY_MS);

    // Pay winners (pot -> vault PDA via transferToVaultPDA)
    for (const w of winners) {
      const player = finalState.players[w.playerIndex];
      const winnerAgent = this.registry.getBySeat(w.playerIndex);
      const winnerPoolIdx = winnerAgent?.poolIndex ?? w.playerIndex;
      console.log(`  Winner: ${player?.name} wins ${w.amount.toLocaleString()} CHIPS (${w.handDescription})`);

      if (this.useBlockchain) {
        try {
          const vaultPDA = getVaultPDA(winnerPoolIdx);
          const payoutSig = await transferToVaultPDA(
            this.connection, this.mintAddress, this.potKeypair,
            vaultPDA, displayToTokenAmount(w.amount),
          );
          this.server.broadcast("transaction", {
            type: "transaction",
            txType: "payout",
            to: player?.name,
            sig: payoutSig,
            amount: w.amount,
          });

          // Update bankroll in pool account
          const vaultBal = await getVaultBalance(this.connection, winnerPoolIdx, this.mintAddress);
          await updatePoolBankroll(this.connection, this.adminKeypair, winnerPoolIdx, vaultBal);
        } catch (e: any) {
          console.error(`  Payout error: ${e.message}`);
        }
      }
    }

    // Burn rake
    const rake = this.game.getRakeAmount();
    if (rake > 0) {
      console.log(`  Rake burned: ${rake.toLocaleString()} CHIPS`);
      if (this.useBlockchain) {
        try {
          const rakeSig = await burnTokens(this.connection, this.mintAddress, this.potKeypair, displayToTokenAmount(rake));
          this.server.broadcast("transaction", {
            type: "transaction",
            txType: "rake_burn",
            amount: rake,
            sig: rakeSig,
          });
        } catch (e: any) {
          console.error(`  Rake burn error: ${e.message}`);
        }
      }
    }

    // Update chip counts
    if (this.useBlockchain) {
      // In blockchain mode: re-read vault balances for all participants
      for (const agent of this.registry.getSeatedAgents()) {
        const tracker = this.handActionTrackers.get(agent.seat);
        if (!tracker) continue;
        const vaultBal = await getVaultBalance(this.connection, agent.poolIndex, this.mintAddress);
        const displayBal = tokenAmountToDisplay(vaultBal);
        this.registry.updateChips(agent.seat, displayBal);
      }
    } else {
      // Non-blockchain mode: derive from game state
      for (const agent of this.registry.getSeatedAgents()) {
        const tracker = this.handActionTrackers.get(agent.seat);
        if (!tracker) continue;
        const player = finalState.players[agent.seat];
        if (!player) continue;
        const won = winners.find(w => w.playerIndex === agent.seat);
        const newChips = player.chips + (won ? won.amount : 0);
        this.registry.updateChips(agent.seat, newChips);
      }
    }

    // Update profile stats
    if (this.profileStore) {
      for (const agent of this.registry.getSeatedAgents()) {
        const tracker = this.handActionTrackers.get(agent.seat);
        if (!tracker) continue;
        const won = winners.find(w => w.playerIndex === agent.seat);
        const player = finalState.players[agent.seat];
        const endChips = player ? player.chips + (won ? won.amount : 0) : 0;
        const pnl = endChips - tracker.startChips;

        const result: HandResult = {
          participated: true,
          won: !!won,
          pnl,
          potWon: won ? won.amount : 0,
          vpip: tracker.vpip,
          pfr: tracker.pfr,
          betCount: tracker.bets,
          raiseCount: tracker.raises,
        };
        this.profileStore.updateStats(agent.agentId, result);
      }
      this.profileStore.saveIfDirty();
    }

    // Broadcast hand complete
    const playerInfos = this.registry.getSeatedAgents().map(a => ({
      seat: a.seat,
      poolIndex: a.poolIndex,
      agentId: a.agentId,
      name: a.name,
      style: a.style,
      avatar: a.avatar,
      chips: a.chips,
      sittingOut: a.sittingOut,
    }));

    this.server.broadcast("hand_complete", {
      type: "hand_complete",
      handNumber: finalState.handNumber,
      winners: winners.map(w => ({
        seat: w.playerIndex,
        name: finalState.players[w.playerIndex]?.name,
        amount: w.amount,
        handDescription: w.handDescription,
      })),
      players: playerInfos,
    });
  }

  private async postBlindsOnChain(
    blinds: { smallBlind: { playerIndex: number; amount: number }; bigBlind: { playerIndex: number; amount: number } },
  ): Promise<void> {
    try {
      // Small blind: vault -> pot via coverLoss (use agent's poolIndex)
      const sbAgent = this.registry.getBySeat(blinds.smallBlind.playerIndex);
      const sbPoolIdx = sbAgent?.poolIndex ?? blinds.smallBlind.playerIndex;
      const sbSig = await coverLoss(
        this.connection, this.adminKeypair, sbPoolIdx,
        displayToTokenAmount(blinds.smallBlind.amount), this.potATA,
      );
      if (sbSig) {
        this.server.broadcast("transaction", {
          type: "transaction",
          txType: "bet",
          from: sbAgent?.name || `Seat ${blinds.smallBlind.playerIndex}`,
          amount: blinds.smallBlind.amount,
          sig: sbSig,
        });
      }

      // Big blind: vault -> pot via coverLoss (use agent's poolIndex)
      const bbAgent = this.registry.getBySeat(blinds.bigBlind.playerIndex);
      const bbPoolIdx = bbAgent?.poolIndex ?? blinds.bigBlind.playerIndex;
      const bbSig = await coverLoss(
        this.connection, this.adminKeypair, bbPoolIdx,
        displayToTokenAmount(blinds.bigBlind.amount), this.potATA,
      );
      if (bbSig) {
        this.server.broadcast("transaction", {
          type: "transaction",
          txType: "bet",
          from: bbAgent?.name || `Seat ${blinds.bigBlind.playerIndex}`,
          amount: blinds.bigBlind.amount,
          sig: bbSig,
        });
      }
    } catch (e: any) {
      console.error(`  Blind posting error: ${e.message}`);
    }
  }

  private buildPlayerInfos(state: GameState) {
    return this.registry.getSeatedAgents().map(a => ({
      seat: a.seat,
      agentId: a.agentId,
      name: a.name,
      style: a.style,
      avatar: a.avatar,
      chips: state.players[a.seat]?.chips ?? a.chips,
      sittingOut: a.sittingOut,
    }));
  }

  private buildGameStateMessage(): any {
    if (!this.game) return {};
    const state = this.game.getState();
    return {
      type: "game_state",
      handNumber: state.handNumber,
      dealerSeat: state.dealerIndex,
      smallBlindSeat: state.smallBlindIndex,
      bigBlindSeat: state.bigBlindIndex,
      bettingRound: state.bettingRound,
      pot: state.pot,
      currentBet: state.currentBet,
      activeSeat: state.activePlayerIndex,
      communityCards: state.communityCards.map(cardToCardData),
      players: state.players.map(p => {
        const agent = this.registry.getBySeat(p.index);
        return {
          seat: p.index,
          poolIndex: agent?.poolIndex ?? p.index,
          agentId: agent?.agentId || "",
          name: p.name,
          style: agent?.style || "",
          avatar: agent?.avatar || "",
          chips: p.chips,
          sittingOut: p.sittingOut,
          bet: p.bet,
          totalBet: p.totalBet,
          folded: p.folded,
          allIn: p.allIn,
          hasCards: p.holeCards.length > 0,
        };
      }).filter(p => p.name),  // only include occupied seats
      actions: state.actions.slice(-5).map(a => ({
        seat: a.playerIndex,
        name: a.playerName,
        action: a.action,
        amount: a.amount,
        reasoning: a.reasoning,
      })),
    };
  }
}
