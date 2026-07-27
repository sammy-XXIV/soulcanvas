// Disk-backed key-value store for MINTED token metadata — separate from the
// ephemeral pre-mint preview cache in index.ts. This must survive restarts:
// once a soulbound NFT exists on-chain, its tokenURI has to keep resolving
// forever, which is the entire point of "so you can't lose it." Same simple
// pattern as Frank's persist.ts.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

const DATA_DIR = process.env.DATA_DIR ?? "./data";

export class PersistentMap<T> {
  private data: Record<string, T>;
  private readonly filePath: string;

  constructor(name: string) {
    this.filePath = join(DATA_DIR, `${name}.json`);
    mkdirSync(dirname(this.filePath), { recursive: true });
    this.data = existsSync(this.filePath)
      ? (JSON.parse(readFileSync(this.filePath, "utf8")) as Record<string, T>)
      : {};
  }

  get(key: string): T | undefined {
    return this.data[key];
  }

  set(key: string, value: T): void {
    this.data[key] = value;
    writeFileSync(this.filePath, JSON.stringify(this.data));
  }
}
