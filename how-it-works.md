# How kyaLabs Works

## What is a UCP Credential Provider?

The [Universal Commerce Protocol (UCP)](https://ucp.dev) defines how AI agents interact with merchants. A credential provider is a service that issues verified identity claims within UCP. Merchants declare which credential providers they recognize in their `/.well-known/ucp` manifest. Agents present matching credentials at checkout.

kyaLabs is a credential provider for agent identity. It proves that the agent operating on a merchant's site is authorized by a real human — not anonymous traffic, not a scraper, not an unattended script.

## What kyaLabs proves

Three things:

1. **The agent is authorized.** A real human granted this specific agent permission to act on their behalf, via Google or Apple sign-in.
2. **The human is verified.** The principal behind the session completed identity verification. The agent inherits that verification — it doesn't generate its own.
3. **The agent is declaring intent.** Every action is a declared trip with a stated purpose. The agent is not hiding what it's doing — it's announcing it.

This is the difference between an authorized actor and a bot. The architecture enforces correct behavior: the agent cannot operate without human consent, and every session is traceable to a verified principal.

## How the flow works

1. A user installs kyaLabs and authorizes their agent via consent key
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
- **No API key.** Verification uses public signing keys fetched from `kyalabs.io/.well-known/ucp`.
- **No integration fee.** The verification algorithm is documented and the [reference implementation](reference/verify.ts) is MIT-licensed.
- **No SDK or package install.** The algorithm is standard JWKS + ES256 — implement it in any server-side language.

## Trust tiers

Merchants can make graduated trust decisions based on the agent's `assurance_level`:

| Level | Verified transactions | Signal |
|-------|----------------------|--------|
| `starter` | < 10 | New user — human authorization confirmed, limited history |
| `regular` | 10–49 | Established — consistent, verified commerce activity |
| `veteran` | 50–199 | Experienced — significant track record |
| `elite` | 200+ | High-trust — extensive verified history |

A `starter` badge still proves human authorization. The tier reflects history, not validity.

---

## Next steps

- [Integration example](examples/integration-example.md) — Add kyaLabs verification to your checkout in 4 steps
- [JSON Schema](schema/io.kyalabs.common.identity.json) — Canonical schema for the `io.kyalabs.common.identity` extension
- [kyalabs.io/merchants](https://kyalabs.io/merchants) — Full merchant documentation
- [kyalabs.io/trust](https://kyalabs.io/trust) — Trust architecture
