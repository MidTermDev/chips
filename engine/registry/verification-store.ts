import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { dirname } from "path";

export interface Verification {
  agentId: string;
  key: string;        // 6-char alphanumeric
  seat: number;
  verified: boolean;
  createdAt: string;
}

const DEFAULT_PATH = "data/verifications.json";
const KEY_LENGTH = 6;
const KEY_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no O/0/I/1 to avoid confusion

export class VerificationStore {
  private verifications: Map<string, Verification> = new Map(); // key -> Verification
  private agentIndex: Map<string, string> = new Map(); // agentId -> key
  private path: string;

  constructor(path: string = DEFAULT_PATH) {
    this.path = path;
    this.load();
  }

  generate(agentId: string, seat: number): string {
    // If agent already has a key, return it
    const existingKey = this.agentIndex.get(agentId);
    if (existingKey) {
      const existing = this.verifications.get(existingKey);
      if (existing) {
        existing.seat = seat;
        this.save();
        return existing.key;
      }
    }

    const key = this.generateKey();
    const verification: Verification = {
      agentId,
      key,
      seat,
      verified: false,
      createdAt: new Date().toISOString(),
    };

    this.verifications.set(key, verification);
    this.agentIndex.set(agentId, key);
    this.save();

    console.log(`[VerificationStore] Generated key ${key} for agent ${agentId} at seat ${seat}`);
    return key;
  }

  verify(key: string): Verification | null {
    const upperKey = key.toUpperCase();
    const verification = this.verifications.get(upperKey);
    if (!verification) return null;

    verification.verified = true;
    this.save();

    console.log(`[VerificationStore] Agent ${verification.agentId} verified with key ${upperKey}`);
    return verification;
  }

  isVerified(agentId: string): boolean {
    const key = this.agentIndex.get(agentId);
    if (!key) return false;
    const v = this.verifications.get(key);
    return v?.verified ?? false;
  }

  getByAgentId(agentId: string): Verification | null {
    const key = this.agentIndex.get(agentId);
    if (!key) return null;
    return this.verifications.get(key) || null;
  }

  getAll(): Verification[] {
    return Array.from(this.verifications.values());
  }

  private generateKey(): string {
    let key: string;
    do {
      key = "";
      for (let i = 0; i < KEY_LENGTH; i++) {
        key += KEY_CHARS[Math.floor(Math.random() * KEY_CHARS.length)];
      }
    } while (this.verifications.has(key));
    return key;
  }

  private load(): void {
    try {
      if (!existsSync(this.path)) return;
      const raw = readFileSync(this.path, "utf-8");
      const data: Verification[] = JSON.parse(raw);
      if (!Array.isArray(data)) return;
      this.verifications.clear();
      this.agentIndex.clear();
      for (const v of data) {
        this.verifications.set(v.key, v);
        this.agentIndex.set(v.agentId, v.key);
      }
      console.log(`[VerificationStore] Loaded ${this.verifications.size} verifications`);
    } catch (e: any) {
      console.error(`[VerificationStore] Failed to load: ${e.message}`);
    }
  }

  private save(): void {
    try {
      const dir = dirname(this.path);
      if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
      const data = Array.from(this.verifications.values());
      writeFileSync(this.path, JSON.stringify(data, null, 2));
    } catch (e: any) {
      console.error(`[VerificationStore] Failed to save: ${e.message}`);
    }
  }
}
