# PayClaw UCP Extension — `io.payclaw.common.identity`

PayClaw is a UCP Credential Provider. We issue OAuth 2.0 access tokens ("badges") that prove an AI agent is acting on behalf of an authorized human. Merchants who declare our extension bypass bot-mitigation for badged agents.

This repo contains the canonical manifest and integration documentation for the `io.payclaw.common.identity` extension to the [Universal Commerce Protocol](https://ucp.dev).

---

## For Merchants: Add PayClaw to Your UCP Manifest

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

That's it. Agents visiting your store will discover PayClaw and prompt their users to authorize if they haven't already.

### What Happens Next

1. A UCP-compliant agent reads your `/.well-known/ucp` manifest
2. It sees `io.payclaw.common.identity` in the capabilities
3. If the agent has a PayClaw badge, it includes an `io.payclaw.common.identity` object in its checkout request
4. If it doesn't, it prompts the user: *"This store verifies user-authorized agents. Run `npx -y @payclaw/badge` to authorize me to continue."*

### `config.required`

- `required: false` (default) — declared agents are preferred but checkout proceeds without a badge
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

// In your checkout handler (createCheckout, updateCheckout, completeCheckout):
const identity = await verify(req.body['io.payclaw.common.identity']?.token)

if (identity) {
  // Verified — log the trip, apply tier pricing, trust the agent
  console.log(identity.userId, identity.agentId, identity.intent)
  console.log(identity.scopes)       // e.g. ['checkout:complete']
  console.log(identity.issuedAt)     // Unix timestamp
  console.log(identity.expiresAt)    // Unix timestamp
  console.log(identity.kid)          // Key ID used to sign
}
// if null: no badge or invalid — proceed as guest checkout
```

`verify()` fetches PayClaw's [JWKS](#signing-keys) once, caches it for 1 hour, and verifies the ES256 signature locally using the Web Crypto API. It never throws — returns `null` on any error.

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

### Python (conceptual)

```python
import jwt  # PyJWT
import requests

# Fetch PayClaw's public keys
profile = requests.get("https://payclaw.io/.well-known/ucp").json()
jwks = {k["kid"]: k for k in profile["signing_keys"]}

# Verify
header = jwt.get_unverified_header(token)
key = jwks[header["kid"]]
identity = jwt.decode(token, key, algorithms=["ES256"])
```

---

## Signing Keys

PayClaw signs Badge JWTs using ES256 (ECDSA with P-256 and SHA-256). Public keys are published at:

| Resource | URL |
|----------|-----|
| Platform profile | [`payclaw.io/.well-known/ucp`](https://payclaw.io/.well-known/ucp) → `signing_keys[]` |
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

This repo is the **merchant-facing protocol spec**. If you're a developer or an agent looking to declare identity, see [payclaw/badge-server](https://github.com/payclaw/badge-server) — the MCP server that agents use to badge themselves.

| | This repo (`ucp-agent-badge`) | `badge-server` |
|---|---|---|
| **Audience** | Merchants, UCP frameworks | Developers, AI agents |
| **Contains** | Manifest, schema, integration docs | MCP server, OAuth device flow |
| **Install** | Add capability to `/.well-known/ucp` | `npx -y @payclaw/badge` |

Users authorize agents at: [payclaw.io/activate](https://payclaw.io/activate)

Full merchant documentation: [payclaw.io/merchants](https://payclaw.io/merchants)

Trust architecture: [payclaw.io/trust](https://payclaw.io/trust)

---

## License

MIT — see [LICENSE](./LICENSE).
