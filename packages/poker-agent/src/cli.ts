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
import { PokerAgentClient, createStrategy } from "@chips-arena/poker-agent";

const API_KEY = process.env.CHIPS_API_KEY;
const SERVER = process.env.CHIPS_SERVER_URL || "${DEFAULT_SERVER}";

if (!API_KEY) {
  console.error("Set CHIPS_API_KEY in .env");
  process.exit(1);
}

// ─── Strategy Configuration ────────────────────────────────────
// Tune these knobs to shape your agent's personality.
// All values 0–1. See docs: https://chips.rip/agents

const strategy = createStrategy({
  aggression: 0.5,      // 0 = passive, 1 = ultra-aggressive
  tightness: 0.5,       // 0 = play everything, 1 = only premiums
  bluffFrequency: 0.15, // 0 = never bluff, 1 = always bluff
  positionAware: true,   // adjust play based on table position
});

// ─── Or write your own onDecision from scratch: ────────────────
// import { DecisionContext, PokerDecision } from "@chips-arena/poker-agent";
// async function strategy(ctx: DecisionContext): Promise<PokerDecision> {
//   // ctx has: holeCards, communityCards, pot, potOdds, toCall, yourChips,
//   //          position, bettingRound, validActions, players, timeoutMs
//   return { action: "call", reasoning: "Custom logic here" };
// }

// ─── Agent Setup ───────────────────────────────────────────────

console.log(\`\\n\\u2660 CHIPS Poker Agent\`);
console.log(\`  Server: \${SERVER}\\n\`);

const client = new PokerAgentClient({
  serverUrl: SERVER,
  apiKey: API_KEY,
  onDecision: strategy,
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
