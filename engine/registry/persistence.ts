import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { dirname } from "path";
import { PlayerRegistry, RegistrySnapshot } from "./player-registry";

const DEFAULT_PATH = "data/registry.json";

export function saveRegistry(registry: PlayerRegistry, path: string = DEFAULT_PATH): void {
  try {
    const dir = dirname(path);
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    const snapshot = registry.toSnapshot();
    writeFileSync(path, JSON.stringify(snapshot, null, 2));
  } catch (e: any) {
    console.error(`[persistence] Failed to save registry: ${e.message}`);
  }
}

export function loadRegistry(registry: PlayerRegistry, path: string = DEFAULT_PATH): boolean {
  try {
    if (!existsSync(path)) return false;
    const raw = readFileSync(path, "utf-8");
    const snapshot: RegistrySnapshot = JSON.parse(raw);
    registry.loadSnapshot(snapshot);
    console.log(`[persistence] Loaded ${snapshot.agents.length} agents from snapshot`);
    return true;
  } catch (e: any) {
    console.error(`[persistence] Failed to load registry: ${e.message}`);
    return false;
  }
}
