import { randomBytes } from "crypto";
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { dirname } from "path";

export interface ApiKeyRecord {
  apiKey: string;          // "chp_" + 32 hex chars
  agentId: string;         // auto-generated from name (e.g. "smartbot-a3f2")
  name: string;
  style: string;
  avatar: string;          // URL or 2-char initials
  poolIndex: number;       // persistent vault/pool index (0-255), independent of seat
  createdAt: string;
}

const DEFAULT_PATH = "data/api-keys.json";
const KEY_PREFIX = "chp_";
// Indices 0-7 are reserved (old pools with stale mint)
const MIN_POOL_INDEX = 8;

export class ApiKeyStore {
  private byKey: Map<string, ApiKeyRecord> = new Map();
  private byAgentId: Map<string, ApiKeyRecord> = new Map();
  private byName: Map<string, ApiKeyRecord> = new Map(); // lowercase name -> record
  private usedPoolIndices: Set<number> = new Set();
  private nextPoolIndex: number = MIN_POOL_INDEX;
  private path: string;

  constructor(path: string = DEFAULT_PATH) {
    this.path = path;
    this.load();
  }

  register(opts: { name: string; style?: string; avatar?: string }): ApiKeyRecord {
    const name = opts.name.trim();
    if (!name || name.length > 30) {
      throw new Error("Name must be 1-30 characters");
    }

    if (this.byName.has(name.toLowerCase())) {
      throw new Error("Name already taken");
    }

    const apiKey = KEY_PREFIX + randomBytes(16).toString("hex");
    const agentId = this.generateAgentId(name);
    const style = opts.style || "Balanced";
    const avatar = opts.avatar || name.slice(0, 2).toUpperCase();
    const poolIndex = this.allocatePoolIndex();

    const record: ApiKeyRecord = {
      apiKey,
      agentId,
      name,
      style,
      avatar,
      poolIndex,
      createdAt: new Date().toISOString(),
    };

    this.byKey.set(apiKey, record);
    this.byAgentId.set(agentId, record);
    this.byName.set(name.toLowerCase(), record);
    this.save();

    console.log(`[ApiKeyStore] Registered agent "${name}" (${agentId})`);
    return record;
  }

  getByKey(apiKey: string): ApiKeyRecord | null {
    return this.byKey.get(apiKey) || null;
  }

  getByAgentId(agentId: string): ApiKeyRecord | null {
    return this.byAgentId.get(agentId) || null;
  }

  validateKey(apiKey: string): ApiKeyRecord | null {
    return this.getByKey(apiKey);
  }

  getAll(): ApiKeyRecord[] {
    return Array.from(this.byKey.values());
  }

  private allocatePoolIndex(): number {
    while (this.usedPoolIndices.has(this.nextPoolIndex)) {
      this.nextPoolIndex++;
    }
    if (this.nextPoolIndex > 255) {
      throw new Error("No pool indices available (max 256 agents)");
    }
    const idx = this.nextPoolIndex;
    this.usedPoolIndices.add(idx);
    this.nextPoolIndex++;
    return idx;
  }

  private generateAgentId(name: string): string {
    const base = name
      .toLowerCase()
      .replace(/[^a-z0-9\-_ ]/g, "")
      .replace(/[\s_]+/g, "-")
      .replace(/^-+|-+$/g, "")
      || "agent";
    const rand = randomBytes(2).toString("hex");
    const id = `${base}-${rand}`;

    // Ensure uniqueness
    if (this.byAgentId.has(id)) {
      return this.generateAgentId(name); // retry with new random
    }
    return id;
  }

  private load(): void {
    try {
      if (!existsSync(this.path)) return;
      const raw = readFileSync(this.path, "utf-8");
      const data: ApiKeyRecord[] = JSON.parse(raw);
      if (!Array.isArray(data)) return;
      this.byKey.clear();
      this.byAgentId.clear();
      this.byName.clear();
      this.usedPoolIndices.clear();

      let needsSave = false;
      for (const r of data) {
        // Migrate old records without poolIndex
        if (r.poolIndex === undefined || r.poolIndex === null) {
          r.poolIndex = this.allocatePoolIndex();
          needsSave = true;
        } else {
          this.usedPoolIndices.add(r.poolIndex);
        }
        this.byKey.set(r.apiKey, r);
        this.byAgentId.set(r.agentId, r);
        this.byName.set(r.name.toLowerCase(), r);
      }
      // Update nextPoolIndex to be past all used indices (and reserved range)
      this.nextPoolIndex = MIN_POOL_INDEX;
      while (this.usedPoolIndices.has(this.nextPoolIndex)) this.nextPoolIndex++;

      console.log(`[ApiKeyStore] Loaded ${this.byKey.size} API keys`);
      if (needsSave) {
        console.log(`[ApiKeyStore] Migrated records with pool indices`);
        this.save();
      }
    } catch (e: any) {
      console.error(`[ApiKeyStore] Failed to load: ${e.message}`);
    }
  }

  private save(): void {
    try {
      const dir = dirname(this.path);
      if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
      const data = Array.from(this.byKey.values());
      writeFileSync(this.path, JSON.stringify(data, null, 2));
    } catch (e: any) {
      console.error(`[ApiKeyStore] Failed to save: ${e.message}`);
    }
  }
}
