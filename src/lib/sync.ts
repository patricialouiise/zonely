/**
 * End-to-end-encrypted cross-device sync.
 *
 * The user picks a passphrase. From it we derive (via PBKDF2) two things:
 *   - a `storageId` — the opaque key the blob is stored under, and
 *   - an AES-GCM key — used to encrypt/decrypt the payload in the browser.
 * The server (api/sync.ts) only ever sees the storageId and ciphertext; the
 * passphrase and the schedule itself never leave the device in the clear. Two
 * devices that type the same passphrase derive the same id + key, so they read
 * and write the same encrypted blob.
 *
 * Conflict model is whole-document last-write-wins by `updatedAt`, with a
 * union-merge of events on the initial connect so joining two existing devices
 * never drops data. See App.tsx for the orchestration.
 */
import type { AppSettings, CalEvent } from "../types";
import { sanitizeEvents, sanitizeSettings } from "./sanitize";
import { DEFAULT_SETTINGS } from "./storage";

export interface SyncDoc {
  app: "zonely";
  version: 1;
  updatedAt: number; // ms epoch — the last-write-wins clock
  events: CalEvent[];
  settings: AppSettings;
}

export interface SyncConfig {
  storageId: string;
  keyB64: string;
  lastSyncedAt: number;
}

/** Thrown when the deployment has no KV store wired up (server returns 503). */
export class SyncUnconfigured extends Error {
  constructor() {
    super("Sync isn't set up on the server yet.");
    this.name = "SyncUnconfigured";
  }
}

const APP_SALT = new TextEncoder().encode("zonely.sync.v1");
const PBKDF2_ITERS = 200_000;
const SYNC_KEY = "tzp.sync.v1";
const META_KEY = "tzp.meta.v1";

// ---- base64url helpers ----
function b64url(bytes: Uint8Array): string {
  let bin = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    bin += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function fromB64url(s: string): Uint8Array<ArrayBuffer> {
  const bin = atob(s.replace(/-/g, "+").replace(/_/g, "/"));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

// ---- key derivation + crypto ----
/** Derive the storage id + AES key material from a passphrase. */
export async function deriveKeys(passphrase: string): Promise<{ storageId: string; keyB64: string }> {
  const material = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(passphrase.normalize("NFKC")),
    "PBKDF2",
    false,
    ["deriveBits"]
  );
  const bits = new Uint8Array(
    await crypto.subtle.deriveBits(
      { name: "PBKDF2", salt: APP_SALT, iterations: PBKDF2_ITERS, hash: "SHA-256" },
      material,
      384 // 48 bytes: 16 for the id, 32 for the AES-256 key
    )
  );
  return { storageId: b64url(bits.slice(0, 16)), keyB64: b64url(bits.slice(16, 48)) };
}

async function importAesKey(keyB64: string): Promise<CryptoKey> {
  return crypto.subtle.importKey("raw", fromB64url(keyB64), "AES-GCM", false, [
    "encrypt",
    "decrypt",
  ]);
}

/** Encrypt a document into an "iv.ciphertext" (base64url) blob. */
export async function encryptDoc(keyB64: string, doc: SyncDoc): Promise<string> {
  const key = await importAesKey(keyB64);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const pt = new TextEncoder().encode(JSON.stringify(doc));
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, pt));
  return b64url(iv) + "." + b64url(ct);
}

/** Reverse of encryptDoc. Throws (OperationError) if the key is wrong. */
export async function decryptDoc(keyB64: string, blob: string): Promise<unknown> {
  const [ivB, ctB] = blob.split(".");
  if (!ivB || !ctB) throw new Error("Malformed sync blob.");
  const key = await importAesKey(keyB64);
  const pt = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: fromB64url(ivB) },
    key,
    fromB64url(ctB)
  );
  return JSON.parse(new TextDecoder().decode(pt));
}

// ---- transport ----
export async function pullBlob(storageId: string): Promise<string | null> {
  const r = await fetch(`/api/sync?id=${encodeURIComponent(storageId)}`);
  if (r.status === 503) throw new SyncUnconfigured();
  if (!r.ok) throw new Error(`Sync fetch failed (${r.status}).`);
  const j = (await r.json()) as { blob?: unknown };
  return typeof j.blob === "string" ? j.blob : null;
}

export async function pushBlob(storageId: string, blob: string): Promise<void> {
  const r = await fetch(`/api/sync?id=${encodeURIComponent(storageId)}`, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ blob }),
  });
  if (r.status === 503) throw new SyncUnconfigured();
  if (!r.ok) throw new Error(`Sync save failed (${r.status}).`);
}

// ---- payload hygiene + merge ----
export function sanitizeDoc(raw: unknown): {
  events: CalEvent[];
  settings: AppSettings | null;
  updatedAt: number;
} {
  const obj = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  return {
    events: sanitizeEvents(obj.events),
    settings: obj.settings ? sanitizeSettings(obj.settings, DEFAULT_SETTINGS) : null,
    updatedAt: typeof obj.updatedAt === "number" ? obj.updatedAt : 0,
  };
}

/** Union two event lists by id; entries in `incoming` win on collision. */
export function mergeEventsById(base: CalEvent[], incoming: CalEvent[]): CalEvent[] {
  const byId = new Map(base.map((e) => [e.id, e]));
  incoming.forEach((e) => byId.set(e.id, e));
  return [...byId.values()];
}

// ---- persisted config + LWW clock ----
export function loadSyncConfig(): SyncConfig | null {
  try {
    const raw = localStorage.getItem(SYNC_KEY);
    if (!raw) return null;
    const c = JSON.parse(raw);
    if (c && typeof c.storageId === "string" && typeof c.keyB64 === "string") {
      return { storageId: c.storageId, keyB64: c.keyB64, lastSyncedAt: Number(c.lastSyncedAt) || 0 };
    }
  } catch {
    /* fall through */
  }
  return null;
}
export function saveSyncConfig(c: SyncConfig): void {
  try {
    localStorage.setItem(SYNC_KEY, JSON.stringify(c));
  } catch {
    /* ignore */
  }
}
export function clearSyncConfig(): void {
  try {
    localStorage.removeItem(SYNC_KEY);
  } catch {
    /* ignore */
  }
}

export function loadUpdatedAt(): number {
  try {
    const raw = localStorage.getItem(META_KEY);
    if (!raw) return 0;
    return Number(JSON.parse(raw)?.updatedAt) || 0;
  } catch {
    return 0;
  }
}
export function saveUpdatedAt(updatedAt: number): void {
  try {
    localStorage.setItem(META_KEY, JSON.stringify({ updatedAt }));
  } catch {
    /* ignore */
  }
}
