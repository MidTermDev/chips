import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { dirname } from "path";

export interface AgentProfile {
  agentId: string;
  name: string;
  style: string;
  avatar: string;
  description: string;
  walletAddress: string;
  // Lifetime stats
  totalHandsPlayed: number;
  totalWins: number;
  totalPnL: number;
  vpipHands: number;     // hands where voluntarily put $ in pot
  pfrHands: number;      // hands where preflop raised
  totalBets: number;
  totalRaises: number;
  biggestPotWon: number;
  sessionsPlayed: number;
  // Timestamps
  firstSeen: string;     // ISO date
  lastSeen: string;
  status: "online" | "offline";
}

export interface HandResult {
  participated: boolean;
  won: boolean;
  pnl: number;
  potWon: number;
  vpip: boolean;          // voluntarily put $ in pot (called/raised preflop)
  pfr: boolean;           // preflop raised
  betCount: number;
  raiseCount: number;
}

const DEFAULT_PATH = "data/profiles.json";

export class ProfileStore {
  private profiles: Map<string, AgentProfile> = new Map();
  private path: string;
  private dirty: boolean = false;

  constructor(path: string = DEFAULT_PATH) {
    this.path = path;
    this.load();
  }

  load(): void {
    try {
      if (!existsSync(this.path)) return;
      const raw = readFileSync(this.path, "utf-8");
      const data: AgentProfile[] = JSON.parse(raw);
      this.profiles.clear();
      for (const p of data) {
        this.profiles.set(p.agentId, p);
      }
      console.log(`[ProfileStore] Loaded ${this.profiles.size} profiles`);
    } catch (e: any) {
      console.error(`[ProfileStore] Failed to load: ${e.message}`);
    }
  }

  save(): void {
    try {
      const dir = dirname(this.path);
      if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
      const data = Array.from(this.profiles.values());
      writeFileSync(this.path, JSON.stringify(data, null, 2));
      this.dirty = false;
    } catch (e: any) {
      console.error(`[ProfileStore] Failed to save: ${e.message}`);
    }
  }

  upsert(agentId: string, data: {
    name: string;
    style?: string;
    avatar?: string;
    description?: string;
    walletAddress?: string;
  }): void {
    const existing = this.profiles.get(agentId);
    const now = new Date().toISOString();

    if (existing) {
      existing.name = data.name;
      existing.style = data.style || existing.style;
      existing.avatar = data.avatar || existing.avatar;
      existing.description = data.description || existing.description;
      existing.walletAddress = data.walletAddress || existing.walletAddress;
      existing.lastSeen = now;
      existing.status = "online";
      existing.sessionsPlayed++;
    } else {
      this.profiles.set(agentId, {
        agentId,
        name: data.name,
        style: data.style || "Unknown",
        avatar: data.avatar || data.name.slice(0, 2).toUpperCase(),
        description: data.description || "",
        walletAddress: data.walletAddress || "",
        totalHandsPlayed: 0,
        totalWins: 0,
        totalPnL: 0,
        vpipHands: 0,
        pfrHands: 0,
        totalBets: 0,
        totalRaises: 0,
        biggestPotWon: 0,
        sessionsPlayed: 1,
        firstSeen: now,
        lastSeen: now,
        status: "online",
      });
    }
    this.dirty = true;
    this.save();
  }

  updateStats(agentId: string, result: HandResult): void {
    const profile = this.profiles.get(agentId);
    if (!profile) return;

    if (result.participated) {
      profile.totalHandsPlayed++;
    }
    if (result.won) {
      profile.totalWins++;
    }
    profile.totalPnL += result.pnl;
    if (result.vpip) profile.vpipHands++;
    if (result.pfr) profile.pfrHands++;
    profile.totalBets += result.betCount;
    profile.totalRaises += result.raiseCount;
    if (result.potWon > profile.biggestPotWon) {
      profile.biggestPotWon = result.potWon;
    }
    profile.lastSeen = new Date().toISOString();
    this.dirty = true;
  }

  setStatus(agentId: string, status: "online" | "offline"): void {
    const profile = this.profiles.get(agentId);
    if (!profile) return;
    profile.status = status;
    profile.lastSeen = new Date().toISOString();
    this.dirty = true;
    this.save();
  }

  getAll(): AgentProfile[] {
    return Array.from(this.profiles.values());
  }

  getById(agentId: string): AgentProfile | null {
    return this.profiles.get(agentId) || null;
  }

  saveIfDirty(): void {
    if (this.dirty) this.save();
  }
}
