import OpenAI from "openai";

function requireEnv(k: string): string {
  const v = process.env[k];
  if (!v) throw new Error(`Missing env: ${k}`);
  return v;
}

const openai = new OpenAI({ apiKey: requireEnv("OPENAI_API_KEY") });

/**
 * House style, locked across every generation so the collection reads as one
 * curated series rather than a random per-request style. Deliberately NOT
 * named "Studio Ghibli" (trademark/IP risk for a commercial product) — the
 * qualities are described directly instead.
 */
const HOUSE_STYLE =
  "warm painterly hand-painted anime-style illustration, intricate background detail, " +
  "soft glowing lamplight or golden-hour light with visible light rays, rich textures on " +
  "fabric and surfaces, layered depth, peaceful nostalgic cinematic mood, warm color " +
  "palette with deep shadows, expressive but grounded character faces. Do not depict any " +
  "real brand names, logos, or trademarked product designs (e.g. a generic smartphone box, " +
  "not a specific phone brand) — genuinely generic objects only.";

export interface MemoryInput {
  story: string;
  setting?: string;
  emotionalBeat?: string;
  whoElsePresent?: string;
  specificDetail?: string;
}

function buildPrompt(input: MemoryInput): string {
  const parts = [input.story];
  if (input.setting) parts.push(`Setting: ${input.setting}.`);
  if (input.emotionalBeat) parts.push(`The moment that matters most: ${input.emotionalBeat}.`);
  if (input.whoElsePresent) parts.push(`Who's there: ${input.whoElsePresent}.`);
  if (input.specificDetail) parts.push(`A specific detail to include: ${input.specificDetail}.`);
  return `${parts.join(" ")} Illustration style: ${HOUSE_STYLE}`;
}

export interface GeneratedArt {
  base64Png: string;
  prompt: string;
}

/** Generate the memory art. Throws on API failure — caller decides refund handling. */
export async function generateMemoryArt(input: MemoryInput): Promise<GeneratedArt> {
  const prompt = buildPrompt(input);
  const result = await openai.images.generate({
    model: "gpt-image-2",
    prompt,
    size: "1024x1024",
    quality: "high",
  });
  const b64 = result.data?.[0]?.b64_json;
  if (!b64) throw new Error("OpenAI image generation returned no image data");
  return { base64Png: b64, prompt };
}
