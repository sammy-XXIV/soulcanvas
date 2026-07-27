// Soulcanvas: tell it a precious memory, it turns it into art, then mints it
// as a soulbound NFT to your wallet on X Layer — so you can't lose it.
//
//   POST /generate  — x402-gated. Body: memory details. Generates the art,
//                      returns { previewId, imageBase64Png }. Payment already
//                      covers the eventual mint — /mint itself is free.
//   POST /mint       — takes a previewId + recipient address, performs the
//                      actual soulbound mint. Irreversible: only call this
//                      after the buyer has seen the preview and confirmed.
//   GET  /preview/:id — re-fetch a pending preview's image (convenience).

import express from "express";
import { paymentMiddleware } from "@okxweb3/app-x402-express";
import { acceptsFor, initPayments, payerOf, PRICE_BASE_UNITS, resourceServer } from "./payments.js";
import { generateMemoryArt, type MemoryInput } from "./imagegen.js";
import { mintMemory } from "./mint.js";
import { PersistentMap } from "./persist.js";
import { randomUUID } from "node:crypto";

process.on("uncaughtException", (err) => console.error("uncaughtException:", err));
process.on("unhandledRejection", (err) => console.error("unhandledRejection:", err));

const app = express();
app.use(express.json({ limit: "2mb" }));

const PORT = process.env.PORT ?? 3000;

// v1: in-memory only. A restart between /generate and /mint loses pending
// previews — acceptable for now, documented in README as a known limitation
// (same pattern as Renegade's charge-on-accept gap).
interface PendingPreview {
  payer: string;
  imageBase64Png: string;
  story: string;
  createdAt: number;
}
const previews = new Map<string, PendingPreview>();
const PREVIEW_TTL_MS = 30 * 60 * 1000; // 30 minutes

// Durable, disk-backed — written once at mint time, read forever after by
// tokenURI. Never subject to the pending-preview TTL above.
interface MintedMetadata {
  name: string;
  description: string;
  imageBase64Png: string;
}
const mintedMetadata = new PersistentMap<MintedMetadata>("minted-metadata");

/** Trim to a marketplace/wallet-friendly length, on a word boundary. */
function shortDescription(story: string, maxLen = 280): string {
  const trimmed = story.trim();
  if (trimmed.length <= maxLen) return trimmed;
  return trimmed.slice(0, trimmed.lastIndexOf(" ", maxLen)) + "…";
}

function pruneExpiredPreviews() {
  const now = Date.now();
  for (const [id, p] of previews) {
    if (now - p.createdAt > PREVIEW_TTL_MS) previews.delete(id);
  }
}

app.get("/health", (_req, res) => {
  res.json({ status: "ok", service: "soulcanvas" });
});

const routes = {
  "POST /generate": {
    accepts: acceptsFor(PRICE_BASE_UNITS.generate),
    description:
      "Tell it a precious memory and it generates keepsake art in Soulcanvas's house " +
      "style (warm painterly, richly detailed, nostalgic). Required JSON body: " +
      '{ story: string (the memory, freeform), setting?: string, emotionalBeat?: string, ' +
      "whoElsePresent?: string, specificDetail?: string }. Returns a preview — call " +
      "POST /mint with the returned previewId to actually mint it as a soulbound NFT " +
      "once you've confirmed you like it. Payment covers both the art and the eventual mint.",
    mimeType: "application/json",
  },
};

app.use(paymentMiddleware(routes, resourceServer));

app.post("/generate", async (req, res) => {
  const startedAt = Date.now();
  try {
    const body = req.body as MemoryInput;
    if (!body?.story || typeof body.story !== "string") {
      res.status(400).json({ error: "story is required (the memory, freeform text)" });
      return;
    }

    const payer = payerOf(req);
    const art = await generateMemoryArt(body);

    pruneExpiredPreviews();
    const previewId = randomUUID();
    previews.set(previewId, {
      payer,
      imageBase64Png: art.base64Png,
      story: body.story,
      createdAt: Date.now(),
    });

    res.json({
      previewId,
      imageBase64Png: art.base64Png,
      note: "Review the art, then POST /mint with this previewId and your wallet address to mint it as a soulbound NFT. This step is irreversible once minted.",
    });
    console.log(`[soulcanvas] generated in ${Date.now() - startedAt}ms, previewId=${previewId}`);
  } catch (err) {
    console.error(`[soulcanvas] generate failed after ${Date.now() - startedAt}ms:`, err);
    res.status(500).json({ error: "generation failed", detail: (err as Error).message });
  }
});

app.get("/preview/:id", (req, res) => {
  pruneExpiredPreviews();
  const preview = previews.get(req.params.id);
  if (!preview) {
    res.status(404).json({ error: "preview not found or expired (30 min TTL)" });
    return;
  }
  res.json({ imageBase64Png: preview.imageBase64Png });
});

app.post("/mint", async (req, res) => {
  const startedAt = Date.now();
  try {
    const { previewId, recipient } = req.body as { previewId?: string; recipient?: string };
    if (!previewId || typeof previewId !== "string") {
      res.status(400).json({ error: "previewId is required" });
      return;
    }
    if (!recipient || !/^0x[a-fA-F0-9]{40}$/.test(recipient)) {
      res.status(400).json({ error: "recipient must be a valid 0x-prefixed EVM address" });
      return;
    }

    pruneExpiredPreviews();
    const preview = previews.get(previewId);
    if (!preview) {
      res.status(404).json({ error: "preview not found or expired (30 min TTL) — call /generate again" });
      return;
    }

    // Metadata JSON hosted by this same backend (v1 — see README limitations).
    // Written to durable storage BEFORE the mint call, so tokenURI can never
    // point at metadata that doesn't exist yet. description = a short,
    // human-readable summary of the memory itself, not the raw image-gen
    // prompt (which is verbose/technical, wrong tone for what a wallet or
    // marketplace displays to someone looking at their keepsake).
    mintedMetadata.set(previewId, {
      name: "Soulcanvas Memory",
      description: shortDescription(preview.story),
      imageBase64Png: preview.imageBase64Png,
    });
    const tokenURI = `${req.protocol}://${req.get("host")}/metadata/${previewId}`;
    const { tokenId, txHash } = await mintMemory(recipient as `0x${string}`, tokenURI);

    previews.delete(previewId);
    res.json({ tokenId: tokenId.toString(), txHash, tokenURI });
    console.log(`[soulcanvas] minted tokenId=${tokenId} to ${recipient} in ${Date.now() - startedAt}ms`);
  } catch (err) {
    console.error(`[soulcanvas] mint failed after ${Date.now() - startedAt}ms:`, err);
    res.status(500).json({ error: "mint failed", detail: (err as Error).message });
  }
});

// ERC-721 metadata JSON for a minted token. Reads from durable storage —
// survives restarts, unlike the pre-mint preview cache above.
app.get("/metadata/:previewId", (req, res) => {
  const meta = mintedMetadata.get(req.params.previewId);
  if (!meta) {
    res.status(404).json({ error: "metadata not found" });
    return;
  }
  res.json({
    name: meta.name,
    description: meta.description,
    image: `data:image/png;base64,${meta.imageBase64Png}`,
  });
});

app.all("/generate", (req, res) => {
  if (req.method !== "POST") res.set("Allow", "POST").status(405).json({ error: "method not allowed, use POST" });
});

app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error("route error:", err);
  if (!res.headersSent) res.status(500).json({ error: "internal error" });
});

await initPayments();

app.listen(PORT, () => {
  console.log(`Soulcanvas listening on port ${PORT}`);
});
