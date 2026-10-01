import { createHash, timingSafeEqual } from "node:crypto";
import { Redis } from "@upstash/redis";

/**
 * Early-access sign-ups live in the project's Upstash Redis, one hash field per email.
 * Only production writes to the real list; local dev and previews use a separate key so
 * test sign-ups never reach the export.
 */
const PREFIX = process.env.VERCEL_ENV === "production" ? "early-access" : "early-access:dev";
const EMAILS = `${PREFIX}:emails`;

// Generous on purpose: a whole room on venue wifi shares one IP.
const RATE_LIMIT = 60;
const RATE_WINDOW_SECONDS = 60;

export interface Signup {
  email: string;
  at: string;
  src: string | null;
}

let client: Redis | undefined;
function redis(): Redis {
  if (client) return client;
  const url = process.env.UPSTASH_REDIS_REST_URL ?? process.env.KV_REST_API_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN ?? process.env.KV_REST_API_TOKEN;
  if (!url || !token) throw new Error("[early-access] Upstash Redis credentials are missing.");
  return (client = new Redis({ url, token }));
}

const EMAIL_RE = /^[a-z0-9._%+-]+@[a-z0-9-]+(\.[a-z0-9-]+)*\.[a-z]{2,}$/;

export function normalizeEmail(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const email = raw.trim().toLowerCase();
  return email.length <= 254 && EMAIL_RE.test(email) ? email : null;
}

export function normalizeSrc(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const src = raw.trim().toLowerCase();
  return /^[a-z0-9_-]{1,32}$/.test(src) ? src : null;
}

const sha256 = (value: string) => createHash("sha256").update(value).digest();

/** Fixed one-minute window per IP. The key holds a hash, never the address, and expires. */
export async function allowRequest(ip: string): Promise<boolean> {
  const key = `${PREFIX}:rate:${sha256(ip).toString("hex").slice(0, 32)}`;
  const [count] = await redis()
    .pipeline()
    .incr(key)
    .expire(key, RATE_WINDOW_SECONDS, "NX")
    .exec<[number, number]>();
  return count <= RATE_LIMIT;
}

/** Keeps the first sign-up for an address; a repeat is a silent no-op. */
export async function saveSignup(email: string, src: string | null): Promise<void> {
  await redis().hsetnx(EMAILS, email, { at: new Date().toISOString(), src });
}

export async function listSignups(): Promise<Signup[]> {
  const all = (await redis().hgetall<Record<string, Omit<Signup, "email">>>(EMAILS)) ?? {};
  return Object.entries(all)
    .map(([email, row]) => ({ email, at: row.at, src: row.src ?? null }))
    .sort((a, b) => a.at.localeCompare(b.at));
}

export function exportKeyMatches(given: string | null): boolean {
  const expected = process.env.EARLY_ACCESS_EXPORT_KEY;
  if (!expected || !given) return false;
  return timingSafeEqual(sha256(given), sha256(expected));
}
