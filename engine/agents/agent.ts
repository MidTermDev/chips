import Anthropic from "@anthropic-ai/sdk";
import { AgentPersonality } from "./personalities";
import { GameState, Player, cardToDisplay, PlayerAction } from "../poker/types";

const HISTORY_WINDOW = 5;

interface PokerDecision {
  action: PlayerAction;
  amount: number;
  reasoning: string;
}

const pokerDecisionTool: Anthropic.Tool = {
  name: "make_poker_decision",
  description: "Make a poker decision: fold, check, call, raise, or go all-in",
  input_schema: {
    type: "object" as const,
    properties: {
      action: {
        type: "string",
        enum: ["fold", "check", "call", "raise", "all-in"],
        description: "The poker action to take",
      },
      amount: {
        type: "number",
        description:
          "The total bet amount for raises (not the additional chips, but total bet size). Ignored for fold/check/call/all-in.",
      },
      reasoning: {
        type: "string",
        description:
          "Brief reasoning for this decision (2-3 sentences max). Be specific about hand strength, pot odds, and opponent reads.",
      },
    },
    required: ["action", "amount", "reasoning"],
  },
};

export class PokerAgent {
  private client: Anthropic;
  private personality: AgentPersonality;
  private messageHistory: Anthropic.MessageParam[] = [];

  constructor(personality: AgentPersonality) {
    this.client = new Anthropic();
    this.personality = personality;
  }

  get name(): string {
    return this.personality.name;
  }

  get avatar(): string {
    return this.personality.avatar;
  }

  get style(): string {
    return this.personality.style;
  }

  private buildGameContext(state: GameState, player: Player): string {
    const activePlayers = state.players.filter((p) => !p.folded && !p.sittingOut);
    const toCall = state.currentBet - player.bet;
    const potOdds = toCall > 0 ? (toCall / (state.pot + toCall) * 100).toFixed(1) : "N/A";

    let context = `=== GAME STATE ===
Hand #${state.handNumber} | Round: ${state.bettingRound.toUpperCase()}
Your position: ${this.getPositionLabel(player.index, state)}

Your hole cards: ${player.holeCards.map(cardToDisplay).join(" ")}
Community cards: ${state.communityCards.length > 0 ? state.communityCards.map(cardToDisplay).join(" ") : "(none)"}

Pot: ${state.pot.toLocaleString()} CHIPS
Your chips: ${player.chips.toLocaleString()} CHIPS
Your current bet: ${player.bet.toLocaleString()} CHIPS
Current bet to match: ${state.currentBet.toLocaleString()} CHIPS
To call: ${toCall.toLocaleString()} CHIPS
Pot odds: ${potOdds}%
Min raise to: ${(state.currentBet + state.minRaise).toLocaleString()} CHIPS

=== PLAYERS ===`;

    for (const p of state.players) {
      if (p.sittingOut) continue;
      const status = p.folded
        ? "FOLDED"
        : p.allIn
        ? "ALL-IN"
        : p.index === state.activePlayerIndex
        ? "** YOUR TURN **"
        : "active";
      const position = this.getPositionLabel(p.index, state);
      context += `\n  ${p.name} [${position}] - ${p.chips.toLocaleString()} chips - bet: ${p.bet.toLocaleString()} - ${status}`;
    }

    // Recent actions this hand
    if (state.actions.length > 0) {
      context += `\n\n=== RECENT ACTIONS ===`;
      const recentActions = state.actions.slice(-10);
      for (const a of recentActions) {
        const amountStr = a.amount > 0 ? ` ${a.amount.toLocaleString()}` : "";
        context += `\n  ${a.playerName}: ${a.action}${amountStr}`;
      }
    }

    return context;
  }

  private getPositionLabel(playerIndex: number, state: GameState): string {
    if (playerIndex === state.dealerIndex) return "BTN";
    if (playerIndex === state.smallBlindIndex) return "SB";
    if (playerIndex === state.bigBlindIndex) return "BB";

    const numActive = state.players.filter((p) => !p.sittingOut).length;
    const offset = (playerIndex - state.dealerIndex + numActive) % numActive;

    if (offset === numActive - 1) return "CO";
    if (offset === numActive - 2) return "HJ";
    return `EP${offset > 3 ? "" : offset}`;
  }

  async makeDecision(
    state: GameState,
    validActions: { action: PlayerAction; minAmount?: number; maxAmount?: number }[]
  ): Promise<PokerDecision> {
    const player = state.players[state.activePlayerIndex];
    const gameContext = this.buildGameContext(state, player);

    const validActionsDesc = validActions
      .map((a) => {
        if (a.action === "raise") {
          return `raise (min: ${a.minAmount?.toLocaleString()}, max: ${a.maxAmount?.toLocaleString()})`;
        }
        if (a.action === "call") {
          return `call (${a.minAmount?.toLocaleString()} chips)`;
        }
        return a.action;
      })
      .join(", ");

    const userMessage = `${gameContext}\n\nValid actions: ${validActionsDesc}\n\nMake your poker decision now.`;

    // Sliding window for message history
    this.messageHistory.push({ role: "user", content: userMessage });
    if (this.messageHistory.length > HISTORY_WINDOW * 2) {
      this.messageHistory = this.messageHistory.slice(-HISTORY_WINDOW * 2);
    }

    try {
      const response = await this.client.messages.create({
        model: "claude-opus-4-6",
        max_tokens: 1024,
        system: this.personality.systemPrompt,
        tools: [pokerDecisionTool],
        tool_choice: { type: "tool", name: "make_poker_decision" },
        messages: this.messageHistory,
      });

      // Extract tool use
      const toolUse = response.content.find(
        (block) => block.type === "tool_use"
      ) as Anthropic.ToolUseBlock | undefined;

      if (toolUse) {
        const input = toolUse.input as {
          action: PlayerAction;
          amount: number;
          reasoning: string;
        };

        // Add assistant response to history
        this.messageHistory.push({ role: "assistant", content: response.content });

        // Add tool_result so the next user message is valid
        this.messageHistory.push({
          role: "user",
          content: [{
            type: "tool_result",
            tool_use_id: toolUse.id,
            content: `Action executed: ${input.action}${input.amount ? ` ${input.amount}` : ""}`,
          }],
        });

        // Validate and correct the decision
        return this.validateDecision(input, validActions, state);
      }
    } catch (error: any) {
      console.error(`  [${this.name}] Claude API error: ${error.message}`);
      // Remove the user message we just pushed so history stays clean
      this.messageHistory.pop();
    }

    // Fallback: check if possible, else fold
    const canCheck = validActions.find((a) => a.action === "check");
    return {
      action: canCheck ? "check" : "fold",
      amount: 0,
      reasoning: "Fallback decision due to API error.",
    };
  }

  private validateDecision(
    decision: PokerDecision,
    validActions: { action: PlayerAction; minAmount?: number; maxAmount?: number }[],
    state: GameState
  ): PokerDecision {
    const validActionNames = validActions.map((a) => a.action);

    // Check if the action is valid
    if (!validActionNames.includes(decision.action)) {
      // Try to find the closest valid action
      if (decision.action === "raise" && validActionNames.includes("all-in")) {
        decision.action = "all-in";
      } else if (decision.action === "check" && !validActionNames.includes("check")) {
        decision.action = "fold";
      } else if (decision.action === "call" && !validActionNames.includes("call")) {
        if (validActionNames.includes("check")) {
          decision.action = "check";
        } else {
          decision.action = "fold";
        }
      } else {
        const canCheck = validActionNames.includes("check");
        decision.action = canCheck ? "check" : "fold";
      }
    }

    // Validate raise amount
    if (decision.action === "raise") {
      const raiseSpec = validActions.find((a) => a.action === "raise");
      if (raiseSpec) {
        if (decision.amount < (raiseSpec.minAmount || 0)) {
          decision.amount = raiseSpec.minAmount || 0;
        }
        if (decision.amount > (raiseSpec.maxAmount || Infinity)) {
          decision.amount = raiseSpec.maxAmount || 0;
        }
      }
    }

    return decision;
  }

  resetHistory(): void {
    this.messageHistory = [];
  }
}
