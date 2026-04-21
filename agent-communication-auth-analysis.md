# Agent Communication, Authentication, and Authorization

This document summarizes the current implementation across:

- `ploinky/`
- `AssistOSExplorer/gitAgent/`
- `AssistOSExplorer/dpuAgent/`

The goal is to document how agents talk to each other, how identity is carried between hops, and where authentication and authorization decisions are actually made.

## Scope

Observed components:

- `ploinky` is the runtime, router, and secure-wire issuer/verifier.
- `gitAgent` is a Git MCP agent that also acts as a DPU client for GitHub token storage and retrieval.
- `dpuAgent` is the storage and policy authority for secrets, confidential objects, and audit data.

This document follows code, not older prose. The main implementation points reviewed were:

- `ploinky/cli/server/mcp-proxy/index.js`
- `ploinky/cli/server/mcp-proxy/secureWire.js`
- `ploinky/Agent/lib/invocation-auth.mjs`
- `ploinky/Agent/lib/runtimeWire.mjs`
- `ploinky/Agent/lib/wireSign.mjs`
- `ploinky/Agent/lib/wireVerify.mjs`
- `ploinky/cli/services/docker/agentServiceManager.js`
- `AssistOSExplorer/gitAgent/tools/git_tool.mjs`
- `AssistOSExplorer/gitAgent/lib/secret-store-client.mjs`
- `AssistOSExplorer/gitAgent/lib/github-auth.mjs`
- `AssistOSExplorer/dpuAgent/tools/dpu_tool.mjs`
- `AssistOSExplorer/dpuAgent/lib/dpu-store.mjs`
- `AssistOSExplorer/dpuAgent/lib/dpu-store-internal/identity-acl.mjs`
- `AssistOSExplorer/dpuAgent/lib/dpu-store-internal/permissions-manifest.mjs`
- `AssistOSExplorer/dpuAgent/server/standalone-mcp-server.mjs`

## High-Level Model

The system has three separate trust responsibilities.

1. Ploinky authenticates the human user.
2. Each agent proves its own identity cryptographically.
3. `dpuAgent` makes the final authorization decision for DPU-owned resources.

That split is visible in code:

- Human auth is normalized onto `req.user`, `req.session`, `req.sessionId`, and `req.authMode` by the router auth layer, as described in `ploinky/docs/specs/DS006-auth-capabilities-and-secure-wire.md` and implemented in the router.
- Agent identity is represented by canonical principals such as `agent:AssistOSExplorer/gitAgent` and `agent:AssistOSExplorer/dpuAgent`, derived and injected by the runtime in `ploinky/cli/services/docker/agentServiceManager.js:380-395`.
- DPU authorization is enforced in `AssistOSExplorer/dpuAgent/lib/dpu-store.mjs`, after secure-wire verification has already produced trusted invocation metadata.

## Principals and Identity Sources

The canonical authorization identity for agents is not the short route name. It is the principal form:

- `agent:AssistOSExplorer/gitAgent`
- `agent:AssistOSExplorer/dpuAgent`

This matters because:

- secure-wire audiences are checked against canonical principals
- DPU agent policy is keyed by canonical principals
- public-key lookup for caller assertions is keyed by canonical principals

Runtime injection for each agent includes:

- `PLOINKY_AGENT_PRINCIPAL`
- `PLOINKY_AGENT_PRIVATE_KEY_PATH`
- `PLOINKY_ROUTER_PUBLIC_KEY_JWK`
- `PLOINKY_AGENT_PUBLIC_KEYS_JSON`
- `PLOINKY_ROUTER_URL`
- `PLOINKY_ROUTER_HOST`
- `PLOINKY_ROUTER_PORT`

Observed in `ploinky/cli/services/docker/agentServiceManager.js:371-425`.

For `dpuAgent`, manifest-driven runtime resources also inject:

- `DPU_DATA_ROOT`
- `DPU_WORKSPACE_ROOT`
- `DPU_MASTER_KEY`

Observed in `AssistOSExplorer/dpuAgent/manifest.json:3-14`.

## Communication Surfaces

There are two important MCP surfaces in this flow.

### 1. Router-facing per-agent MCP endpoint

The router exposes:

- `POST /mcps/<agent>/mcp`

This endpoint is handled by `ploinky/cli/server/mcp-proxy/index.js`.

It serves both:

- first-party browser or UI traffic
- delegated agent-to-agent traffic

The router distinguishes the two by headers:

- `x-ploinky-invocation` means router-issued first-party invocation
- `x-ploinky-caller-assertion` plus `x-ploinky-user-context` means delegated agent request

### 2. Provider runtime tool execution boundary

Inside an agent, the verified request is converted into tool metadata and passed to the tool subprocess over stdin. Both `git_tool.mjs` and `dpu_tool.mjs` reconstruct `authInfo` from the verified invocation grant using `authInfoFromInvocation`.

Observed in:

- `ploinky/Agent/lib/invocation-auth.mjs`
- `AssistOSExplorer/gitAgent/tools/git_tool.mjs:246-280`
- `AssistOSExplorer/dpuAgent/tools/dpu_tool.mjs:213-218`

The trusted input is `metadata.invocation`, not arbitrary tool arguments.

## Secure-Wire Artifacts

The current implementation uses three wire artifacts.

### 1. Router invocation token

Header:

- `x-ploinky-invocation`

Purpose:

- represent a first-party routed call from the router to a provider agent

Signing and verification:

- minted by `buildFirstPartyInvocation` in `ploinky/cli/server/mcp-proxy/secureWire.js:124-160`
- verified by provider-side helpers in `ploinky/Agent/lib/runtimeWire.mjs:101-126`

Important claims include:

- `iss = ploinky-router`
- `sub = router:first-party`
- `aud = <provider principal>`
- `tool`
- `scope`
- `body_hash`
- `jti`, `iat`, `exp`
- optional delegated `user`
- optional `user_context_token`

### 2. Caller assertion

Header:

- `x-ploinky-caller-assertion`

Purpose:

- prove which agent is making a delegated call
- bind that identity to a specific tool name, argument body, and scope set

Signing and verification:

- signed by `signCallerAssertion` in `ploinky/Agent/lib/wireSign.mjs:69-123`
- verified by router and provider with `verifyCallerAssertion` in `ploinky/Agent/lib/wireVerify.mjs:167-193`

Important claims include:

- `iss = agent:<repo>/<agent>`
- `aud = <provider principal>` for the direct Git->DPU path
- `tool`
- `scope`
- `body_hash`
- `jti`, `iat`, `exp`
- optional `user_context_token`

### 3. User context token

Header:

- `x-ploinky-user-context`

Purpose:

- carry the authenticated human user identity across a delegated agent call

Signing and verification:

- minted by `issueUserContextToken` in `ploinky/cli/server/mcp-proxy/secureWire.js:54-72`
- verified with `verifyJws` against the router public key in both router-side and provider-side delegated verification paths

Important claims include:

- `iss = ploinky-router`
- `aud = <immediate caller principal>`
- `sid`
- `user = { id/sub, username, email, roles }`
- `jti`, `iat`, `exp`

The audience rule is important. The user context token is minted for the immediate caller agent, not the downstream provider. This prevents one agent from replaying a user token issued for another agent.

## What Ploinky Verifies

### First-party path

For normal browser or UI traffic, the router authenticates the human user and mints a router-signed invocation token for the provider. This is assembled in `ploinky/cli/server/mcp-proxy/index.js:68-105` and `ploinky/cli/server/mcp-proxy/secureWire.js:124-160`.

### Delegated agent path

For agent-to-agent traffic, the router requires a strict shape.

Observed in `ploinky/cli/server/mcp-proxy/index.js:300-366`:

1. Both `x-ploinky-caller-assertion` and `x-ploinky-user-context` must be present.
2. The request must be a direct JSON-RPC `tools/call` request.
3. The router verifies the delegated request with `verifyDelegatedToolCall`.

`verifyDelegatedToolCall` in `ploinky/cli/server/mcp-proxy/secureWire.js:167-217` checks:

- caller assertion signature against the registered public key for `iss`
- caller assertion audience equals the provider principal
- caller assertion `body_hash` matches `{ tool, arguments }`
- caller assertion freshness and replay protection via `jti`, `iat`, `exp`
- forwarded user context token signature against router public key
- forwarded user context token audience equals the caller assertion issuer
- embedded `user_context_token`, if present in the assertion, matches the forwarded header value

If verification succeeds, the router forwards the same headers to the provider. It does not convert them into a weaker trust model.

## What Provider Agents Verify

Provider-side verification happens again locally.

Observed in:

- `ploinky/Agent/lib/runtimeWire.mjs:101-179`
- `AssistOSExplorer/dpuAgent/server/standalone-mcp-server.mjs:56-176`

Providers accept one of two modes:

1. router invocation token via `x-ploinky-invocation`
2. direct delegated pair: `x-ploinky-caller-assertion` plus `x-ploinky-user-context`

The provider verifies the headers and then constructs a normalized invocation payload. That payload is what tools consume through `authInfoFromInvocation`.

This double verification is a real security boundary. Router verification does not remove the provider's obligation to verify the request again.

## Browser -> `gitAgent` Flow

Observed flow:

1. Explorer or another UI sends `tools/call` to `/mcps/gitAgent/mcp`.
2. The router authenticates the human user and attaches `req.user`.
3. The router mints a router-signed invocation token for `gitAgent`.
4. If a user session exists, the router also mints a router-signed user context token with audience `agent:AssistOSExplorer/gitAgent`.
5. `gitAgent` receives the tool call.
6. `git_tool.mjs` extracts the verified grant and reconstructs `authInfo`.

Relevant files:

- `ploinky/cli/server/mcp-proxy/index.js`
- `ploinky/cli/server/mcp-proxy/secureWire.js`
- `AssistOSExplorer/gitAgent/tools/git_tool.mjs`
- `ploinky/Agent/lib/invocation-auth.mjs`

## `gitAgent` -> `dpuAgent` Flow

This is the main live agent-to-agent flow in the analyzed code.

### Why `gitAgent` talks to DPU

`gitAgent` uses DPU for GitHub token persistence and retrieval.

Observed in:

- `AssistOSExplorer/gitAgent/lib/github-auth.mjs`
- `AssistOSExplorer/gitAgent/lib/secret-store-client.mjs`
- `AssistOSExplorer/gitAgent/tools/git_tool.mjs:270-279`

Examples:

- `git_auth_status`
- `git_auth_begin`
- `git_auth_poll`
- `git_auth_disconnect`
- `git_auth_store_token`
- `git_push` and `git_pull` fallback token resolution

### Direct delegated request shape

The active path is deliberately simple.

Observed in `AssistOSExplorer/gitAgent/lib/secret-store-client.mjs:146-229`:

- `gitAgent` sends one direct JSON-RPC `tools/call` POST to `/mcps/dpuAgent/mcp`
- it does not establish an MCP session first
- it does not send `mcp-session-id`
- it does not use a bearer agent token
- it does not rely on capability-binding lookup for this path

The direct request body is:

```json
{
  "jsonrpc": "2.0",
  "id": "<uuid>",
  "method": "tools/call",
  "params": {
    "name": "secret_get",
    "arguments": {
      "key": "GIT_GITHUB_TOKEN"
    }
  }
}
```

### How `gitAgent` authenticates that delegated call

Observed in `AssistOSExplorer/gitAgent/lib/secret-store-client.mjs:153-207`:

1. Resolve router URL from `PLOINKY_ROUTER_URL` or host/port fallback.
2. Resolve the caller principal from `PLOINKY_AGENT_PRINCIPAL`.
3. Resolve the provider principal, defaulting to `agent:AssistOSExplorer/dpuAgent`.
4. Load `gitAgent`'s private key from env, explicit path, or workspace key file.
5. Require a delegated user context token.
6. Sign a caller assertion for the exact DPU operation and arguments.
7. Send both headers:
   - `x-ploinky-caller-assertion`
   - `x-ploinky-user-context`

The delegated user context token is sourced from:

- `authInfo.invocation.userContextToken`
- or `PLOINKY_USER_CONTEXT_TOKEN`

If no delegated user context token is available, the client throws `secret-store-client: missing delegated user context token.`

### Scope mapping used by `gitAgent`

Observed in `AssistOSExplorer/gitAgent/lib/secret-store-client.mjs:129-144`:

| DPU operation | Scope in caller assertion |
| --- | --- |
| `secret_get` | `secret:read` |
| `secret_list` | `secret:read` |
| `secret_put` | `secret:write` |
| `secret_delete` | `secret:write` |
| `secret_grant` | `secret:grant` |
| `secret_revoke` | `secret:revoke` |

## DPU Authentication and Authorization Model

`dpuAgent` is the final authority for its own resources.

The main layers are:

1. secure-wire verification
2. invocation-scope enforcement
3. authenticated actor resolution
4. resource ACL and ownership enforcement
5. agent-policy enforcement for agent principals
6. audit-role enforcement for audit-only surfaces

### 1. Invocation-scope enforcement

Observed in `AssistOSExplorer/dpuAgent/lib/dpu-store.mjs:58-90`.

`dpuAgent` maps operations to required invocation scopes in `OPERATION_SCOPE_MAP` and rejects requests whose verified invocation scope does not allow the operation.

Examples:

- `secret_get` requires `secret:read`
- `secret_put` requires `secret:write`
- `secret_grant` requires `secret:grant` or `secret:write`
- `secret_revoke` requires `secret:revoke` or `secret:write`
- `secret_list` requires `secret:access` or `secret:read`

This is contract-level authorization. It limits what a delegated agent can do even before resource ACLs are checked.

### 2. Authenticated actor resolution

Observed in:

- `AssistOSExplorer/dpuAgent/lib/dpu-store-internal/identity-acl.mjs:107-141`
- `AssistOSExplorer/dpuAgent/lib/dpu-store-internal/permissions-manifest.mjs:278-318`

`resolveActor` builds the effective actor from verified `authInfo`. Priority is roughly:

- manifest-resolved principal if available
- email
- `user:<id>`
- `user:<username>`
- `sso:<subject>`
- agent principal

The resolved actor carries:

- `principalId`
- `email`
- `username`
- `id`
- `ssoSubject`
- `agentPrincipalId`
- `roles`
- `authenticated`

This means DPU can authorize based on the delegated human user, the calling agent principal, or both, depending on ACL entries and manifest aliases.

### 3. Secret and confidential ACLs

Observed in:

- `AssistOSExplorer/dpuAgent/lib/dpu-store.mjs`
- `AssistOSExplorer/dpuAgent/lib/dpu-store-internal/identity-acl.mjs`

Secret role order:

- `access`
- `write-access`
- `read`
- `write`

Confidential role order:

- `access`
- `read`
- `comment`
- `write`

Important nuance from `secretRoleAllows` in `identity-acl.mjs:39-52`:

- `write-access` can write
- `write-access` cannot read plaintext

That means owners and delegated actors may be allowed to update or manage a secret without automatically being allowed to see its plaintext value.

### 4. Agent-policy enforcement

Observed in `AssistOSExplorer/dpuAgent/lib/dpu-store-internal/permissions-manifest.mjs:187-213` and referenced by DPU store logic.

When a secret role is granted to an `agent:` principal, DPU enforces policy from `permissions.manifest.json` under:

- `agentPolicies[<principalId>].secrets.allowedRoles`

This means:

- DPU controls agent role ceilings
- manifests are not the final authority for what secret role an agent may receive
- if no DPU policy exists for an agent principal, the grant can be rejected

### 5. Audit-role restrictions

Observed in `AssistOSExplorer/dpuAgent/lib/dpu-store.mjs:92-158`.

Audit access is restricted to:

- local `admin`
- users with role `admin`
- users with role `security`

This applies to:

- `dpu_audit_config_get`
- `dpu_audit_config_set`
- `dpu_audit_list`
- `dpu_audit_get`
- visibility of `/Confidential/Audit`

## Storage Ownership

Storage ownership is intentionally centralized in DPU.

Observed in `AssistOSExplorer/dpuAgent/lib/dpu-store-internal/storage.mjs` and the DPU manifest/runtime setup:

- `gitAgent` never owns persisted secret storage
- `gitAgent` only requests operations
- `dpuAgent` owns storage, encryption, ACL manifest, audit files, and agent policies

Main DPU storage artifacts are:

- `state.json`
- `permissions.manifest.json`
- `secrets.json`
- `blobs/`
- `audit/`

The DPU tests also confirm that:

- confidential content is encrypted at rest
- secret values are encrypted at rest
- plaintext legacy storage is rejected
- delegated reads require the proper invocation scope

Observed in `AssistOSExplorer/dpuAgent/tests/dpu-store.test.mjs`.

## What Is Not the Active Model

A few older or broader concepts still exist in the repo, but they are not the main live Git-to-DPU trust path.

### 1. Capability binding is not the active Git->DPU control plane

Ploinky still has a general capability registry and binding model, but the active `gitAgent -> dpuAgent` secret-store path is direct.

Observed in practice:

- `gitAgent` directly targets the DPU route and principal in `secret-store-client.mjs`
- it signs its own delegated request
- DPU authorizes using secure-wire verification plus DPU ACL/policy

### 2. Bearer-style agent auth is not the active model

The current secure-wire model is based on signed requests. Older bearer-token style agent auth is not the active mechanism for this path.

### 3. MCP session setup is not used for Git->DPU secret operations

The delegated Git->DPU path is a direct one-shot JSON-RPC `tools/call` request without MCP session initialization.

## End-to-End Summary

### Browser/UI -> `gitAgent`

1. Human user authenticates to the router.
2. Router attaches normalized user/session context.
3. Router mints a signed invocation token for `gitAgent`.
4. `gitAgent` verifies the token and reconstructs trusted `authInfo`.

### `gitAgent` -> `dpuAgent`

1. `gitAgent` decides it needs secret storage.
2. It reuses the router-issued delegated user context token from the original invocation.
3. It signs a fresh caller assertion for the exact DPU operation and arguments.
4. It posts directly to `/mcps/dpuAgent/mcp` with caller assertion and user context headers.
5. The router verifies that delegated request.
6. `dpuAgent` verifies the same request again locally.
7. `dpuAgent` applies scope checks, actor resolution, ACLs, and DPU-owned policy.
8. `dpuAgent` returns the result.

## Final Conclusions

The current implementation can be summarized as follows.

1. Ploinky authenticates human users and issues the signed context that starts the chain.
2. Agents authenticate themselves with Ed25519 caller assertions.
3. Delegated human identity is carried with a router-signed user context token whose audience is the immediate caller agent.
4. The router verifies delegated agent calls before forwarding them.
5. Provider agents verify the same secure-wire artifacts again locally.
6. `gitAgent` is a client of DPU, not a secret owner.
7. `dpuAgent` is the final authority for secret, confidential, and audit authorization decisions.
8. Agent role ceilings for secrets are controlled by DPU policy, not by the caller agent.
