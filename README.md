# PayClaw UCP Extension — `io.payclaw.common.identity`

Agents are not bots. PayClaw proves it.

PayClaw is a [UCP](https://ucp.dev) Credential Provider. We issue signed JWTs ("badges") that prove an AI agent is acting on behalf of an authorized human. Merchants who declare our extension get agent traffic that converts — without weakening bot defenses.

**Extension endpoints are live at `payclaw.io`.**

---

## Why Declare PayClaw

Your bot defenses work. PayClaw makes them smarter.

Agents carrying a PayClaw badge have a verified human principal, declared purchase intent, and trip-level authorization. When you declare `io.payclaw.common.identity`, UCP-compliant agents discover it automatically and present their credential at checkout. You verify it locally in 10 lines — no API call to PayClaw, no uptime dependency.

- **Zero risk to declare.** `required: false` means checkout never blocks. If an agent doesn't have a badge, it proceeds as guest.
- **Graduated trust.** Use `assurance_level` to give badged agents better pricing, skip CAPTCHAs, or fast-track checkout.
- **No new infrastructure.** Add a JSON block to your existing `/.well-known/ucp` manifest. Verify with one npm package or a standard JWKS flow.

---

## How It Works

```
1. Merchant adds io.payclaw.common.identity to /.well-known/ucp
2. Agent reads merchant manifest, discovers PayClaw extension
3. Agent calls payclaw_getAgentIdentity({ merchantUrl })
4. PayClaw checks merchant manifest → returns checkoutPatch
5. Agent merges checkoutPatch into checkout payload
6. Merchant calls verify(token) → gets PayClawIdentity
7. Agent calls payclaw_reportBadgePresented → trip recorded
```

If the manifest fetch fails or the merchant doesn't declare PayClaw, the agent proceeds without a badge. Nothing breaks.

---

## For Merchants: Add PayClaw to Your Manifest

Add this to the `capabilities` object in your `/.well-known/ucp`:

```json
{
  "io.payclaw.common.identity": [
    {
      "version": "2026-01-11",
      "spec": "https://payclaw.io/ucp/spec/identity",
      "schema": "https://payclaw.io/ucp/schemas/identity.json",
      "extends": "dev.ucp.shopping.checkout",
      "config": {
        "required": false
      }
    }
  ]
}
```

### `config.required`

- `required: false` (default) — badged agents are preferred but checkout proceeds without a badge
- `required: true` — agents without a valid badge receive `requires_escalation`, forcing a user handoff through PayClaw's OAuth flow

---

## Merchant Verification

Verify a PayClaw Badge JWT locally — no API call to PayClaw, no uptime dependency.

### Option 1: `verify()` from `@payclaw/badge` (recommended)

```bash
npm install @payclaw/badge
```

```typescript
import { verify } from '@payclaw/badge/verify'
// Also available as: import { verify } from '@payclaw/badge'

// In your checkout handler (createCheckout, updateCheckout, completeCheckout):
const identity = await verify(req.body['io.payclaw.common.identity']?.token)

if (identity) {
  // Verified — log the trip, apply tier pricing, trust the agent
  console.log(identity.userId)         // PayClaw user ID
  console.log(identity.agentId)        // MCP client / agent identifier
  console.log(identity.intent)         // declared purchase intent
  console.log(identity.scopes)         // e.g. ['checkout:complete']
  console.log(identity.merchantDomain) // merchant domain (if scoped)
  console.log(identity.issuedAt)       // Unix timestamp
  console.log(identity.expiresAt)      // Unix timestamp
  console.log(identity.kid)            // Key ID used to sign
}
// if null: no badge or invalid — proceed as guest checkout
```

**Return type:**

```typescript
interface PayClawIdentity {
  userId: string           // PayClaw user ID
  agentId: string          // MCP client / agent identifier
  intent: string           // declared purchase intent
  scopes: string[]         // authorized scopes (e.g. ['checkout:complete'])
  merchantDomain?: string  // merchant domain token was scoped to (if present)
  issuedAt: number         // Unix timestamp
  expiresAt: number        // Unix timestamp
  kid: string              // Key ID used to sign
}
```

`verify()` fetches PayClaw's [JWKS](#signing-keys) once, caches it for 1 hour, and verifies the ES256 signature locally using the Web Crypto API. Never throws — returns `null` on any error.

- **Zero runtime dependencies**
- **Web Crypto API only** — works in Node.js 18+ and Cloudflare Workers
- **JWKS cached in-memory** — never re-fetched on every call

**Options:**

```typescript
verify(token, {
  jwksUri: 'https://payclaw.io/.well-known/ucp',  // default
  cacheTtlMs: 3600000,                              // 1 hour default
  clockToleranceSec: 30,                             // default
})
```

### Option 2: Token introspection (server-side)

```http
POST https://payclaw.io/api/oauth/introspect
Content-Type: application/x-www-form-urlencoded

token=<badge-jwt>
```

Active token response:

```json
{
  "active": true,
  "scope": "ucp:scopes:checkout_session",
  "credential_provider": "io.payclaw.common.identity",
  "badge_status": "declared",
  "assurance_level": "regular",
  "token_type": "Bearer"
}
```

Invalid, expired, or revoked: `{"active": false}` per [RFC 7662](https://www.rfc-editor.org/rfc/rfc7662).

### Python (PyJWT)

```python
import jwt  # PyJWT
from jwt.algorithms import ECAlgorithm
import requests

# Fetch PayClaw's public keys
profile = requests.get("https://payclaw.io/.well-known/ucp").json()
jwks = {k["kid"]: k for k in profile["signing_keys"]}

# Verify
header = jwt.get_unverified_header(token)
jwk = jwks[header["kid"]]
key = ECAlgorithm.from_jwk(jwk)
identity = jwt.decode(token, key, algorithms=["ES256"])
```

---

## Signing Keys

PayClaw signs Badge JWTs using ES256 (ECDSA with P-256 and SHA-256). Public keys are published at:

| Resource | URL |
|----------|-----|
| Platform profile | [`payclaw.io/.well-known/ucp`](https://payclaw.io/.well-known/ucp) — `signing_keys[]` |
| JWKS (RFC 7517) | [`payclaw.io/.well-known/jwks.json`](https://payclaw.io/.well-known/jwks.json) |

Key rotation requires a 24-hour notice period with dual-key support during the transition window. Subscribe to this repo for rotation announcements.

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

## Agent-Side UCP Flow

When an agent calls `payclaw_getAgentIdentity` with a `merchantUrl`, PayClaw fetches the merchant's `/.well-known/ucp` manifest and checks for `io.payclaw.common.identity`.

### UCP-capable merchant

The tool returns a `checkoutPatch` the agent merges directly into the checkout payload:

```json
{
  "ucpCapable": true,
  "requiredByMerchant": false,
  "checkoutPatch": {
    "io.payclaw.common.identity": {
      "token": "eyJhbGciOiJFUzI1NiIs...",
      "kid": "payclaw-badge-v1"
    }
  },
  "instructions": "Merge checkoutPatch into your checkout payload, then call payclaw_reportBadgePresented with the merchantUrl and token."
}
```

### Non-UCP merchant

If the merchant doesn't declare the extension (or the manifest is unreachable), the tool still returns a valid token. Nothing breaks — the agent proceeds without UCP enrichment.

```json
{
  "ucpCapable": false
}
```

### Version compatibility

If the merchant declares `io.payclaw.common.identity` but with an incompatible version, the response includes a warning:

```json
{
  "ucpCapable": false,
  "ucpWarning": "version mismatch: merchant declares 2025-01-01"
}
```

### Recording presentation

After merging `checkoutPatch`, the agent calls `payclaw_reportBadgePresented` with `merchantUrl` and `token`. Returns `{ "recorded": true }` on success.

Idempotency and expired-token handling are enforced server-side.

### Security

- Manifest fetches are **HTTPS-only** with SSRF protection (blocks localhost, private IPs, link-local, metadata endpoints)
- **3-second timeout** — manifest fetch never blocks the tool response
- **5-minute domain cache** — repeated calls to the same merchant don't re-fetch
- Public keys contain **no private key material** — `d` field is never present

---

## What's New (v0.7.6)

| Capability | Description |
|---|---|
| `verify()` export | Merchant-side JWT verification — 10 lines, zero dependencies, Web Crypto only |
| UCP-aware `getAgentIdentity` | Checks merchant manifest, returns `checkoutPatch` when `io.payclaw.common.identity` is declared |
| `reportBadgePresented` | Records trip presentation with structured `{ recorded: true }` response |
| Extension schema live | `payclaw.io/ucp/schemas/identity.json` — agents can now validate namespace governance |
| Spec page live | `payclaw.io/ucp/spec/identity` — human-readable extension documentation |
| Platform profile with signing keys | `payclaw.io/.well-known/ucp` — `signing_keys[]` JWK array for key discovery |
| SSRF protection | Manifest fetcher blocks private/reserved origins |
| OAuth discovery template | `payclaw.io/merchant-templates/oauth-discovery.json` |

---

## Discovery & References

| Resource | URL |
|----------|-----|
| Extension spec | [`payclaw.io/ucp/spec/identity`](https://payclaw.io/ucp/spec/identity) |
| JSON Schema | [`payclaw.io/ucp/schemas/identity.json`](https://payclaw.io/ucp/schemas/identity.json) |
| Platform profile | [`payclaw.io/.well-known/ucp`](https://payclaw.io/.well-known/ucp) |
| JWKS | [`payclaw.io/.well-known/jwks.json`](https://payclaw.io/.well-known/jwks.json) |
| OAuth metadata | [`payclaw.io/.well-known/oauth-authorization-server`](https://payclaw.io/.well-known/oauth-authorization-server) |
| OAuth template | [`payclaw.io/merchant-templates/oauth-discovery.json`](https://payclaw.io/merchant-templates/oauth-discovery.json) |
| UCP specification | [`ucp.dev`](https://ucp.dev) |

---

## For Agents / Developers

This repo is the **merchant-facing protocol spec**. If you're a developer or an agent looking to declare identity:

| | This repo (`ucp-agent-badge`) | `badge-server` | `mcp-server` |
|---|---|---|---|
| **Audience** | Merchants, UCP frameworks | Developers, AI agents | Developers, AI agents |
| **Contains** | Manifest, schema, integration docs | Badge-only MCP server | Badge + Spend MCP server |
| **Install** | Add capability to `/.well-known/ucp` | `npx -y @payclaw/badge` | `npx -y @payclaw/mcp-server` |
| **Repo** | [payclaw/ucp-agent-badge](https://github.com/payclaw/ucp-agent-badge) | [payclaw/badge-server](https://github.com/payclaw/badge-server) | [payclaw/mcp-server](https://github.com/payclaw/mcp-server) |

Users authorize agents at: [payclaw.io/activate](https://payclaw.io/activate)

Full merchant documentation: [payclaw.io/merchants](https://payclaw.io/merchants)

Trust architecture: [payclaw.io/trust](https://payclaw.io/trust)

---

## License

MIT — see [LICENSE](./LICENSE).
