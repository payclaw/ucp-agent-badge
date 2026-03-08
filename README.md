# PayClaw UCP Extension — `io.payclaw.common.identity`

PayClaw is a UCP Credential Provider. We issue OAuth 2.0 access tokens ("badges") that prove an AI agent is acting on behalf of an authorized human. Merchants who declare our extension bypass bot-mitigation for badged agents.

This repo contains the canonical manifest and integration documentation for the `io.payclaw.common.identity` extension to the [Universal Commerce Protocol](https://ucp.dev).

### Repository Contents

| File | Description |
|------|-------------|
| [`manifest.json`](manifest.json) | Canonical UCP manifest for the PayClaw identity extension |
| [`schema/io.payclaw.common.identity.json`](schema/io.payclaw.common.identity.json) | JSON Schema (Draft 2020-12) for the extension payload |
| [`examples/merchant-manifest.json`](examples/merchant-manifest.json) | Reference manifest a merchant places at `/.well-known/ucp` |
| [`examples/integration-example.md`](examples/integration-example.md) | 4-step integration walkthrough with code |
| [`how-it-works.md`](how-it-works.md) | Architecture overview — what a UCP credential provider is, how PayClaw fits |

---

## For Merchants: Add PayClaw to Your UCP Manifest for User Verification

Add this to the `capabilities` array in your `/.well-known/ucp`:

```json
{
  "name": "io.payclaw.common.identity",
  "version": "2026-03-02",
  "extends": "dev.ucp.shopping.checkout",
  "spec": "https://payclaw.io/docs/ucp-identity",
  "schema": "https://payclaw.io/schema/identity"
}
```

That's it. Agents visiting your store will discover PayClaw and prompt their users to authorize if they haven't already.

### What Happens Next

1. A UCP-compliant agent reads your `/.well-known/ucp` manifest
2. It sees `io.payclaw.common.identity` in the capabilities
3. If the agent has a PayClaw badge, it includes an `identity_declaration` in its checkout request
4. If it doesn't, it prompts the user: *"This store verifies user-authorized agents. Run `npx -y @payclaw/mcp-server` to authorize me to continue."*
   -  (See [payclaw/badge-server](https://github.com/payclaw/badge-server) for more detail) 

### `config.required`

```json
{
  "name": "io.payclaw.common.identity",
  "version": "2026-03-02",
  "extends": "dev.ucp.shopping.checkout",
  "spec": "https://payclaw.io/docs/ucp-identity",
  "schema": "https://payclaw.io/schema/identity",
  "config": {
    "required": false
  }
}
```

- `required: false` (default) — declared agents are preferred but checkout proceeds without a badge
- `required: true` — agents without a valid badge receive `requires_escalation`, forcing a user handoff through PayClaw's OAuth flow

---

## How Verification Works

When an agent presents a PayClaw badge at checkout, verify it with one HTTP call. No API key. No PayClaw account required.

```http
POST https://payclaw.io/api/oauth/introspect
Content-Type: application/x-www-form-urlencoded

token=pc_v1_...
```

### Active token

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

### Invalid, expired, or revoked token

```json
{
  "active": false
}
```

Per [RFC 7662](https://www.rfc-editor.org/rfc/rfc7662): the response for invalid, expired, revoked, and unknown tokens is always `{"active": false}`. No additional fields. No information leakage.

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
    "credential_provider": "io.payclaw.common.identity",
    "badge_status": "declared"
  }
}
```

`badge_status: declared` means the agent presented a valid PayClaw consent key. A verified human principal authorized the session via Google or Apple sign-in.

---

## OAuth Discovery

Merchants discover the introspection endpoint automatically via standard OAuth metadata:

| Resource | URL |
|----------|-----|
| OAuth metadata | [`payclaw.io/.well-known/oauth-authorization-server`](https://payclaw.io/.well-known/oauth-authorization-server) |
| JSON Schema | [`payclaw.io/schema/identity`](https://payclaw.io/schema/identity) |
| Extension docs | [`payclaw.io/docs/ucp-identity`](https://payclaw.io/docs/ucp-identity) |
| UCP manifest | [`payclaw.io/.well-known/ucp`](https://payclaw.io/.well-known/ucp) |
| UCP specification | [`ucp.dev`](https://ucp.dev) |

---

## For Agents / Developers

This repo is the **merchant-facing protocol spec**. If you're a developer or an agent looking to declare identity, see [payclaw/badge-server](https://github.com/payclaw/badge-server) — the MCP server that agents use to badge themselves.

| | This repo (`ucp-agent-badge`) | `badge-server` |
|---|---|---|
| **Audience** | Merchants, UCP frameworks | Developers, AI agents |
| **Contains** | Manifest, schema, integration docs | MCP server, OAuth device flow |
| **Install** | Add capability to `/.well-known/ucp` | `npx -y @payclaw/mcp-server` |

Users authorize agents at: [payclaw.io/activate](https://payclaw.io/activate)

Full merchant documentation: [payclaw.io/merchants](https://payclaw.io/merchants)

Trust architecture: [payclaw.io/trust](https://payclaw.io/trust)

---

## License

MIT — see [LICENSE](./LICENSE).
