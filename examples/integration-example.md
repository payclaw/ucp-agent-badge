# Merchant Integration — 4 Steps

Add kyaLabs agent verification to your checkout. No kyaLabs account, no API key, no integration fee.

---

## 1. Add the capability

Add this to the `capabilities` object in your `/.well-known/ucp`:

```json
"io.kyalabs.common.identity": [
  {
    "version": "2026-01-11",
    "extends": "dev.ucp.shopping.checkout",
    "spec": "https://www.kyalabs.io/ucp/spec/identity",
    "schema": "https://www.kyalabs.io/ucp/schemas/identity.json",
    "config": {
      "required": false,
      "auth_endpoint": "https://www.kyalabs.io/api/oauth/device/authorize"
    }
  }
]
```

See [merchant-manifest.json](./merchant-manifest.json) for a complete reference profile.

---

## 2. Implement badge verification

When an agent submits a checkout request, the kyaLabs badge arrives as an ES256-signed JWT in the `io.kyalabs.common.identity` field. Verify it locally using your signing key infrastructure.

### Algorithm

```text
1. Extract the token from the checkout payload
   └─ req.body['io.kyalabs.common.identity'].token

2. Decode the JWT header (base64url → JSON)
   └─ Extract `kid` (Key ID)
   └─ Verify `alg` is "ES256"

3. Fetch signing keys: GET https://www.kyalabs.io/.well-known/ucp
   └─ Keys are in the `signing_keys[]` array
   └─ Cache the response (recommended: 1 hour TTL)

4. Find the public key matching `kid`
   └─ Key type: EC, curve: P-256

5. Verify ES256 (ECDSA P-256 + SHA-256) signature
   └─ Signed data: <header_b64>.<payload_b64>
   └─ Signature: third JWT segment, base64url-decoded

6. Check the `exp` claim against current time
   └─ Allow ~30 seconds of clock tolerance
```

A complete TypeScript reference implementation is provided at [`../reference/verify.ts`](../reference/verify.ts). Every major platform has libraries for JWKS + ES256 — implement the algorithm in your server-side language.

---

## 3. Extract identity from the payload

On successful verification, the JWT payload contains these claims:

```json
{
  "sub": "user-123",
  "session_id": "sess-abc",
  "principal_type": "mfa_authenticated_human",
  "principal_verified": true,
  "scopes": ["checkout:complete"],
  "merchant_domain": "store.com",
  "iss": "https://kyalabs.io",
  "jti": "tok-xyz-001",
  "iat": 1741651200,
  "exp": 1741654800
}
```

### Claim reference

| Claim | Type | Description |
|-------|------|-------------|
| `sub` | `string` | Tokenized user ID (HMAC hash, no PII) |
| `session_id` | `string?` | Session identifier |
| `principal_type` | `string` | Auth method: `"mfa_authenticated_human"` or `"api_key_delegated"` |
| `principal_verified` | `boolean` | Whether the principal's email is verified |
| `scopes` | `string[]` | Authorization scopes granted (e.g. `["checkout:complete"]`) |
| `merchant_domain` | `string?` | Target merchant domain (when declared) |
| `iss` | `string` | Token issuer (e.g. `"https://kyalabs.io"`) |
| `jti` | `string` | Unique token identifier |
| `iat` | `number` | Token issued — Unix timestamp |
| `exp` | `number` | Token expires — Unix timestamp |

The `kid` (Key ID) is in the JWT header, not the payload.

---

## 4. Act on the result

```text
IF verification succeeds:
  • Authorized agent — verified human principal behind this session
  • Skip CAPTCHA for verified agents
  • Apply graduated trust based on principal_type
  • Fast-track checkout
  • Log for audit trail

IF verification fails (invalid signature, expired, unknown key):
  • No badge or invalid token
  • Proceed as guest — your existing defenses stay intact
```

---

## What you don't need

- **No kyaLabs account.** Verification is local — your server checks the JWT signature against published keys.
- **No per-request API calls to kyaLabs.** Signing keys are fetched once and cached. kyaLabs uptime is not required for request handling.
- **No integration fee.** The verification algorithm is documented and the reference implementation is MIT-licensed.
- **No SDK or package install.** Implement the standard JWKS + ES256 verification in your existing stack.

---

## Next steps

- [Reference implementation](../reference/verify.ts) — TypeScript verification code with full test suite
- [how-it-works.md](../how-it-works.md) — Architecture overview: what a UCP credential provider is and how kyaLabs fits
- [JSON Schema](../schema/io.kyalabs.common.identity.json) — Canonical schema for the extension
- [kyalabs.io/merchants](https://www.kyalabs.io/merchants) — Full merchant documentation
- [kyalabs.io/trust](https://www.kyalabs.io/trust) — Trust architecture
