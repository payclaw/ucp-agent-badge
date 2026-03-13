/**
 * kyaLabs Badge JWT Verification — Reference Implementation
 *
 * This file is a reference implementation of the kyaLabs badge verification
 * algorithm described in the io.kyalabs.common.identity UCP extension spec.
 *
 * It is NOT published as an npm package. Enterprise merchants should
 * reimplement this algorithm in their server-side language/stack.
 *
 * Algorithm:
 *   1. Decode JWT header + payload (base64url)
 *   2. Extract `kid` from header
 *   3. Fetch JWKS from kyalabs.io/.well-known/ucp (cache 1 hour)
 *   4. Find the signing key matching `kid` in `signing_keys[]`
 *   5. Verify ES256 (ECDSA P-256 + SHA-256) signature via Web Crypto
 *   6. Check `exp` with clock tolerance
 *   7. Return decoded identity claims or null
 *
 * Runtime: Node.js 18+, Cloudflare Workers, any runtime with Web Crypto API.
 * Dependencies: None (Web Crypto API only).
 *
 * Run tests: npx vitest reference/verify.test.ts
 */

// ── Types ──

export interface BadgeIdentity {
  userId: string;
  agentId: string;
  intent: string;
  scopes: string[];
  merchantDomain?: string;
  issuedAt: number;
  expiresAt: number;
  kid: string;
}

export interface VerifyOptions {
  /** JWKS source URL. Default: 'https://kyalabs.io/.well-known/ucp' */
  jwksUri?: string;
  /** Cache TTL in ms. Default: 3600000 (1 hour) */
  cacheTtlMs?: number;
  /** Clock tolerance in seconds for exp check. Default: 30 */
  clockToleranceSec?: number;
}

// ── JWKS Cache ──

interface JWKSCache {
  keys: Map<string, CryptoKey>;
  fetchedAt: number;
}

let jwksCache: JWKSCache | null = null;
let jwksCacheUri: string | null = null;

// ── Helpers ──

function base64urlDecode(str: string): Uint8Array {
  const padded = str.replace(/-/g, "+").replace(/_/g, "/");
  const padding = "=".repeat((4 - (padded.length % 4)) % 4);
  const binary = atob(padded + padding);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

function decodeJWT(token: string): { header: Record<string, unknown>; payload: Record<string, unknown>; signatureBytes: Uint8Array; signedPart: string } | null {
  const parts = token.split(".");
  if (parts.length !== 3) return null;

  try {
    const header = JSON.parse(new TextDecoder().decode(base64urlDecode(parts[0])));
    const payload = JSON.parse(new TextDecoder().decode(base64urlDecode(parts[1])));
    const signatureBytes = base64urlDecode(parts[2]);
    const signedPart = `${parts[0]}.${parts[1]}`;
    return { header, payload, signatureBytes, signedPart };
  } catch {
    return null;
  }
}

async function importJWK(jwk: Record<string, unknown>): Promise<CryptoKey | null> {
  try {
    return await globalThis.crypto.subtle.importKey(
      "jwk" as const,
      { kty: jwk.kty, crv: jwk.crv, x: jwk.x, y: jwk.y } as JsonWebKey,
      { name: "ECDSA", namedCurve: "P-256" },
      false,
      ["verify"]
    );
  } catch {
    return null;
  }
}

async function fetchJWKS(uri: string): Promise<Map<string, CryptoKey>> {
  const keys = new Map<string, CryptoKey>();

  let res: Response;
  try {
    res = await fetch(uri, { signal: AbortSignal.timeout(5000) });
  } catch (e) {
    console.warn("[Badge verify] JWKS fetch failed:", e);
    return keys;
  }
  if (!res.ok) {
    console.warn(`[Badge verify] JWKS fetch returned ${res.status}`);
    return keys;
  }

  let data: Record<string, unknown>;
  try {
    data = await res.json() as Record<string, unknown>;
  } catch {
    console.warn("[Badge verify] JWKS response is not valid JSON");
    return keys;
  }

  // Extract signing_keys[] from UCP profile or keys[] from standard JWKS
  const rawKeys = (
    Array.isArray(data.signing_keys) ? data.signing_keys :
    Array.isArray(data.keys) ? data.keys :
    []
  ) as Record<string, unknown>[];

  for (const jwk of rawKeys) {
    if (typeof jwk.kid !== "string" || jwk.kty !== "EC" || jwk.crv !== "P-256") continue;
    const cryptoKey = await importJWK(jwk);
    if (cryptoKey) keys.set(jwk.kid, cryptoKey);
  }

  return keys;
}

async function getCachedKeys(uri: string, cacheTtlMs: number): Promise<Map<string, CryptoKey>> {
  const now = Date.now();
  if (jwksCache && jwksCacheUri === uri && (now - jwksCache.fetchedAt) < cacheTtlMs) {
    return jwksCache.keys;
  }

  const keys = await fetchJWKS(uri);
  if (keys.size > 0) {
    jwksCache = { keys, fetchedAt: now };
    jwksCacheUri = uri;
  }
  return keys;
}

// ── Main ──

const DEFAULT_JWKS_URI = "https://kyalabs.io/.well-known/ucp";
const DEFAULT_CACHE_TTL_MS = 3600000; // 1 hour
const DEFAULT_CLOCK_TOLERANCE_SEC = 30;

export async function verify(
  token: string,
  options?: VerifyOptions
): Promise<BadgeIdentity | null> {
  try {
    if (!token || typeof token !== "string") return null;

    const decoded = decodeJWT(token);
    if (!decoded) return null;

    const { header, payload, signatureBytes, signedPart } = decoded;

    // Extract kid
    const kid = header.kid;
    if (typeof kid !== "string") {
      console.warn("[Badge verify] Token has no kid in header");
      return null;
    }

    // Check alg
    if (header.alg !== "ES256") return null;

    // Get keys
    const jwksUri = options?.jwksUri ?? DEFAULT_JWKS_URI;
    const cacheTtlMs = options?.cacheTtlMs ?? DEFAULT_CACHE_TTL_MS;
    const keys = await getCachedKeys(jwksUri, cacheTtlMs);

    const key = keys.get(kid);
    if (!key) return null;

    // Verify signature
    const signedData = new TextEncoder().encode(signedPart);
    const sigBuf = new ArrayBuffer(signatureBytes.byteLength);
    new Uint8Array(sigBuf).set(signatureBytes);
    const dataBuf = new ArrayBuffer(signedData.byteLength);
    new Uint8Array(dataBuf).set(signedData);
    const valid = await globalThis.crypto.subtle.verify(
      { name: "ECDSA", hash: "SHA-256" },
      key,
      sigBuf,
      dataBuf
    );
    if (!valid) return null;

    // Check expiry
    const clockToleranceSec = options?.clockToleranceSec ?? DEFAULT_CLOCK_TOLERANCE_SEC;
    const now = Math.floor(Date.now() / 1000);
    const exp = payload.exp;
    if (typeof exp === "number" && now > exp + clockToleranceSec) return null;

    // Build identity
    return {
      userId: String(payload.sub ?? ""),
      agentId: String(payload.agent_id ?? payload.agentId ?? ""),
      intent: String(payload.intent ?? ""),
      scopes: Array.isArray(payload.scopes) ? payload.scopes.map(String) : [],
      merchantDomain: typeof payload.merchant_domain === "string" ? payload.merchant_domain : undefined,
      issuedAt: typeof payload.iat === "number" ? payload.iat : 0,
      expiresAt: typeof payload.exp === "number" ? payload.exp : 0,
      kid,
    };
  } catch {
    return null;
  }
}

/**
 * Reset the JWKS cache. Useful for testing.
 * @internal
 */
export function _resetCache(): void {
  jwksCache = null;
  jwksCacheUri = null;
}
