# kyaLabs UCP Extension — `io.kyalabs.common.identity`

kyaLabs is a UCP Credential Provider. We issue ES256-signed JWTs ("badges") that prove an AI agent is acting on behalf of an authorized human. Merchants who declare our extension can verify badged agents at checkout using standard cryptographic verification — no API call to kyaLabs required.

This repo contains the canonical manifest, schema, and reference implementation for the `io.kyalabs.common.identity` extension to the [Universal Commerce Protocol](https://ucp.dev).

### Repository Contents

| File | Description |
|------|-------------|
| [`manifest.json`](manifest.json) | Canonical UCP manifest for the kyaLabs identity extension |
| [`schema/io.kyalabs.common.identity.json`](schema/io.kyalabs.common.identity.json) | JSON Schema (Draft 2020-12) for the extension payload |
| [`reference/verify.ts`](reference/verify.ts) | Reference implementation — badge JWT verification (TypeScript) |
| [`reference/verify.test.ts`](reference/verify.test.ts) | Test suite for the reference implementation |
| [`examples/merchant-manifest.json`](examples/merchant-manifest.json) | Reference manifest a merchant places at `/.well-known/ucp` |
| [`examples/integration-example.md`](examples/integration-example.md) | Integration walkthrough with verification steps |
| [`how-it-works.md`](how-it-works.md) | Architecture overview — what a UCP credential provider is, how kyaLabs fits |

---

## For Merchants: Add kyaLabs to Your UCP Manifest

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

That's it. Agents visiting your store will discover kyaLabs and present a cryptographic badge when they have one.

> **Not on UCP yet?** See [Google's UCP Getting Started Guide](https://developers.google.com/merchant/ucp) to set up your merchant manifest.

> **Shopify merchants:** Your store already serves `/.well-known/ucp` — Shopify ships UCP natively. Add the capability block above to your store's UCP capabilities.

### What Happens Next

1. A UCP-compliant agent reads your `/.well-known/ucp` manifest
2. It sees `io.kyalabs.common.identity` in the capabilities
3. If the agent has a kyaLabs badge, it includes an `identity_declaration` in its checkout request
4. You verify the token locally using the algorithm below

### `config.required`

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

- `required: false` (default) — declared agents are preferred but checkout proceeds without a badge
- `required: true` — agents without a valid badge receive `requires_escalation`, forcing a user handoff through kyaLabs's OAuth flow
- `auth_endpoint` — the device authorization endpoint agents use to obtain a badge token

---

## How Verification Works

Per [UCP's credential verification model](https://github.com/Universal-Commerce-Protocol/ucp), badges are verified locally using published signing keys. No API call to kyaLabs is required at verification time.

### Verification Algorithm

```
1. Receive the token from the checkout payload
   └─ Field: io.kyalabs.common.identity.token

2. Decode the JWT header (base64url → JSON)
   └─ Extract `kid` (Key ID)
   └─ Verify `alg` is "ES256"

3. Fetch signing keys from https://www.kyalabs.io/.well-known/ucp
   └─ Keys are in the `signing_keys[]` array (UCP profile format)
   └─ Cache the response — recommended TTL: 1 hour

4. Find the key matching `kid`
   └─ Key type: EC, curve: P-256

5. Verify ES256 (ECDSA P-256 + SHA-256) signature
   └─ Signed data: <header_b64>.<payload_b64>
   └─ Signature: third JWT segment (base64url-decoded)

6. Check the `exp` claim
   └─ Reject if expired (allow ~30s clock tolerance)

7. Extract identity claims from the JWT payload
```

A TypeScript reference implementation is provided at [`reference/verify.ts`](reference/verify.ts). Implement this algorithm in your server-side language — libraries for JWKS + ES256 exist on every major platform.

### Verified Identity Claims

| Claim | Type | Description |
|-------|------|-------------|
| `sub` | `string` | Tokenized user ID (HMAC hash — no PII) |
| `merchant_domain` | `string?` | Target merchant domain (when declared) |
| `session_id` | `string?` | Session identifier |
| `principal_type` | `string` | Auth method — `"mfa_authenticated_human"` or `"api_key_delegated"` |
| `principal_verified` | `boolean` | Whether the principal's email is verified |
| `scopes` | `string[]` | Authorization scopes (e.g. `["checkout:complete"]`) |
| `iss` | `string` | Token issuer (e.g. `"https://kyalabs.io"`) |
| `iat` | `number` | Token issued — Unix timestamp |
| `exp` | `number` | Token expires — Unix timestamp |
| `jti` | `string` | Unique token identifier |

### On failure

Any verification failure — invalid signature, expired token, unknown key, malformed JWT — should return no identity. Proceed as guest. Your existing defenses stay intact.

---

## Alternative: HTTP Introspect (RFC 7662)

For merchants who prefer server-side token lookup over local JWT verification, kyaLabs also exposes an [RFC 7662](https://www.rfc-editor.org/rfc/rfc7662) introspection endpoint. No API key required.

```http
POST https://www.kyalabs.io/api/oauth/introspect
Content-Type: application/x-www-form-urlencoded

token=pc_v1_...
```

### Active token

```json
{
  "active": true,
  "scope": "ucp:scopes:checkout_session",
  "credential_provider": "io.kyalabs.common.identity",
  "badge_status": "declared",
  "assurance_level": "regular",
  "token_type": "Bearer"
}
```

### Invalid, expired, or revoked token

```json
{
  "active": false
}
```

Per RFC 7662: the response for invalid, expired, revoked, and unknown tokens is always `{"active": false}`. No information leakage.

> **Note:** Local JWKS verification (above) is recommended for production checkout flows. It has no network dependency on kyaLabs and aligns with UCP's cryptographic verification model. HTTP introspect is useful for real-time revocation checks or environments where local JWT verification is impractical.

---

## Trust Levels (`assurance_level`)

| Level | Meaning |
|---------|---------------------------------------|
| `starter` | New user, fewer than 10 verified transactions |
| `regular` | 10–49 verified transactions |
| `veteran` | 50–199 verified transactions |
| `elite` | 200+ verified transactions |

Merchants can use `assurance_level` to make graduated trust decisions. A `starter` badge still proves human authorization — it just has less transaction history.

---

## What Agents Present at Checkout

A declared agent includes this payload in its UCP checkout request:

```json
{
  "identity_declaration": {
    "credential_provider": "io.kyalabs.common.identity",
    "badge_status": "declared"
  }
}
```

`badge_status: declared` means the agent presented a valid kyaLabs consent key. A verified human principal authorized the session via Google or Apple sign-in.

---

## OAuth Discovery

Merchants discover signing keys and metadata automatically via standard endpoints:

| Resource | URL |
|----------|-----|
| Signing keys (JWKS) | [`www.kyalabs.io/.well-known/ucp`](https://www.kyalabs.io/.well-known/ucp) |
| OAuth metadata | [`www.kyalabs.io/.well-known/oauth-authorization-server`](https://www.kyalabs.io/.well-known/oauth-authorization-server) |
| JSON Schema | [`www.kyalabs.io/ucp/schemas/identity.json`](https://www.kyalabs.io/ucp/schemas/identity.json) |
| Extension spec | [`www.kyalabs.io/ucp/spec/identity`](https://www.kyalabs.io/ucp/spec/identity) |
| UCP specification | [`ucp.dev`](https://ucp.dev) |

---

## For Agents / Developers

The agent-facing protocol reference is at [kyalabs.io/ucp/spec/identity](https://www.kyalabs.io/ucp/spec/identity) — it covers how agents discover, obtain, and present badge tokens.

If you're building an agent or developer tool that needs to present a kyaLabs badge, see [kyalabs/badge-server](https://github.com/kyalabs/badge-server) — the MCP server that agents use to badge themselves.

| | This repo (`ucp-agent-badge`) | `badge-server` |
|---|---|---|
| **Audience** | Merchants, UCP frameworks | Developers, AI agents |
| **Contains** | Manifest, schema, reference implementation | MCP server, OAuth device flow |
| **Integration** | Add capability to `/.well-known/ucp`, implement verification | `npx -y @kyalabs/badge` |

Users authorize agents at: [kyalabs.io/activate](https://www.kyalabs.io/activate)

Full merchant documentation: [kyalabs.io/merchants](https://www.kyalabs.io/merchants)

Trust architecture: [kyalabs.io/trust](https://www.kyalabs.io/trust)

---

## License

MIT — see [LICENSE](./LICENSE).
