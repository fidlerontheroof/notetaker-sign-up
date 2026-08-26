// Storage layer for submissions.
//
// Uses Upstash Redis (Vercel's current recommended Redis integration — the
// older "Vercel KV" package is deprecated) when the KV_REST_API_URL /
// KV_REST_API_TOKEN env vars are present, i.e. once you've added a Redis
// integration to your Vercel project from the Marketplace. Falls back to a
// plain in-memory store for local development so you can test the flow
// without setting anything up first.
//
// IMPORTANT: the in-memory fallback resets every time the dev server
// restarts. It is NOT durable and should never be relied on in production —
// add the Redis integration (free tier is plenty for this volume) before
// you deploy.

import type { Submission } from "./types";

let memoryStore: Map<string, Submission> | null = null;

function hasKv() {
  return Boolean(process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN);
}

async function getKv() {
  const { Redis } = await import("@upstash/redis");
  return new Redis({
    url: process.env.KV_REST_API_URL!,
    token: process.env.KV_REST_API_TOKEN!,
  });
}

function getMemory() {
  if (!memoryStore) memoryStore = new Map();
  return memoryStore;
}

const INDEX_KEY = "submissions:index";

export async function saveSubmission(sub: Submission): Promise<void> {
  if (hasKv()) {
    const kv = await getKv();
    await kv.set(`submission:${sub.id}`, sub);
    await kv.sadd(INDEX_KEY, sub.id);
  } else {
    getMemory().set(sub.id, sub);
  }
}

export async function getSubmission(id: string): Promise<Submission | null> {
  if (hasKv()) {
    const kv = await getKv();
    const sub = await kv.get<Submission>(`submission:${id}`);
    return sub ?? null;
  }
  return getMemory().get(id) ?? null;
}

export async function deleteSubmission(id: string): Promise<void> {
  if (hasKv()) {
    const kv = await getKv();
    await kv.del(`submission:${id}`);
    await kv.srem(INDEX_KEY, id);
  } else {
    getMemory().delete(id);
  }
}

export async function listSubmissions(): Promise<Submission[]> {
  if (hasKv()) {
    const kv = await getKv();
    const ids = await kv.smembers(INDEX_KEY);
    if (!ids || ids.length === 0) return [];
    const subs = await Promise.all(
      ids.map((id) => kv.get<Submission>(`submission:${id}`))
    );
    return subs.filter((s): s is Submission => Boolean(s));
  }
  return Array.from(getMemory().values());
}

export async function listPending(): Promise<Submission[]> {
  const all = await listSubmissions();
  return all
    .filter((s) => s.status === "pending")
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}
