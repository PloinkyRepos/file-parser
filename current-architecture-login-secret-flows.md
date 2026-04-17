# Current Architecture, Login, and Secret Flows

This document describes the current runtime architecture in the workspace after the capability-registry, secure-wire, and pluggable-SSO refactors, with emphasis on:

1. how Ploinky routes and authenticates requests
2. how `gitAgent` talks to `dpuAgent`
3. how GitHub login metadata, token storage, and token retrieval work today

It documents the code as it exists now, including current migration shims and remaining coupling points.

## 1. Runtime Architecture

### 1.1 Main components

| Component | Responsibility |
| --- | --- |
| `ploinky/cli` | Workspace runtime, capability registry, agent launchers, router, auth handlers |
| `ploinky/Agent` | Shared agent runtime, MCP server, secure-wire verification |
| `AssistOSExplorer/gitAgent` | Git operations, GitHub device flow, secret-store consumer |
| `AssistOSExplorer/dpuAgent` | Secret/confidential storage provider |
| `basic/keycloak` | `auth-provider/v1` implementation for SSO |

### 1.2 Capability-driven wiring

The current architecture uses manifest-declared contracts rather than hardcoded provider names for the normal `gitAgent -> secret store` path.

- Consumers declare `requires.<alias>`
- Providers declare `provides["<contract>"]`
- Workspace bindings pin a consumer alias to a concrete provider in `.ploinky/agents.json`
- Ploinky normalizes and resolves those declarations in `ploinky/cli/services/capabilityRegistry.js`

Current examples:

- `AssistOSExplorer/gitAgent/manifest.json`
  - `requires.secretStore.contract = "secret-store/v1"`
  - `requires.secretStore.maxScopes = ["secret:read", "secret:write"]`
- `AssistOSExplorer/dpuAgent/manifest.json`
  - `provides["secret-store/v1"]`
  - operations: `secret_get`, `secret_put`, `secret_delete`, `secret_grant`, `secret_revoke`, `secret_list`

### 1.3 Launcher-injected runtime data

When Ploinky starts an agent, the launcher injects:

- `PLOINKY_AGENT_PRINCIPAL`
- `PLOINKY_AGENT_PRIVATE_KEY_PATH`
- `PLOINKY_ROUTER_PUBLIC_KEY_JWK`
- `PLOINKY_ROUTER_URL`
- `PLOINKY_CAPABILITY_BINDINGS_JSON` for consumers
- `PLOINKY_PROVIDER_BINDINGS_JSON` for providers

This is what allows:

- consumer agents to discover their bound provider without hardcoding it
- consumer agents to sign caller assertions
- provider agents to verify router-issued invocation tokens
- provider agents to validate that a delegated binding is really registered for them

### 1.4 Request path

At a high level, the current request path is:

```text
Browser/UI
  -> RoutingServer
  -> authHandlers / auth service
  -> MCP proxy
  -> secure-wire minting
  -> AgentServer in target agent
  -> tool wrapper
  -> domain logic
```

For delegated agent-to-agent capability calls, the path is:

```text
Browser/UI
  -> router
  -> gitAgent
  -> router
  -> dpuAgent
```

The second hop is not a direct container-to-container trust relationship. It is router-mediated.

## 2. Authentication Architecture

### 2.1 Supported modes

The router currently supports three effective modes:

| Mode | What it does |
| --- | --- |
| `none` | auth endpoints disabled |
| `local` | local username/password login managed inside Ploinky |
| `sso` | external login delegated to a bound `auth-provider/v1` agent |

The mode is resolved in `ploinky/cli/server/authHandlers.js`.

### 2.2 Local login flow

Local login is handled entirely inside Ploinky core.

Flow:

1. Browser requests `GET /auth/login`
2. `authHandlers.js` renders the local login page
3. Browser submits `POST /auth/login`
4. `authenticateLocalUser()` in `ploinky/cli/server/auth/localService.js` validates credentials
5. Ploinky creates a local session and sets the `ploinky_local` cookie
6. Future requests resolve `req.user`, `req.session`, and `req.sessionId` from that cookie

### 2.3 SSO login flow

SSO is provider-neutral in core and provider-specific in the bound agent runtime.

Current provider path:

- workspace binding: `workspace:sso -> auth-provider/v1`
- first implementation: `basic/keycloak/runtime/index.mjs`

Core responsibilities:

- route handling in `authHandlers.js`
- session store and cookie issuance
- pending browser-auth state in `genericAuthBridge.js`
- session refresh and logout orchestration

Provider responsibilities:

- auth URL construction
- PKCE and nonce
- OIDC discovery
- token exchange
- JWKS fetch and JWT verification
- provider-specific claim parsing such as Keycloak role extraction

### 2.4 SSO sequence

```mermaid
sequenceDiagram
    participant Browser
    participant Router as Ploinky Router
    participant Bridge as genericAuthBridge
    participant Provider as basic/keycloak runtime
    participant KC as Keycloak

    Browser->>Router: GET /auth/login
    Router->>Bridge: beginLogin(returnTo, baseUrl)
    Bridge->>Provider: sso_begin_login(redirectUri, prompt)
    Provider->>KC: OIDC auth URL construction
    Provider-->>Bridge: authorizationUrl + providerState
    Bridge-->>Browser: HTML that redirects to provider login
    Browser->>KC: authenticate
    KC-->>Browser: redirect to /auth/callback?code=...&state=...
    Browser->>Router: GET /auth/callback
    Router->>Bridge: handleCallback(code, state)
    Bridge->>Provider: sso_handle_callback(query, providerState)
    Provider->>KC: token exchange + ID/access token verification
    Provider-->>Bridge: normalized user + opaque providerSession
    Bridge-->>Router: sessionId + user + redirectTo
    Router-->>Browser: Set-Cookie: ploinky_sso=...
```

### 2.5 User context propagation after login

Once the browser has a valid session:

- `authHandlers.js` resolves the session
- `req.user` contains the normalized user
- `req.sessionId` contains the workspace session id

When the router later sends first-party or delegated capability calls to agents, it can mint a short-lived `user_context_token` signed by the router. That token represents the authenticated browser user and is what lets downstream providers see which human initiated the action.

## 3. Secure Wire Architecture

### 3.1 Core idea

The wire is split into:

1. caller assertion: signed by the calling agent
2. invocation token: signed by the router

This is implemented primarily in:

- `ploinky/Agent/lib/wireSign.mjs`
- `ploinky/Agent/lib/wireVerify.mjs`
- `ploinky/cli/server/mcp-proxy/secureWire.js`
- `ploinky/Agent/server/AgentServer.mjs`

### 3.2 Delegated call flow

For delegated capability calls such as `gitAgent -> dpuAgent`:

1. `gitAgent` signs a caller assertion with its private key
2. the assertion is sent to the router in `x-ploinky-caller-assertion`
3. the router verifies:
   - signature
   - audience
   - TTL
   - body hash
   - replay protection
4. the router resolves the live capability binding from the registry
5. the router intersects:
   - caller-requested scopes
   - consumer `maxScopes`
   - binding-approved scopes
   - provider-supported scopes
6. the router mints `x-ploinky-invocation`
7. the provider `AgentServer` verifies the invocation token before exposing it to the tool

### 3.3 Provider-side verification

`ploinky/Agent/server/AgentServer.mjs` verifies the router token against:

- router public key
- expected audience = this agent principal
- TTL
- body hash
- replay cache

If verification succeeds, the invocation metadata is made available to the tool wrapper.

### 3.4 Current migration shim

The router still has a migration shim for legacy consumers/providers:

- it may still emit `x-ploinky-auth-info`
- it may still populate `_meta.auth`

That compatibility path remains unless `PLOINKY_SECURE_WIRE_STRICT` is enabled.

Important: the secure path is already the real trust source. The legacy blob is transitional.

## 4. Current Secret-Store Architecture

### 4.1 Contract boundary

The contract boundary is:

- consumer alias in `gitAgent`: `secretStore`
- contract name: `secret-store/v1`

`gitAgent` uses `AssistOSExplorer/gitAgent/lib/secret-store-client.mjs` as its contract client.

That client:

- reads `PLOINKY_CAPABILITY_BINDINGS_JSON`
- resolves the provider route from the live binding
- signs caller assertions
- forwards `user_context_token` when available
- calls only generic operations:
  - `secret_get`
  - `secret_put`
  - `secret_delete`
  - `secret_grant`
  - `secret_revoke`
  - `secret_list`

### 4.2 Provider implementation

`dpuAgent` implements `secret-store/v1`.

Provider-side path:

1. `AgentServer` verifies the router invocation token
2. `AssistOSExplorer/dpuAgent/tools/dpu_tool.mjs` extracts invocation metadata
3. `dpu_tool.mjs` builds `authInfo`
4. `AssistOSExplorer/dpuAgent/lib/dpu-store.mjs` enforces:
   - invocation scope
   - provider binding allowlist
   - secret ACL rules

### 4.3 DPU persistence model

`dpuAgent` splits secret data into:

- metadata in `state.json`
- ACLs in `permissions.manifest.json`
- actual secret values in `secrets.json`

`secrets.json` is encrypted with AES-256-GCM using a key derived from `DPU_MASTER_KEY`.

Important distinction:

- `state.json` knows that a secret exists and who owns it
- `permissions.manifest.json` knows who is allowed to access it
- `secrets.json` contains the encrypted values

## 5. GitHub Login Metadata vs GitHub Token Storage

The current GitHub auth implementation in `gitAgent` intentionally separates:

1. UI-visible GitHub connection metadata
2. the actual access token

### 5.1 Metadata stored locally by gitAgent

File:

- `.ploinky/state/git-agent-github-auth.json`

This file contains:

- device-flow pending state
- connection source
- GitHub login/name/email/avatar/profile URL
- scope
- timestamps

It does not store the GitHub access token.

### 5.2 Access token stored in DPU

The real token is stored as a DPU secret under:

- key: `GIT_GITHUB_TOKEN`

Helpers:

- `getStoredGitToken()`
- `putStoredGitToken()`
- `deleteStoredGitToken()`

These are thin wrappers on top of the generic secret-store client.

## 6. Secret Storage Flow

This is the current flow when a user completes GitHub device flow in the Explorer Git modal and `gitAgent` stores the token.

### 6.1 Sequence

```mermaid
sequenceDiagram
    participant Browser
    participant Router
    participant Git as gitAgent
    participant GH as GitHub
    participant DPU as dpuAgent

    Browser->>Router: MCP call -> git_auth_begin / git_auth_poll
    Router->>Git: first-party invocation
    Git->>GH: device flow token exchange
    Git->>GH: /user and /user/emails
    Git->>Router: secret_put + caller assertion
    Router->>Router: verify assertion + resolve binding/scopes
    Router->>DPU: secret_put + router invocation token
    DPU->>DPU: verify invocation, ACL, binding, scope
    DPU-->>Router: secret stored
    Router-->>Git: success
    Git->>Router: secret_grant(agent:gitAgent, read) best-effort
    Router->>DPU: delegated grant call
    DPU-->>Router: grant stored
    Router-->>Git: success
    Git-->>Browser: connected + tokenStored
```

### 6.2 Detailed steps

1. The browser triggers GitHub auth through the Git modal.
2. `gitAgent/lib/github-auth.mjs` completes device-flow polling and receives the GitHub access token.
3. `github-auth.mjs` fetches:
   - `https://api.github.com/user`
   - `https://api.github.com/user/emails`
4. `github-auth.mjs` writes connection metadata to `.ploinky/state/git-agent-github-auth.json`.
5. `github-auth.mjs` calls `putStoredGitToken({ token, authInfo })`.
6. `putStoredGitToken()` calls `secret_put("GIT_GITHUB_TOKEN", token)` through `secret-store-client.mjs`.
7. `secret-store-client.mjs`:
   - resolves the bound provider from `PLOINKY_CAPABILITY_BINDINGS_JSON`
   - signs a caller assertion with `gitAgent`’s private key
   - includes the forwarded `user_context_token` when present
   - sends the request to `/mcps/<provider>/mcp`
8. The router verifies the caller assertion and resolves the live `secretStore` binding.
9. The router mints a router-signed invocation token scoped to `secret_put`.
10. `dpuAgent` verifies the invocation token in `AgentServer`.
11. `dpu_tool.mjs` reconstructs `authInfo` from the invocation.
12. `dpu-store.mjs` enforces:
    - `secret:write` scope
    - provider binding membership
    - secret ACL rules
13. `putSecret()` writes:
    - secret metadata to `state.json`
    - encrypted secret value to `secrets.json`
14. `putStoredGitToken()` then performs a best-effort `secret_grant(key, agent:gitAgent, read)`.

### 6.3 Ownership and ACL semantics

The important ACL point is:

- the effective actor normally resolves to the delegated human user
- `agentPrincipalId` is still present in the auth context

So today the secret is typically owned by the user principal, not by `gitAgent`.

The extra `secret_grant(..., agent:gitAgent, read)` call records an explicit agent grant in addition to the user-owned secret. This is currently allowed because DPU still checks the grantee agent manifest for an allowlist:

- `gitAgent/manifest.json -> capabilities.dpu.allowedRoles = ["read"]`

That field is still a live DPU-specific coupling point.

## 7. Secret Retrieval Flow

This is the current flow when `gitAgent` needs the stored GitHub token again.

### 7.1 Typical callers

Common examples:

- `git_auth_status`
- future GitHub-backed git pull/push flows
- any operation inside `gitAgent` that needs the stored token

### 7.2 Sequence

```mermaid
sequenceDiagram
    participant Browser
    participant Router
    participant Git as gitAgent
    participant DPU as dpuAgent

    Browser->>Router: MCP call -> gitAgent tool
    Router->>Git: first-party invocation
    Git->>Router: secret_get + caller assertion
    Router->>Router: verify assertion + resolve binding/scopes
    Router->>DPU: secret_get + router invocation token
    DPU->>DPU: verify invocation, binding, scope, ACL
    DPU-->>Router: secret value
    Router-->>Git: secret value
    Git-->>Browser: result using token
```

### 7.3 Detailed steps

1. A browser-initiated request reaches `gitAgent`.
2. `gitAgent` calls `getStoredGitToken({ authInfo })`.
3. `getStoredGitToken()` calls `secret_get("GIT_GITHUB_TOKEN")` through the generic secret-store client.
4. `gitAgent` signs a caller assertion with:
   - issuer = `agent:gitAgent`
   - alias = `secretStore`
   - tool = `secret_get`
   - scope = `secret:read`
5. The router verifies that assertion and resolves the live binding for `gitAgent:secretStore`.
6. The router verifies that the requested scope is allowed by:
   - `gitAgent.requires.secretStore.maxScopes`
   - binding-approved scopes
   - `dpuAgent.provides["secret-store/v1"].supportedScopes`
7. The router mints the provider-facing invocation token.
8. `dpuAgent` verifies the invocation token and reconstructs:
   - caller agent principal
   - delegated user
   - binding id
   - contract
   - scope
   - forwarded `user_context_token`
9. `dpu-store.getSecretByKey()` enforces:
   - invocation scope
   - provider binding membership
   - ACL access to the secret
10. DPU reads the encrypted `secrets.json`, decrypts it with the derived secret-map key, and returns the requested value.
11. `gitAgent` uses the token but does not persist it locally in its own workspace files.

## 8. Important Current Nuances

### 8.1 `requires` is part of the communication path

`gitAgent.manifest.json -> requires.secretStore` is not optional in the current design. It is how:

- the capability registry validates the alias
- the launcher injects the resolved binding
- the router enforces the consumer’s declared max scopes

Without `requires.secretStore`, the provider-neutral `gitAgent -> dpuAgent` path would break.

### 8.2 `capabilities.dpu.allowedRoles` is still live

`gitAgent.manifest.json -> capabilities.dpu.allowedRoles` is not needed to route the call, but it is still used by DPU during `secret_grant` validation.

So today:

- `requires` is architecture-critical for communication
- `capabilities.dpu.allowedRoles` is a remaining DPU-specific grant-policy hook

### 8.3 Provider binding enforcement is launch-time injected

Providers validate delegated bindings against `PLOINKY_PROVIDER_BINDINGS_JSON`.

That means:

- the provider has its own defensive allowlist
- but the allowlist is refreshed on restart, not dynamically in-process

### 8.4 First-party and delegated calls coexist

There are two router-issued invocation styles:

- first-party: browser/core -> provider directly
- delegated: browser/core -> consumer agent -> provider agent

The GitHub token storage/retrieval path is delegated on the second hop.

### 8.5 Legacy auth compatibility still exists

The system still carries transitional support for:

- `x-ploinky-auth-info`
- `_meta.auth`

The secure wire is already the intended trust path, but the compatibility shim is still present unless strict mode is enabled.

## 9. Short Summary

The current architecture is:

- capability-driven at the consumer/provider boundary
- router-mediated for all trusted inter-agent calls
- provider-neutral for SSO in core
- DPU-backed for GitHub token storage

The current GitHub token handling is:

- GitHub profile metadata in `gitAgent` local state
- actual access token in DPU encrypted secret storage
- token writes and reads performed through the generic `secret-store/v1` client
- all delegated calls protected by caller assertions, router-minted invocation tokens, scope checks, and provider-side binding validation

The two notable current leftovers are:

- the legacy auth compatibility shim
- the DPU-specific `capabilities.dpu.allowedRoles` grant-policy check in `gitAgent`’s manifest
