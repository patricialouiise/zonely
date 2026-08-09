/**
 * Encrypted-blob sync endpoint, backed by Vercel KV / Upstash Redis.
 *
 * The client derives a `storageId` and an encryption key from the user's
 * passphrase (see src/lib/sync.ts) and only ever sends CIPHERTEXT here — the
 * server never sees the passphrase or the plaintext schedule. This function is
 * a dumb key/value box: it stores one encrypted blob per storageId.
 *
 *   GET  /api/sync?id=<storageId>            -> { blob: string | null }
 *   PUT  /api/sync?id=<storageId>  { blob }  -> { ok: true }
 *
 * Reads its Redis credentials from the env vars the Vercel Upstash integration
 * injects. If they're absent (feature not provisioned yet) it returns 503 so
 * the client can show a clear "sync isn't set up" message instead of hanging.
 */

const REST_URL =
  process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL || "";
const REST_TOKEN =
  process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN || "";

// storageId is base64url of 16 bytes -> ~22 chars; allow a little slack.
const ID_RE = /^[A-Za-z0-9_-]{16,64}$/;
const MAX_BLOB = 400_000; // ~400 KB ciphertext ceiling
const TTL_SECONDS = 60 * 60 * 24 * 400; // expire abandoned blobs after ~400 days

/** Run a single Redis command through the Upstash REST API. */
async function redis(command: (string | number)[]): Promise<unknown> {
  const r = await fetch(REST_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${REST_TOKEN}`,
      "content-type": "application/json",
    },
    body: JSON.stringify(command),
  });
  if (!r.ok) throw new Error(`kv ${r.status}`);
  const json = (await r.json()) as { result?: unknown };
  return json.result;
}

export default async function handler(req: any, res: any) {
  res.setHeader("Cache-Control", "no-store");

  if (!REST_URL || !REST_TOKEN) {
    res.status(503).json({ error: "Sync isn't configured on this deployment." });
    return;
  }

  const id = String(req.query?.id ?? "");
  if (!ID_RE.test(id)) {
    res.status(400).json({ error: "Bad sync id." });
    return;
  }
  const key = `sync:${id}`;

  try {
    if (req.method === "GET") {
      const blob = await redis(["GET", key]);
      res.status(200).json({ blob: typeof blob === "string" ? blob : null });
      return;
    }

    if (req.method === "PUT") {
      const body =
        typeof req.body === "string" ? JSON.parse(req.body || "{}") : req.body ?? {};
      const blob = body?.blob;
      if (typeof blob !== "string" || blob.length === 0) {
        res.status(400).json({ error: "Missing blob." });
        return;
      }
      if (blob.length > MAX_BLOB) {
        res.status(413).json({ error: "Too much data to sync." });
        return;
      }
      await redis(["SET", key, blob, "EX", TTL_SECONDS]);
      res.status(200).json({ ok: true });
      return;
    }

    res.setHeader("Allow", "GET, PUT");
    res.status(405).json({ error: "Method not allowed." });
  } catch {
    res.status(502).json({ error: "Sync store unavailable." });
  }
}
