# Reference Implementation — Badge JWT Verification

This directory contains a TypeScript reference implementation of the kyaLabs badge verification algorithm. It is **not an npm package** — enterprise merchants should reimplement this algorithm in their server-side language.

---

## Algorithm

The verification flow follows [UCP's credential verification model](https://github.com/Universal-Commerce-Protocol/ucp): local cryptographic verification using published JWKS. No call back to kyaLabs is required.

### Steps

```text
1. Receive JWT token from agent checkout payload
   └─ Field: io.kyalabs.common.identity.token

2. Decode JWT header (base64url → JSON)
   └─ Extract `kid` (Key ID) and verify `alg` is "ES256"

3. Fetch JWKS from https://www.kyalabs.io/.well-known/ucp
   └─ Cache the response (recommended: 1 hour)
   └─ Keys are in the `signing_keys[]` array (UCP format)
   └─ Fallback: standard JWKS `keys[]` array

4. Find the signing key matching `kid`
   └─ Key type: EC, curve: P-256
   └─ Import as a verification-only CryptoKey

5. Verify ES256 signature
   └─ Algorithm: ECDSA with SHA-256
   └─ Signed data: `<header_b64>.<payload_b64>`
   └─ Signature: third segment of the JWT (base64url-decoded)

6. Check token expiry
   └─ Compare `exp` claim against current time
   └─ Allow clock tolerance (recommended: 30 seconds)

7. Extract identity claims from payload
   └─ sub                → userId (tokenized, no PII)
   └─ session_id         → sessionId
   └─ principal_type     → principalType ("mfa_authenticated_human" or "api_key_delegated")
   └─ principal_verified → principalVerified (boolean)
   └─ scopes             → authorization scopes
   └─ merchant_domain    → target merchant (optional)
   └─ iss                → issuer (e.g. "https://kyalabs.io")
   └─ jti                → unique token identifier
   └─ iat, exp           → issued/expires timestamps
```

### Return

On success: identity object with the claims above.
On any failure (invalid signature, expired, missing key, malformed): `null`. Never throws.

---

## Running the Tests

```bash
cd ucp-agent-badge
npm install    # installs vitest (dev dependency only)
npm test       # runs reference/verify.test.ts
```

The test suite generates an ephemeral ES256 key pair, signs JWTs, and verifies them against the reference implementation. It covers: valid tokens, expired tokens, tampered tokens, unknown keys, cache behavior, network failures, and clock tolerance.

---

## Language Portability

The algorithm uses only standard primitives:

| Primitive | TypeScript / Web Crypto | Java | Python | Go |
|-----------|------------------------|------|--------|----|
| Base64url decode | `atob()` + replace | `Base64.getUrlDecoder()` | `base64.urlsafe_b64decode()` | `base64.RawURLEncoding` |
| JSON parse | `JSON.parse()` | `ObjectMapper` | `json.loads()` | `json.Unmarshal()` |
| ECDSA P-256 verify | `crypto.subtle.verify()` | `Signature.getInstance("SHA256withECDSA")` | `cryptography.hazmat` | `ecdsa.VerifyASN1()` |
| HTTP GET (JWKS) | `fetch()` | `HttpClient` | `requests.get()` | `http.Get()` |

Every major platform has libraries for JWKS + ES256 verification. The reference implementation demonstrates the correct algorithm — port it to your stack.

---

## License

MIT — same as the parent repository.
