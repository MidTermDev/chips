import { Deck } from "./deck";
import { findWinners } from "./hand-evaluator";
import {
  Player,
  Card,
  GameState,
  BettingRound,
  ActionRecord,
  PlayerAction,
  SidePot,
} from "./types";

const SMALL_BLIND = 5000;
const BIG_BLIND = 10000;
const RAKE_PERCENT = 0.005; // 0.5%

export class PokerGame {
  private deck: Deck;
  private state: GameState;
  private numPlayers: number;
  private playerNames: string[];
  private playerChips: number[];
  private lastActedIndex: number = -1;
  private numActionsInRound: number = 0;

  constructor(playerNames: string[], initialChips: number[]) {
    this.deck = new Deck();
    this.numPlayers = playerNames.length;
    this.playerNames = playerNames;
    this.playerChips = [...initialChips];
    this.state = this.createEmptyState();
  }

  /** Add a player to a specific seat. Arrays stay length 8. */
  addPlayer(seat: number, name: string, chips: number): void {
    // Ensure arrays are large enough
    while (this.playerNames.length <= seat) {
      this.playerNames.push("");
      this.playerChips.push(0);
    }
    this.playerNames[seat] = name;
    this.playerChips[seat] = chips;
    this.numPlayers = Math.max(this.numPlayers, seat + 1);
  }

  /** Remove a player from a seat. Sets chips to 0 (sittingOut logic handles the rest). */
  removePlayer(seat: number): void {
    if (seat < this.playerNames.length) {
      this.playerChips[seat] = 0;
    }
  }

  getNumPlayers(): number {
    return this.numPlayers;
  }

  private createEmptyState(): GameState {
    return {
      handNumber: 0,
      dealerIndex: -1,
      smallBlindIndex: 0,
      bigBlindIndex: 0,
      players: [],
      communityCards: [],
      pot: 0,
      sidePots: [],
      currentBet: 0,
      minRaise: BIG_BLIND,
      bettingRound: "preflop",
      activePlayerIndex: 0,
      actions: [],
      isHandComplete: false,
      winners: [],
    };
  }

  updatePlayerChips(chips: number[]): void {
    this.playerChips = [...chips];
  }

  getState(): GameState {
    return { ...this.state };
  }

  /** Start a new hand. Returns the blind amounts needed. */
  startNewHand(): { smallBlind: { playerIndex: number; amount: number }; bigBlind: { playerIndex: number; amount: number } } {
    this.deck.reset();
    this.state.handNumber++;
    this.state.communityCards = [];
    this.state.pot = 0;
    this.state.sidePots = [];
    this.state.currentBet = 0;
    this.state.minRaise = BIG_BLIND;
    this.state.bettingRound = "preflop";
    this.state.actions = [];
    this.state.isHandComplete = false;
    this.state.winners = [];
    this.numActionsInRound = 0;

    // Set up players
    this.state.players = this.playerNames.map((name, i) => ({
      index: i,
      name,
      chips: this.playerChips[i],
      holeCards: [],
      bet: 0,
      totalBet: 0,
      folded: false,
      allIn: false,
      sittingOut: this.playerChips[i] <= 0,
    }));

    // Advance dealer
    this.state.dealerIndex = this.nextActivePlayer(this.state.dealerIndex);
    this.state.smallBlindIndex = this.nextActivePlayer(this.state.dealerIndex);
    this.state.bigBlindIndex = this.nextActivePlayer(this.state.smallBlindIndex);

    // Post blinds
    const sbAmount = Math.min(SMALL_BLIND, this.state.players[this.state.smallBlindIndex].chips);
    const bbAmount = Math.min(BIG_BLIND, this.state.players[this.state.bigBlindIndex].chips);

    this.postBlind(this.state.smallBlindIndex, sbAmount);
    this.postBlind(this.state.bigBlindIndex, bbAmount);

    this.state.currentBet = BIG_BLIND;
    this.state.minRaise = BIG_BLIND;

    // Deal hole cards
    for (const p of this.state.players) {
      if (!p.sittingOut) {
        p.holeCards = this.deck.deal(2);
      }
    }

    // Set first active player (UTG = after big blind)
    this.state.activePlayerIndex = this.nextActivePlayer(this.state.bigBlindIndex);
    this.lastActedIndex = -1;
    this.numActionsInRound = 0;

    return {
      smallBlind: { playerIndex: this.state.smallBlindIndex, amount: sbAmount },
      bigBlind: { playerIndex: this.state.bigBlindIndex, amount: bbAmount },
    };
  }

  private postBlind(playerIndex: number, amount: number): void {
    const player = this.state.players[playerIndex];
    player.bet = amount;
    player.totalBet = amount;
    player.chips -= amount;
    this.state.pot += amount;

    if (player.chips <= 0) {
      player.allIn = true;
      player.chips = 0;
    }
  }

  private nextActivePlayer(fromIndex: number): number {
    let idx = (fromIndex + 1) % this.numPlayers;
    let checked = 0;
    while (checked < this.numPlayers) {
      const p = this.state.players[idx];
      if (p && !p.folded && !p.sittingOut && !p.allIn) {
        return idx;
      }
      idx = (idx + 1) % this.numPlayers;
      checked++;
    }
    // No active players found - return fromIndex as fallback
    return (fromIndex + 1) % this.numPlayers;
  }

  private nextNonFoldedPlayer(fromIndex: number): number {
    let idx = (fromIndex + 1) % this.numPlayers;
    let checked = 0;
    while (checked < this.numPlayers) {
      const p = this.state.players[idx];
      if (p && !p.folded && !p.sittingOut) {
        return idx;
      }
      idx = (idx + 1) % this.numPlayers;
      checked++;
    }
    return fromIndex;
  }

  getActivePlayers(): Player[] {
    return this.state.players.filter((p) => !p.folded && !p.sittingOut);
  }

  getActionablePlayers(): Player[] {
    return this.state.players.filter((p) => !p.folded && !p.sittingOut && !p.allIn);
  }

  /** Returns valid actions for the current active player */
  getValidActions(): { action: PlayerAction; minAmount?: number; maxAmount?: number }[] {
    const player = this.state.players[this.state.activePlayerIndex];
    if (!player || player.folded || player.allIn || player.sittingOut) return [];

    const actions: { action: PlayerAction; minAmount?: number; maxAmount?: number }[] = [];
    const toCall = this.state.currentBet - player.bet;

    actions.push({ action: "fold" });

    if (toCall <= 0) {
      actions.push({ action: "check" });
    } else {
      const callAmount = Math.min(toCall, player.chips);
      actions.push({ action: "call", minAmount: callAmount, maxAmount: callAmount });
    }

    // Raise: minimum raise is currentBet + minRaise
    const minRaiseTotal = this.state.currentBet + this.state.minRaise;
    const raiseNeeded = minRaiseTotal - player.bet;
    if (player.chips > toCall && raiseNeeded <= player.chips) {
      actions.push({
        action: "raise",
        minAmount: minRaiseTotal,
        maxAmount: player.chips + player.bet,
      });
    }

    // All-in is always available
    if (player.chips > 0) {
      actions.push({
        action: "all-in",
        minAmount: player.chips + player.bet,
        maxAmount: player.chips + player.bet,
      });
    }

    return actions;
  }

  /**
   * Apply a player's action. Returns the action record.
   * amount is the TOTAL bet for raises, or the CALL amount for calls.
   */
  applyAction(action: PlayerAction, amount: number = 0): ActionRecord {
    const player = this.state.players[this.state.activePlayerIndex];
    const record: ActionRecord = {
      playerIndex: player.index,
      playerName: player.name,
      action,
      amount: 0,
      timestamp: Date.now(),
    };

    switch (action) {
      case "fold":
        player.folded = true;
        break;

      case "check":
        // No chip movement
        break;

      case "call": {
        const toCall = Math.min(this.state.currentBet - player.bet, player.chips);
        player.chips -= toCall;
        player.bet += toCall;
        player.totalBet += toCall;
        this.state.pot += toCall;
        record.amount = toCall;
        if (player.chips <= 0) {
          player.allIn = true;
          player.chips = 0;
        }
        break;
      }

      case "raise": {
        // amount is the total bet amount
        const raiseTotal = Math.min(amount, player.chips + player.bet);
        const chipsCost = raiseTotal - player.bet;
        const actualCost = Math.min(chipsCost, player.chips);

        // Update min raise
        const raiseBy = raiseTotal - this.state.currentBet;
        if (raiseBy > this.state.minRaise) {
          this.state.minRaise = raiseBy;
        }

        player.chips -= actualCost;
        player.bet = player.bet + actualCost;
        player.totalBet += actualCost;
        this.state.pot += actualCost;
        this.state.currentBet = player.bet;
        record.amount = actualCost;

        if (player.chips <= 0) {
          player.allIn = true;
          player.chips = 0;
        }

        // Reset action counter since everyone needs to act again
        this.numActionsInRound = 0;
        break;
      }

      case "all-in": {
        const allInAmount = player.chips;
        const newBet = player.bet + allInAmount;

        if (newBet > this.state.currentBet) {
          const raiseBy = newBet - this.state.currentBet;
          if (raiseBy >= this.state.minRaise) {
            this.state.minRaise = raiseBy;
          }
          this.state.currentBet = newBet;
          // Reset action counter
          this.numActionsInRound = 0;
        }

        player.totalBet += allInAmount;
        this.state.pot += allInAmount;
        player.bet = newBet;
        player.chips = 0;
        player.allIn = true;
        record.amount = allInAmount;
        break;
      }
    }

    this.state.actions.push(record);
    this.lastActedIndex = this.state.activePlayerIndex;
    this.numActionsInRound++;

    return record;
  }

  /** Advance to the next player. Returns true if the betting round is complete. */
  advanceToNextPlayer(): boolean {
    const activePlayers = this.getActivePlayers();
    const actionablePlayers = this.getActionablePlayers();

    // Only one non-folded player left - hand is over
    if (activePlayers.length <= 1) {
      return true;
    }

    // No actionable players (all remaining are all-in)
    if (actionablePlayers.length === 0) {
      return true;
    }

    // One or fewer players can act - round is complete if all bets match
    if (actionablePlayers.length <= 1) {
      const allMatched = actionablePlayers.every(
        (p) => p.bet === this.state.currentBet || p.allIn
      );
      if (allMatched && this.numActionsInRound >= actionablePlayers.length) {
        return true;
      }
    }

    // Find next player who can act
    let nextIdx = this.nextActivePlayer(this.state.activePlayerIndex);
    let checked = 0;

    while (checked < this.numPlayers) {
      const p = this.state.players[nextIdx];

      // This player can act - is their bet matched?
      if (!p.folded && !p.sittingOut && !p.allIn) {
        // If everyone has acted at least once and bets are matched, round is done
        if (this.numActionsInRound >= actionablePlayers.length) {
          const allBetsMatched = actionablePlayers.every(
            (ap) => ap.bet === this.state.currentBet
          );
          if (allBetsMatched) {
            return true;
          }
        }

        this.state.activePlayerIndex = nextIdx;
        return false;
      }

      nextIdx = (nextIdx + 1) % this.numPlayers;
      checked++;
    }

    return true;
  }

  /** Start a new betting round. Returns false if the hand should go to showdown. */
  startBettingRound(round: BettingRound): boolean {
    this.state.bettingRound = round;
    this.state.currentBet = 0;
    this.state.minRaise = BIG_BLIND;
    this.numActionsInRound = 0;

    // Reset per-round bets
    for (const p of this.state.players) {
      p.bet = 0;
    }

    // Deal community cards
    switch (round) {
      case "flop":
        this.state.communityCards.push(...this.deck.deal(3));
        break;
      case "turn":
        this.state.communityCards.push(this.deck.dealOne());
        break;
      case "river":
        this.state.communityCards.push(this.deck.dealOne());
        break;
    }

    const actionable = this.getActionablePlayers();
    if (actionable.length <= 1) {
      // Cannot have a betting round with 0-1 actionable players
      return false;
    }

    // Post-flop: action starts from SB (or next active after dealer)
    this.state.activePlayerIndex = this.nextActivePlayer(this.state.dealerIndex);
    return true;
  }

  /** Calculate side pots */
  calculateSidePots(): SidePot[] {
    const activePlayers = this.getActivePlayers();
    if (activePlayers.length <= 1) {
      return [{ amount: this.state.pot, eligiblePlayers: activePlayers.map((p) => p.index) }];
    }

    // Get unique bet levels from all-in players
    const betLevels = [...new Set(activePlayers.map((p) => p.totalBet))].sort(
      (a, b) => a - b
    );

    const sidePots: SidePot[] = [];
    let prevLevel = 0;

    for (const level of betLevels) {
      const diff = level - prevLevel;
      if (diff <= 0) continue;

      const eligible = activePlayers.filter((p) => p.totalBet >= level);
      const contributors = this.state.players.filter(
        (p) => !p.sittingOut && p.totalBet > prevLevel
      );
      const potAmount = contributors.reduce((sum, p) => {
        const contribution = Math.min(p.totalBet, level) - Math.min(p.totalBet, prevLevel);
        return sum + Math.max(0, contribution);
      }, 0);

      if (potAmount > 0) {
        sidePots.push({
          amount: potAmount,
          eligiblePlayers: eligible.map((p) => p.index),
        });
      }

      prevLevel = level;
    }

    this.state.sidePots = sidePots;
    return sidePots;
  }

  /** Resolve showdown and return winners with amounts. */
  resolveShowdown(): { playerIndex: number; amount: number; handDescription: string }[] {
    const activePlayers = this.getActivePlayers();

    // Everyone folded except one
    if (activePlayers.length === 1) {
      const winner = activePlayers[0];
      const winAmount = this.state.pot;
      this.state.winners = [{ playerIndex: winner.index, amount: winAmount, handDescription: "Last player standing" }];
      return this.state.winners;
    }

    const pots = this.calculateSidePots();
    const allWinners: { playerIndex: number; amount: number; handDescription: string }[] = [];

    for (const pot of pots) {
      const eligibleHands = pot.eligiblePlayers
        .map((idx) => this.state.players[idx])
        .filter((p) => !p.folded)
        .map((p) => ({
          playerIndex: p.index,
          holeCards: p.holeCards,
        }));

      if (eligibleHands.length === 0) continue;

      if (this.state.communityCards.length < 5) {
        // Deal remaining community cards for showdown
        while (this.state.communityCards.length < 5) {
          this.state.communityCards.push(this.deck.dealOne());
        }
      }

      const winners = findWinners(eligibleHands, this.state.communityCards);
      const shareAmount = Math.floor(pot.amount / winners.length);

      for (const w of winners) {
        const existing = allWinners.find((aw) => aw.playerIndex === w.playerIndex);
        if (existing) {
          existing.amount += shareAmount;
        } else {
          allWinners.push({
            playerIndex: w.playerIndex,
            amount: shareAmount,
            handDescription: w.description,
          });
        }
      }
    }

    // Apply rake
    for (const w of allWinners) {
      const rake = Math.floor(w.amount * RAKE_PERCENT);
      w.amount -= rake;
    }

    this.state.winners = allWinners;
    this.state.isHandComplete = true;
    return allWinners;
  }

  getRakeAmount(): number {
    const totalWinnings = this.state.winners.reduce((s, w) => s + w.amount, 0);
    return this.state.pot - totalWinnings;
  }

  getSmallBlind(): number {
    return SMALL_BLIND;
  }

  getBigBlind(): number {
    return BIG_BLIND;
  }
}
