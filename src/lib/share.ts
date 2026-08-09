/**
 * Encode/decode app data into a compact, URL-safe token so a schedule can be
 * moved between devices (or web -> installed PWA) via a shareable link instead
 * of a file round-trip. Payloads are gzipped when the browser supports the
 * Compression Streams API, and fall back to raw base64 otherwise; a one-char
 * tag records which, so decode never has to guess.
 */

function bytesToB64url(bytes: Uint8Array): string {
  let bin = "";
  const chunk = 0x8000; // avoid arg-count limits on String.fromCharCode
  for (let i = 0; i < bytes.length; i += chunk) {
    bin += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function b64urlToBytes(s: string): Uint8Array {
  const bin = atob(s.replace(/-/g, "+").replace(/_/g, "/"));
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

async function pipe(bytes: Uint8Array, stream: TransformStream): Promise<Uint8Array> {
  const writer = stream.writable.getWriter();
  void writer.write(bytes);
  void writer.close();
  return new Uint8Array(await new Response(stream.readable).arrayBuffer());
}

const hasCompression = typeof CompressionStream !== "undefined";

/** Serialize a payload into a URL-safe token (tagged: "g" gzipped, "r" raw). */
export async function encodeShare(payload: unknown): Promise<string> {
  const raw = new TextEncoder().encode(JSON.stringify(payload));
  if (hasCompression) {
    try {
      return "g" + bytesToB64url(await pipe(raw, new CompressionStream("gzip")));
    } catch {
      /* fall back to raw below */
    }
  }
  return "r" + bytesToB64url(raw);
}

/** Reverse of encodeShare. Throws on a malformed/unknown token. */
export async function decodeShare(token: string): Promise<unknown> {
  const tag = token[0];
  const bytes = b64urlToBytes(token.slice(1));
  let json: string;
  if (tag === "g") {
    json = new TextDecoder().decode(await pipe(bytes, new DecompressionStream("gzip")));
  } else if (tag === "r") {
    json = new TextDecoder().decode(bytes);
  } else {
    throw new Error("Unrecognized share token");
  }
  return JSON.parse(json);
}
