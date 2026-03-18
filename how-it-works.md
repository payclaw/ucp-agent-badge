# How kyaLabs Works

## What is a UCP Credential Provider?

The [Universal Commerce Protocol (UCP)](https://ucp.dev) defines how AI agents interact with merchants. A credential provider is a service that issues verified identity claims within UCP. Merchants declare which credential providers they recognize in their `/.well-known/ucp` manifest. Agents present matching credentials at checkout.

kyaLabs is a credential provider for agent identity. It proves that the agent operating on a merchant's site is authorized by a real human — not anonymous traffic, not a scraper, not an unattended script.

## What kyaLabs proves

Three things:

1. **The agent is authorized.** A real human granted this specific agent permission to act on their behalf, via device authorization or API key delegation.
2. **The human is verified.** The principal behind the session completed identity verification (`principal_verified`). The agent inherits that verification — it doesn't generate its own.
3. **The session is scoped.** Every token declares its authorization scopes (e.g. `checkout:complete`) and is bound to a specific session. The agent is not hiding what it's doing — it's announcing it.

This is the difference between an authorized actor and a bot. The architecture enforces correct behavior: the agent cannot operate without human consent, and every session is traceable to a verified principal.

## How the flow works

1. A user authorizes their agent via the device auth flow or API key delegation
2. The agent arrives at a merchant's site and calls `getAgentIdentity`
3. kyaLabs issues an ES256-signed JWT — the agent's declaration of identity
4. The agent presents this token to the merchant at checkout via UCP
5. The merchant verifies the token locally using JWKS — no API dependency on kyaLabs
6. The merchant decides: accept, challenge, or deny — on their terms, not the agent's

The merchant's existing defenses stay intact. kyaLabs is a signal layer — a skeleton key that tells bot detection "this one is declared and verified." It does not override existing defenses. It proves.

## What merchants get

- **Verified agent identity.** Every token maps to a specific agent authorized by a specific human.
- **Human principal accountability.** The human behind the agent is identified and traceable.
- **Audit trail.** Every declared trip is logged — who, what, when, which merchant.
- **Zero kyaLabs uptime dependency.** Verification is local. Signing keys are cached. If kyaLabs goes down, cached keys continue to work.

## What merchants don't need

- **No kyaLabs account.** Merchants verify tokens using published signing keys — no signup, no dashboard, no credentials.
- **No API key.** Verification uses public signing keys fetched from `www.kyalabs.io/.well-known/ucp`.
- **No integration fee.** The verification algorithm is documented and the [reference implementation](reference/verify.ts) is MIT-licensed.
- **No SDK or package install.** The algorithm is standard JWKS + ES256 — implement it in any server-side language.

## Trust signals in the token

Merchants can make graduated trust decisions using claims in the verified JWT:

| Claim | What it tells you |
|-------|-------------------|
| `principal_type` | How the human authenticated — `"mfa_authenticated_human"` (interactive MFA) or `"api_key_delegated"` (API key) |
| `principal_verified` | Whether the principal's email is verified (`true` / `false`) |
| `scopes` | What the agent is authorized to do (e.g. `["checkout:complete"]`) |
| `session_id` | Links multiple requests to the same session for audit |

An `api_key_delegated` badge still proves human authorization. The `principal_type` reflects the auth method, not the trust level.

---

## Next steps

- [Integration example](examples/integration-example.md) — Add kyaLabs verification to your checkout in 4 steps
- [JSON Schema](schema/io.kyalabs.common.identity.json) — Canonical schema for the `io.kyalabs.common.identity` extension
- [kyalabs.io/merchants](https://www.kyalabs.io/merchants) — Full merchant documentation
- [kyalabs.io/trust](https://www.kyalabs.io/trust) — Trust architecture
