#!/usr/bin/env node

import * as readline from "readline";
import * as fs from "fs";
import * as path from "path";
import { exec } from "child_process";

const DEFAULT_SERVER = "wss://server.chips.rip";
const REGISTER_URL = "https://chips.rip/register";

// ─── Flag parsing ────────────────────────────────────────────

function parseArg(flag: string): string | undefined {
  const idx = process.argv.indexOf(flag);
  if (idx >= 0 && idx + 1 < process.argv.length) return process.argv[idx + 1];
  return undefined;
}

const flagKey = parseArg("--key");
const flagServer = parseArg("--server");

// ─── Interactive wizard ─────────────────────────────────────────

function createPrompt(): { ask: (question: string, defaultVal?: string) => Promise<string>; close: () => void } {
  const lines: string[] = [];
  let waiting: ((line: string) => void) | null = null;
  let closed = false;

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: process.stdin.isTTY ?? false });
  rl.on("line", (line) => {
    if (waiting) {
      const cb = waiting;
      waiting = null;
      cb(line);
    } else {
      lines.push(line);
    }
  });
  rl.on("close", () => { closed = true; if (waiting) { const cb = waiting; waiting = null; cb(""); } });

  function ask(question: string, defaultVal?: string): Promise<string> {
    const suffix = defaultVal ? ` (default: ${defaultVal})` : "";
    const prompt = `  ${question}${suffix}: `;
    return new Promise((resolve) => {
      process.stdout.write(prompt);
      if (lines.length > 0) {
        resolve(lines.shift()!.trim() || defaultVal || "");
      } else if (closed) {
        resolve(defaultVal || "");
      } else {
        waiting = (line) => resolve(line.trim() || defaultVal || "");
      }
    });
  }

  return { ask, close: () => rl.close() };
}

function sanitizeDirName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9\-_ ]/g, "")
    .replace(/[\s_]+/g, "-")
    .replace(/^-+|-+$/g, "")
    || "my-agent";
}

function openBrowser(url: string): void {
  const cmd = process.platform === "darwin" ? "open"
    : process.platform === "win32" ? "start" : "xdg-open";
  exec(`${cmd} ${url}`, () => {});
}

async function validateApiKey(serverUrl: string, apiKey: string): Promise<{ agentId: string; name: string; style: string; avatar: string } | null> {
  const httpUrl = serverUrl
    .replace(/^wss:\/\//, "https://")
    .replace(/^ws:\/\//, "http://");

  try {
    const res = await fetch(`${httpUrl}/api/validate-key`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ apiKey }),
    });
    if (!res.ok) return null;
    return await res.json() as { agentId: string; name: string; style: string; avatar: string };
  } catch {
    return null;
  }
}

function generateAgentTs(): string {
  return `import "dotenv/config";
import { PokerAgentClient, DecisionContext, PokerDecision } from "@chips-arena/poker-agent";

const API_KEY = process.env.CHIPS_API_KEY;
const SERVER = process.env.CHIPS_SERVER_URL || "${DEFAULT_SERVER}";

if (!API_KEY) {
  console.error("Set CHIPS_API_KEY in .env");
  process.exit(1);
}

// ─── Your Decision Strategy ────────────────────────────────────
// This is where your agent logic lives. Customize this function
// to implement your own poker strategy.

async function onDecision(ctx: DecisionContext): Promise<PokerDecision> {
  const { validActions, toCall, yourChips, holeCards, communityCards, potOdds, bettingRound } = ctx;

  const canCheck = validActions.find(a => a.action === "check");
  const canCall = validActions.find(a => a.action === "call");
  const canRaise = validActions.find(a => a.action === "raise");

  // Simple hand strength: paired hole cards or high cards
  const ranks = holeCards.map(c => rankValue(c.rank));
  const isPaired = ranks.length === 2 && ranks[0] === ranks[1];
  const isHighCards = ranks.every(r => r >= 10);
  const hasPair = isPaired || checkBoardPair(holeCards, communityCards);

  // Free to play? Always check
  if (canCheck) {
    if (canRaise && (isPaired || isHighCards) && Math.random() < 0.3) {
      return {
        action: "raise",
        amount: canRaise.minAmount,
        reasoning: "Min-raise with decent hand",
      };
    }
    return { action: "check", reasoning: "Free to check" };
  }

  // Cheap to call? (< 10% of chips)
  if (canCall && toCall < yourChips * 0.1) {
    return { action: "call", reasoning: "Cheap call" };
  }

  // Medium cost (10-30%): call with pairs, fold otherwise
  if (canCall && toCall < yourChips * 0.3) {
    if (hasPair || isHighCards) {
      return { action: "call", reasoning: "Calling with pair/high cards" };
    }
    return { action: "fold", reasoning: "Too expensive without a hand" };
  }

  // Expensive: only call with strong hands
  if (canCall && (isPaired || (hasPair && bettingRound !== "preflop"))) {
    return { action: "call", reasoning: "Calling expensive with strong hand" };
  }

  return { action: "fold", reasoning: "Folding weak hand" };
}

function rankValue(rank: string): number {
  const map: Record<string, number> = {
    "2": 2, "3": 3, "4": 4, "5": 5, "6": 6, "7": 7, "8": 8,
    "9": 9, "T": 10, "J": 11, "Q": 12, "K": 13, "A": 14, "10": 10,
  };
  return map[rank] || 0;
}

function checkBoardPair(holeCards: { rank: string }[], communityCards: { rank: string }[]): boolean {
  for (const h of holeCards) {
    for (const c of communityCards) {
      if (h.rank === c.rank) return true;
    }
  }
  return false;
}

// ─── Agent Setup ───────────────────────────────────────────────

console.log(\`\\n\\u2660 CHIPS Poker Agent\`);
console.log(\`  Server: \${SERVER}\\n\`);

const client = new PokerAgentClient({
  serverUrl: SERVER,
  apiKey: API_KEY,
  onDecision,
  onGameEvent: (event) => {
    switch (event.type) {
      case "new_hand":
        console.log(\`\\n--- Hand #\${event.data.handNumber} ---\`);
        if (event.data.holeCards?.length) {
          console.log(\`  Your cards: \${event.data.holeCards.map((c: any) => c.display).join(" ")}\`);
        }
        break;
      case "player_action":
        console.log(\`  \${event.data.name}: \${event.data.action}\${event.data.amount > 0 ? \` \${event.data.amount}\` : ""}\`);
        break;
      case "hand_complete":
        for (const w of event.data.winners || []) {
          console.log(\`  Winner: \${w.name} - \${w.amount.toLocaleString()} (\${w.handDescription})\`);
        }
        break;
      case "community_cards":
        console.log(\`  \${event.data.round}: \${event.data.cards.map((c: any) => c.display).join(" ")}\`);
        break;
    }
  },
  onConnect: (ack) => {
    console.log(\`Seated at position \${ack.seat}. \${ack.waitingForNextHand ? "Waiting for next hand..." : "Ready!"}\`);
  },
  onDisconnect: () => {
    console.log("Disconnected from server");
  },
  onError: (err) => {
    console.error(\`Error: \${err.message}\`);
  },
  reconnect: true,
});

client.connect();

process.on("SIGINT", () => {
  console.log("\\nDisconnecting...");
  client.disconnect();
  process.exit(0);
});
process.on("SIGTERM", () => {
  client.disconnect();
  process.exit(0);
});
`;
}

function generatePackageJson(dirName: string, name: string): string {
  return JSON.stringify({
    name: dirName,
    version: "1.0.0",
    private: true,
    description: `${name} - CHIPS Poker Agent`,
    scripts: {
      start: "npx tsx agent.ts",
    },
    dependencies: {
      "@chips-arena/poker-agent": "latest",
      dotenv: "^16.4.0",
    },
    devDependencies: {
      tsx: "^4.19.0",
      typescript: "^5.7.0",
    },
  }, null, 2) + "\n";
}

function generateTsConfig(): string {
  return JSON.stringify({
    compilerOptions: {
      target: "ES2022",
      module: "ES2022",
      moduleResolution: "bundler",
      esModuleInterop: true,
      strict: true,
      skipLibCheck: true,
      outDir: "dist",
    },
    include: ["*.ts"],
  }, null, 2) + "\n";
}

function generateEnvFile(apiKey: string, serverUrl: string): string {
  return `CHIPS_API_KEY=${apiKey}\nCHIPS_SERVER_URL=${serverUrl}\n`;
}

function generateGitignore(): string {
  return `.env\nnode_modules\ndist\n`;
}

async function runWizard() {
  console.log("");
  console.log("  \u2660 CHIPS Arena \u2014 Agent Setup");
  console.log("");

  const prompt = createPrompt();
  const server = flagServer || DEFAULT_SERVER;

  try {
    // Step 1: Get API Key
    console.log("  Step 1/2: Get Your API Key");
    console.log("");
    console.log("  [1] I have an API key");
    console.log("  [2] Register a new agent (opens browser)");
    console.log("");

    const choice = await prompt.ask("Choice", "1");

    if (choice === "2") {
      console.log(`\n  Opening ${REGISTER_URL} in your browser...`);
      console.log(`  (If it doesn't open, visit the URL manually)\n`);
      openBrowser(REGISTER_URL);
    }

    const apiKey = flagKey || await prompt.ask("Paste your API key");

    if (!apiKey || !apiKey.startsWith("chp_")) {
      console.log("\n  Error: Invalid API key. Keys start with 'chp_'.\n");
      prompt.close();
      process.exit(1);
    }

    // Validate the key
    console.log("\n  Validating...");
    const info = await validateApiKey(server, apiKey);
    if (!info) {
      console.log("  Warning: Could not validate key (server may be offline). Proceeding anyway.\n");
    } else {
      console.log(`  \u2713 Verified! Agent "${info.name}" (${info.style})\n`);
    }

    // Step 2: Create project
    console.log("  Step 2/2: Creating Project");
    const agentName = info?.name || "my-agent";
    const dirName = sanitizeDirName(agentName);
    const targetDir = path.resolve(process.cwd(), dirName);

    if (fs.existsSync(targetDir)) {
      console.log(`\n  Error: Directory "${dirName}/" already exists.`);
      console.log(`  Choose a different name or delete the existing directory.\n`);
      prompt.close();
      process.exit(1);
    }

    console.log(`  Creating ${dirName}/ ...`);
    fs.mkdirSync(targetDir, { recursive: true });

    console.log(`  Writing ${dirName}/agent.ts ...`);
    fs.writeFileSync(path.join(targetDir, "agent.ts"), generateAgentTs());

    console.log(`  Writing ${dirName}/.env ...`);
    fs.writeFileSync(path.join(targetDir, ".env"), generateEnvFile(apiKey, server));

    console.log(`  Writing ${dirName}/.gitignore ...`);
    fs.writeFileSync(path.join(targetDir, ".gitignore"), generateGitignore());

    console.log(`  Writing ${dirName}/package.json ...`);
    fs.writeFileSync(path.join(targetDir, "package.json"), generatePackageJson(dirName, agentName));

    console.log(`  Writing ${dirName}/tsconfig.json ...`);
    fs.writeFileSync(path.join(targetDir, "tsconfig.json"), generateTsConfig());

    console.log("");
    console.log("  Done! Your agent is ready.");
    console.log("");
    console.log(`    cd ${dirName}`);
    console.log("    npm install");
    console.log("    npx tsx agent.ts");
    console.log("");
  } finally {
    prompt.close();
  }
}

// ─── Main ──────────────────────────────────────────────────────

runWizard().catch((err) => {
  console.error("Setup failed:", err.message);
  process.exit(1);
});
