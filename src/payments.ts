import { OKXFacilitatorClient } from "@okxweb3/app-x402-core";
import { x402ResourceServer } from "@okxweb3/app-x402-core/server";
import { AggrDeferredEvmScheme } from "@okxweb3/app-x402-evm/deferred/server";
import { ExactEvmScheme } from "@okxweb3/app-x402-evm/exact/server";
import type express from "express";

function requireEnv(k: string): string {
  const v = process.env[k];
  if (!v) throw new Error(`Missing env: ${k}`);
  return v;
}

export const NETWORK = (process.env.X402_NETWORK ?? "eip155:196") as `eip155:${string}`;
export const PAY_TO = requireEnv("PAY_TO_ADDRESS");
// X Layer's USD₮0 (6 decimals)
const ASSET = process.env.X402_ASSET ?? "0x779ded0c9e1022225f8e0630b35a9b54be713736";

/** Covers OpenAI image-gen cost (gpt-image-2, high quality) + soulbound mint gas. */
export const PRICE_BASE_UNITS = {
  generate: process.env.SOULCANVAS_PRICE_GENERATE ?? "150000", // $0.15
} as const;

function exactAccept(amountBaseUnits: string) {
  return {
    scheme: "exact" as const,
    network: NETWORK,
    payTo: PAY_TO,
    price: { amount: amountBaseUnits, asset: ASSET },
    extra: { name: "USD₮0", version: "1" },
  };
}

function aggrDeferredAccept(amountBaseUnits: string) {
  return {
    scheme: "aggr_deferred" as const,
    network: NETWORK,
    payTo: PAY_TO,
    price: { amount: amountBaseUnits, asset: ASSET },
    extra: { name: "USD₮0", version: "1" },
  };
}

/** Both accepted payment options for a route, exact first (recommended default). */
export function acceptsFor(amountBaseUnits: string) {
  return [exactAccept(amountBaseUnits), aggrDeferredAccept(amountBaseUnits)];
}

const facilitatorOptions = {
  apiKey: requireEnv("OKX_API_KEY"),
  secretKey: requireEnv("OKX_SECRET_KEY"),
  passphrase: requireEnv("OKX_PASSPHRASE"),
  ...(process.env.OKX_BASE_URL ? { baseUrl: process.env.OKX_BASE_URL } : {}),
};
const facilitator = new OKXFacilitatorClient(facilitatorOptions);

export const resourceServer = new x402ResourceServer(facilitator)
  .register(NETWORK, new ExactEvmScheme())
  .register(NETWORK, new AggrDeferredEvmScheme());

/** Call once at startup, before serving requests. */
export async function initPayments(): Promise<void> {
  await resourceServer.initialize();
}

/** Payer wallet address, read from the verified payment header (same approach as Frank/Renegade). */
export function payerOf(req: express.Request): string {
  const header = req.header("payment-signature");
  if (!header) throw new Error("no verified payment on request");
  const payload = JSON.parse(Buffer.from(header, "base64").toString("utf8")) as {
    payload?: { authorization?: { from?: string } };
  };
  const from = payload?.payload?.authorization?.from;
  if (!from) throw new Error("payment payload missing payer");
  return from.toLowerCase();
}
