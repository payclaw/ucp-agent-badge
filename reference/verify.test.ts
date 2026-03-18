import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from "vitest";
import { verify, _resetCache, type BadgeIdentity } from "./verify.js";

// ── Key pair generation ──

let privateKey: CryptoKey;
let publicJWK: Record<string, unknown>;
const KID = "test-key-v1";

beforeAll(async () => {
  const pair = await globalThis.crypto.subtle.generateKey(
    { name: "ECDSA", namedCurve: "P-256" },
    true,
    ["sign", "verify"]
  );
  privateKey = pair.privateKey;
  const pubExported = await globalThis.crypto.subtle.exportKey("jwk", pair.publicKey);
  publicJWK = { ...pubExported, kid: KID, use: "sig", alg: "ES256" };
});

// ── JWT helpers ──

function base64urlEncode(data: Uint8Array | string): string {
  const bytes = typeof data === "string" ? new TextEncoder().encode(data) : data;
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function signJWT(
  payload: Record<string, unknown>,
  options?: { kid?: string; alg?: string }
): Promise<string> {
  const header = { alg: options?.alg ?? "ES256", typ: "JWT", kid: options?.kid ?? KID };
  const headerB64 = base64urlEncode(JSON.stringify(header));
  const payloadB64 = base64urlEncode(JSON.stringify(payload));
  const signedPart = `${headerB64}.${payloadB64}`;

  const data = new TextEncoder().encode(signedPart);
  const dataBuf = new ArrayBuffer(data.byteLength);
  new Uint8Array(dataBuf).set(data);
  const sig = await globalThis.crypto.subtle.sign(
    { name: "ECDSA", hash: "SHA-256" },
    privateKey,
    dataBuf
  );
  const sigB64 = base64urlEncode(new Uint8Array(sig));
  return `${signedPart}.${sigB64}`;
}

function validPayload(overrides?: Record<string, unknown>) {
  const now = Math.floor(Date.now() / 1000);
  return {
    sub: "user-123",
    session_id: "sess-abc",
    principal_type: "mfa_authenticated_human",
    principal_verified: true,
    scopes: ["checkout:complete"],
    merchant_domain: "starbucks.com",
    iss: "https://kyalabs.io",
    jti: "tok-xyz-001",
    iat: now - 60,
    exp: now + 300,
    ...overrides,
  };
}

// ── Mock fetch ──

function mockFetchJWKS() {
  return vi.spyOn(globalThis, "fetch").mockResolvedValue(
    new Response(
      JSON.stringify({ signing_keys: [publicJWK] }),
      { status: 200 }
    )
  );
}

// ── Tests ──

describe("verify()", () => {
  beforeEach(() => {
    _resetCache();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("verifies a valid token and returns BadgeIdentity", async () => {
    const fetchMock = mockFetchJWKS();
    const token = await signJWT(validPayload());
    const result = await verify(token, { jwksUri: "https://test.local/.well-known/ucp" });

    expect(result).not.toBeNull();
    const identity = result as BadgeIdentity;
    expect(identity.userId).toBe("user-123");
    expect(identity.sessionId).toBe("sess-abc");
    expect(identity.principalType).toBe("mfa_authenticated_human");
    expect(identity.principalVerified).toBe(true);
    expect(identity.scopes).toEqual(["checkout:complete"]);
    expect(identity.merchantDomain).toBe("starbucks.com");
    expect(identity.issuer).toBe("https://kyalabs.io");
    expect(identity.jti).toBe("tok-xyz-001");
    expect(identity.kid).toBe(KID);
    expect(identity.issuedAt).toBeGreaterThan(0);
    expect(identity.expiresAt).toBeGreaterThan(0);
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it("returns null for expired token", async () => {
    mockFetchJWKS();
    const token = await signJWT(validPayload({ exp: Math.floor(Date.now() / 1000) - 120 }));
    const result = await verify(token, { jwksUri: "https://test.local/.well-known/ucp" });
    expect(result).toBeNull();
  });

  it("returns null for tampered token", async () => {
    mockFetchJWKS();
    const token = await signJWT(validPayload());
    // Tamper with the payload (change sub) but keep original signature
    const parts = token.split(".");
    const tamperedPayload = base64urlEncode(JSON.stringify({ ...validPayload(), sub: "hacker" }));
    const tampered = `${parts[0]}.${tamperedPayload}.${parts[2]}`;
    const result = await verify(tampered, { jwksUri: "https://test.local/.well-known/ucp" });
    expect(result).toBeNull();
  });

  it("returns null for unknown kid", async () => {
    mockFetchJWKS();
    const token = await signJWT(validPayload(), { kid: "unknown-kid" });
    const result = await verify(token, { jwksUri: "https://test.local/.well-known/ucp" });
    expect(result).toBeNull();
  });

  it("returns null for undefined input", async () => {
    const result = await verify(undefined as unknown as string);
    expect(result).toBeNull();
  });

  it("returns null for empty string input", async () => {
    const result = await verify("");
    expect(result).toBeNull();
  });

  it("returns null for malformed JWT (not 3 segments)", async () => {
    mockFetchJWKS();
    const result = await verify("not.a.valid.jwt.token", { jwksUri: "https://test.local/.well-known/ucp" });
    expect(result).toBeNull();
  });

  it("returns null for malformed JWT (2 segments)", async () => {
    const result = await verify("header.payload");
    expect(result).toBeNull();
  });

  it("caches JWKS — does not re-fetch on second call", async () => {
    const fetchMock = mockFetchJWKS();
    const token1 = await signJWT(validPayload());
    const token2 = await signJWT(validPayload({ sub: "user-789" }));

    await verify(token1, { jwksUri: "https://test.local/.well-known/ucp" });
    await verify(token2, { jwksUri: "https://test.local/.well-known/ucp" });

    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it("re-fetches JWKS after cache expires", async () => {
    const fetchMock = mockFetchJWKS();
    const token = await signJWT(validPayload());

    // First call with very short TTL
    await verify(token, { jwksUri: "https://test.local/.well-known/ucp", cacheTtlMs: 1 });

    // Wait for cache to expire
    await new Promise((r) => setTimeout(r, 10));

    await verify(token, { jwksUri: "https://test.local/.well-known/ucp", cacheTtlMs: 1 });

    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("returns null when JWKS endpoint is unreachable", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("network error"));
    const token = await signJWT(validPayload());
    const result = await verify(token, { jwksUri: "https://test.local/.well-known/ucp" });
    expect(result).toBeNull();
  });

  it("returns null for token with no kid in header", async () => {
    mockFetchJWKS();
    // Build a JWT manually without kid
    const header = { alg: "ES256", typ: "JWT" };
    const payload = validPayload();
    const headerB64 = base64urlEncode(JSON.stringify(header));
    const payloadB64 = base64urlEncode(JSON.stringify(payload));
    const signedPart = `${headerB64}.${payloadB64}`;
    const data = new TextEncoder().encode(signedPart);
    const dataBuf = new ArrayBuffer(data.byteLength);
    new Uint8Array(dataBuf).set(data);
    const sig = await globalThis.crypto.subtle.sign(
      { name: "ECDSA", hash: "SHA-256" },
      privateKey,
      dataBuf
    );
    const token = `${signedPart}.${base64urlEncode(new Uint8Array(sig))}`;

    const result = await verify(token, { jwksUri: "https://test.local/.well-known/ucp" });
    expect(result).toBeNull();
  });

  it("respects clockToleranceSec for recently expired tokens", async () => {
    mockFetchJWKS();
    // Token expired 10 seconds ago, tolerance is 30
    const token = await signJWT(validPayload({ exp: Math.floor(Date.now() / 1000) - 10 }));
    const result = await verify(token, {
      jwksUri: "https://test.local/.well-known/ucp",
      clockToleranceSec: 30,
    });
    expect(result).not.toBeNull();
  });

  it("returns identity with merchantDomain when present", async () => {
    mockFetchJWKS();
    const token = await signJWT(validPayload({ merchant_domain: "example.com" }));
    const result = await verify(token, { jwksUri: "https://test.local/.well-known/ucp" });
    expect(result?.merchantDomain).toBe("example.com");
  });

  it("returns identity without merchantDomain when absent", async () => {
    mockFetchJWKS();
    const { merchant_domain: _, ...payloadNoMerchant } = validPayload();
    const token = await signJWT(payloadNoMerchant);
    const result = await verify(token, { jwksUri: "https://test.local/.well-known/ucp" });
    expect(result?.merchantDomain).toBeUndefined();
  });
});
