import { GameServer } from "../server/websocket";
import { PlayerRegistry, RegisteredAgent } from "../registry/player-registry";
import { PokerAgent } from "../agents/agent";
import { GameState, PlayerAction, cardToDisplay } from "../poker/types";
import { TURN_TIMEOUT_MS } from "../protocol/constants";
import { CardData, ValidActionInfo } from "../protocol/messages";

export interface TurnResult {
  action: PlayerAction;
  amount: number;
  reasoning: string;
  timedOut: boolean;
}

function cardToCardData(c: { rank: string; suit: string }): CardData {
  return { rank: c.rank, suit: c.suit, display: cardToDisplay(c as any) };
}

export class TurnManager {
  private server: GameServer;
  private registry: PlayerRegistry;
  private houseBots: Map<string, PokerAgent> = new Map();

  constructor(server: GameServer, registry: PlayerRegistry) {
    this.server = server;
    this.registry = registry;
  }

  registerHouseBot(agentId: string, bot: PokerAgent): void {
    this.houseBots.set(agentId, bot);
  }

  removeHouseBot(agentId: string): void {
    this.houseBots.delete(agentId);
  }

  async requestAction(
    seat: number,
    gameState: GameState,
    validActions: { action: PlayerAction; minAmount?: number; maxAmount?: number }[],
  ): Promise<TurnResult> {
    const agent = this.registry.getBySeat(seat);
    if (!agent) {
      return { action: "fold", amount: 0, reasoning: "No agent at seat", timedOut: true };
    }

    // House bot: use Claude API directly
    if (agent.isHouseBot) {
      const bot = this.houseBots.get(agent.agentId);
      if (bot) {
        try {
          const decision = await bot.makeDecision(gameState, validActions);
          return {
            action: decision.action,
            amount: decision.amount,
            reasoning: decision.reasoning,
            timedOut: false,
          };
        } catch (e: any) {
          console.error(`[TurnManager] House bot ${agent.name} error: ${e.message}`);
          const canCheck = validActions.find(a => a.action === "check");
          return {
            action: canCheck ? "check" : "fold",
            amount: 0,
            reasoning: "API error fallback",
            timedOut: false,
          };
        }
      }
    }

    // External agent: send your_turn via WS, await response
    const player = gameState.players[gameState.activePlayerIndex];

    this.server.sendToAgent(agent.agentId, "your_turn", {
      type: "your_turn",
      seat,
      communityCards: gameState.communityCards.map(cardToCardData),
      pot: gameState.pot,
      yourChips: player.chips,
      yourBet: player.bet,
      currentBet: gameState.currentBet,
      minRaise: gameState.minRaise,
      validActions: validActions.map(a => ({
        action: a.action,
        minAmount: a.minAmount,
        maxAmount: a.maxAmount,
      })),
      timeoutMs: TURN_TIMEOUT_MS,
      bettingRound: gameState.bettingRound,
      players: gameState.players
        .filter(p => !p.sittingOut)
        .map(p => ({
          seat: p.index,
          name: p.name,
          chips: p.chips,
          bet: p.bet,
          folded: p.folded,
          allIn: p.allIn,
          sittingOut: p.sittingOut,
        })),
    });

    const result = await this.server.waitForAction(agent.agentId, TURN_TIMEOUT_MS);

    // Validate and correct the action
    return this.validateAction(result, validActions);
  }

  private validateAction(
    raw: TurnResult,
    validActions: { action: PlayerAction; minAmount?: number; maxAmount?: number }[],
  ): TurnResult {
    const validActionNames = validActions.map(a => a.action);
    let action = raw.action;
    let amount = raw.amount;

    // Correct invalid actions
    if (!validActionNames.includes(action)) {
      if (action === "raise" && validActionNames.includes("all-in")) {
        action = "all-in";
      } else if (action === "check" && !validActionNames.includes("check")) {
        action = validActionNames.includes("call") ? "call" : "fold";
      } else if (action === "call" && !validActionNames.includes("call")) {
        action = validActionNames.includes("check") ? "check" : "fold";
      } else {
        action = validActionNames.includes("check") ? "check" : "fold";
      }
    }

    // Validate raise amount
    if (action === "raise") {
      const raiseSpec = validActions.find(a => a.action === "raise");
      if (raiseSpec) {
        if (amount < (raiseSpec.minAmount || 0)) amount = raiseSpec.minAmount || 0;
        if (amount > (raiseSpec.maxAmount || Infinity)) amount = raiseSpec.maxAmount || 0;
      }
    }

    return { action, amount, reasoning: raw.reasoning, timedOut: raw.timedOut };
  }
}
