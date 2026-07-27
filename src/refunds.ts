// Refund ledger: records payments that settled but failed to deliver (e.g.
// OpenAI generation errors after the x402 payment already went through), so
// a human can process the actual refund. This service can't send funds
// itself — same honest approach as Renegade's refunds.ts: tracked and
// minimized, not automatic.

import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";

const DATA_DIR = process.env.DATA_DIR ?? "./data";
const FILE = join(DATA_DIR, "refunds.json");

export interface RefundEntry {
  route: "generate";
  payer: string; // lowercased wallet address
  amountBaseUnits: string; // raw x402 amount, e.g. "150000" = $0.15 at 6dp
  reason: string;
  createdAt: number;
  refunded: boolean;
}

let entries: RefundEntry[] = [];

function load(): void {
  if (!existsSync(FILE)) return;
  try {
    entries = JSON.parse(readFileSync(FILE, "utf8")) as RefundEntry[];
  } catch (err) {
    console.error("[refunds] load failed:", (err as Error).message);
  }
}
load();

function persist(): void {
  try {
    mkdirSync(dirname(FILE), { recursive: true });
    writeFileSync(FILE, JSON.stringify(entries, null, 2));
  } catch (err) {
    console.error("[refunds] persist failed:", (err as Error).message);
  }
}

export function recordFailure(entry: Omit<RefundEntry, "createdAt" | "refunded">): void {
  entries.push({ ...entry, createdAt: Date.now(), refunded: false });
  persist();
  console.error(
    `[refunds] ${entry.route} failed after payment — ${entry.amountBaseUnits} base units owed to ${entry.payer}: ${entry.reason}`
  );
}

/** Read-only list of unrefunded entries — for a human to actually process. */
export function pendingRefunds(): RefundEntry[] {
  return entries.filter((e) => !e.refunded);
}
