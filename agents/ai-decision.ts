import Anthropic from "@anthropic-ai/sdk";
import type { DecisionContext, PokerDecision, ValidAction, PlayerAction } from "../packages/poker-agent/src/types";

const HISTORY_WINDOW = 5;

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

function buildGameContext(ctx: DecisionContext): string {
  const potOdds = ctx.potOdds !== null ? `${(ctx.potOdds * 100).toFixed(1)}%` : "N/A";

  let text = `=== GAME STATE ===
Round: ${ctx.bettingRound.toUpperCase()}
Your position: ${ctx.position}

Your hole cards: ${ctx.holeCards.map(c => c.display).join(" ")}
Community cards: ${ctx.communityCards.length > 0 ? ctx.communityCards.map(c => c.display).join(" ") : "(none)"}

Pot: ${ctx.pot.toLocaleString()} CHIPS
Your chips: ${ctx.yourChips.toLocaleString()} CHIPS
Your current bet: ${ctx.yourBet.toLocaleString()} CHIPS
Current bet to match: ${ctx.currentBet.toLocaleString()} CHIPS
To call: ${ctx.toCall.toLocaleString()} CHIPS
Pot odds: ${potOdds}
Min raise to: ${ctx.minRaise.toLocaleString()} CHIPS

=== PLAYERS ===`;

  for (const p of ctx.players) {
    if (p.sittingOut) continue;
    const status = p.folded ? "FOLDED" : p.allIn ? "ALL-IN" : "active";
    text += `\n  ${p.name} - ${p.chips.toLocaleString()} chips - bet: ${p.bet.toLocaleString()} - ${status}`;
  }

  return text;
}

function validateDecision(
  decision: { action: PlayerAction; amount: number; reasoning: string },
  validActions: ValidAction[],
): { action: PlayerAction; amount: number; reasoning: string } {
  const validNames = validActions.map(a => a.action);

  if (!validNames.includes(decision.action)) {
    if (decision.action === "raise" && validNames.includes("all-in")) {
      decision.action = "all-in";
    } else if (decision.action === "check" && !validNames.includes("check")) {
      decision.action = "fold";
    } else if (decision.action === "call" && !validNames.includes("call")) {
      decision.action = validNames.includes("check") ? "check" : "fold";
    } else {
      decision.action = validNames.includes("check") ? "check" : "fold";
    }
  }

  if (decision.action === "raise") {
    const raiseSpec = validActions.find(a => a.action === "raise");
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

export function createAIDecisionMaker(systemPrompt: string): (ctx: DecisionContext) => Promise<PokerDecision> {
  const client = new Anthropic();
  let messageHistory: Anthropic.MessageParam[] = [];

  return async (ctx: DecisionContext): Promise<PokerDecision> => {
    const gameContext = buildGameContext(ctx);

    const validActionsDesc = ctx.validActions
      .map(a => {
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

    messageHistory.push({ role: "user", content: userMessage });
    if (messageHistory.length > HISTORY_WINDOW * 2) {
      messageHistory = messageHistory.slice(-HISTORY_WINDOW * 2);
    }

    try {
      const response = await client.messages.create({
        model: "claude-opus-4-6",
        max_tokens: 1024,
        system: systemPrompt,
        tools: [pokerDecisionTool],
        tool_choice: { type: "tool", name: "make_poker_decision" },
        messages: messageHistory,
      });

      const toolUse = response.content.find(
        (block) => block.type === "tool_use"
      ) as Anthropic.ToolUseBlock | undefined;

      if (toolUse) {
        const input = toolUse.input as {
          action: PlayerAction;
          amount: number;
          reasoning: string;
        };

        messageHistory.push({ role: "assistant", content: response.content });
        messageHistory.push({
          role: "user",
          content: [{
            type: "tool_result",
            tool_use_id: toolUse.id,
            content: `Action executed: ${input.action}${input.amount ? ` ${input.amount}` : ""}`,
          }],
        });

        return validateDecision(input, ctx.validActions);
      }
    } catch (error: any) {
      console.error(`  [AI] Claude API error: ${error.message}`);
      messageHistory.pop();
    }

    // Fallback
    const canCheck = ctx.validActions.find(a => a.action === "check");
    return {
      action: canCheck ? "check" : "fold",
      amount: 0,
      reasoning: "Fallback decision due to API error.",
    };
  };
}
