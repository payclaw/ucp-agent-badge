# Merchant Integration — 4 Steps

Add PayClaw agent verification to your checkout. No PayClaw account, no API key, no integration fee.

---

## 1. Add the manifest

Place the PayClaw capability in your `/.well-known/ucp` manifest:

```json
{
  "ucp": { "version": "2026-01-11" },
  "capabilities": [
    {
      "name": "io.payclaw.common.identity",
      "version": "2026-03-02",
      "extends": "dev.ucp.shopping.checkout",
      "spec": "https://payclaw.io/docs/ucp-identity",
      "schema": "https://payclaw.io/schema/identity"
    }
  ]
}
```

See [merchant-manifest.json](./merchant-manifest.json) for a complete reference manifest.

---

## 2. Install the verification package

```bash
npm install @payclaw/badge
```

Zero runtime dependencies. Works in Node.js 18+ and Cloudflare Workers.

---

## 3. Verify the badge at checkout

```typescript
import { verify } from '@payclaw/badge/verify'

// Token arrives in the checkout payload under io.payclaw.common.identity
const token = req.body['io.payclaw.common.identity']?.token
const identity = await verify(token)
```

`verify()` decodes the JWT locally, fetches signing keys once (cached 1 hour), and verifies the ES256 signature via Web Crypto API. Never throws — returns `null` on any error.

---

## 4. Act on the result

```typescript
if (identity) {
  // Authorized agent — verified human principal behind this session
  console.log(identity.userId)     // Human who authorized the agent
  console.log(identity.agentId)    // Agent identifier
  console.log(identity.intent)     // Declared purchase intent
  console.log(identity.scopes)     // Authorization scopes

  // Your call:
  // - Skip CAPTCHA for verified agents
  // - Apply tier pricing based on assurance_level
  // - Fast-track checkout
  // - Log for audit trail
}

// identity is null → no badge or invalid token
// Proceed as guest — your existing defenses stay intact
```

### Return type: `PayClawIdentity`

| Field | Type | Description |
|-------|------|-------------|
| `userId` | `string` | Human principal who authorized the agent |
| `agentId` | `string` | Agent identifier |
| `intent` | `string` | Declared purchase intent |
| `scopes` | `string[]` | Authorization scopes granted |
| `merchantDomain` | `string?` | Target merchant domain (when declared) |
| `issuedAt` | `number` | Token issued — Unix timestamp |
| `expiresAt` | `number` | Token expires — Unix timestamp |
| `kid` | `string` | Signing key ID |

---

## What you don't need

- **No PayClaw account.** Verification is local — your server checks the JWT signature directly.
- **No API calls to PayClaw.** Signing keys are fetched once and cached. PayClaw uptime is not a dependency.
- **No integration fee.** The verification package is MIT-licensed and free.

---

## Next steps

- [how-it-works.md](../how-it-works.md) — Architecture overview: what a UCP credential provider is and how PayClaw fits
- [JSON Schema](../schema/io.payclaw.common.identity.json) — Canonical schema for the extension
- [payclaw.io/merchants](https://payclaw.io/merchants) — Full merchant documentation
- [payclaw.io/trust](https://payclaw.io/trust) — Trust architecture
