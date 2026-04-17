# Ploinky Capability, Secure Wire, and Pluggable SSO Refactor

## Summary

Refactor Ploinky so that:

- core depends on manifest-declared capabilities and runtime resources, not on concrete agent names such as `dpuAgent`, `gitAgent`, `keycloak`, or `postgres`
- consumer agents call shared capability clients, not provider-specific routes, headers, or MCP tool names
- every routed capability call is integrity-protected, scoped, replay-resistant, and tied to a verified caller and delegated user context
- SSO is implemented by a provider agent behind a generic `auth-provider/v1` contract
- when SSO is disabled, the current dev-only web-token auth and local auth behavior remain unchanged

This plan intentionally merges the strong concrete parts of the reviewed proposal with a few corrections:

- `gitAgent` must not keep a DPU-specific client module if invariant 1 is strict
- provider agents must trust router-issued invocation grants, not mutable forwarded auth blobs
- core must keep browser pending-auth state, while provider agents keep protocol-specific OIDC state opaque to core
- provider policy, binding policy, and invocation scope must all participate in authorization; `requires.*` alone is not enough

## Current Violations To Eliminate

- Ploinky core special-cases `dpuAgent` in `ploinky/cli/services/docker/agentServiceManager.js` for private storage and DPU env injection.
- `gitAgent` directly resolves the `dpuAgent` route and sends a forged `x-ploinky-auth-info` header in `AssistOSExplorer/gitAgent/lib/dpu-secret-client.mjs`.
- DPU standalone MCP accepts forwarded auth context at face value in `AssistOSExplorer/dpuAgent/server/standalone-mcp-server.mjs`.
- Ploinky SSO logic is Keycloak-shaped in `ploinky/cli/services/sso.js`, `ploinky/cli/server/auth/service.js`, `ploinky/cli/server/auth/config.js`, and `ploinky/cli/server/auth/keycloakClient.js`.
- Keycloak dependency gating exists in `ploinky/cli/services/workspaceDependencyGraph.js` and `ploinky/cli/services/bootstrapManifest.js`.

## Design Decisions

### 1. Capability-Driven Core

Agent manifests gain uniform `provides`, `requires`, and `runtime.resources` sections.

- `provides` declares callable capability contracts implemented by an agent.
- `requires` declares consumer-side capability dependencies and the maximum scopes that the consumer is allowed to request.
- `runtime.resources` declares storage, env, and other launch-time needs. Runtime resources are not capabilities.

Ploinky core adds a capability registry and binding model:

- registry indexes installed agents by provided contract
- bindings connect a consumer requirement alias to a concrete provider agent
- runtime launchers consume only manifest-declared runtime resources
- no runtime or auth code branches on `dpuAgent`, `gitAgent`, `keycloak`, `postgres`, or provider-specific filesystem paths

### 2. Shared Capability Contracts

Two contracts are introduced first:

- `secret-store/v1`
- `auth-provider/v1`

`dpuAgent` becomes one provider implementation of `secret-store/v1`.

The existing `basic/keycloak` agent becomes the initial provider implementation of `auth-provider/v1`.

`gitAgent` uses a shared `SecretStoreClient` from Ploinky runtime code. It does not:

- load `.ploinky/routing.json`
- hardcode `dpuAgent`
- construct `x-ploinky-auth-info`
- call `dpu_secret_*` directly

Provider-specific MCP tool names may remain behind a provider adapter during migration, but consumers must use only the contract client.

### 3. Secure Routed Invocation Model

All capability calls that cross agent boundaries go through the router. Direct consumer-to-provider host-port calls are no longer a supported trust path.

The secure flow has three artifacts:

1. `user_context_token`
   - issued by core from an authenticated workspace session
   - short-lived JWS signed by the router session-signing key
   - contains normalized delegated user context:
     - `sub`
     - `email`
     - `username`
     - `roles`
     - `sid`
     - `iat`
     - `exp`
     - `delegation_chain`
   - agents may forward this token to the router, but providers must never trust it on its own

2. `caller_assertion`
   - signed by the caller agent with its Ed25519 private key
   - presented to the router when requesting a delegated capability call
   - proves caller identity and prevents one agent from impersonating another at the router boundary

3. `invocation_token`
   - minted by the router per routed request
   - signed by the router
   - this is the only token a provider trusts for authorization
   - payload includes:
     - `iss = ploinky-router`
     - `sub = caller agent principal` or `router:first-party`
     - `aud = provider agent principal`
     - `workspace_id`
     - `binding_id`
     - `contract`
     - `scope`
     - `tool`
     - `body_hash`
     - `jti`
     - `iat`
     - `exp`
     - normalized delegated user claims copied from the verified `user_context_token`

This gives two caller modes without a router super-user ambiguity:

- first-party routed call: browser or core route handler -> router mints `invocation_token` with `sub = router:first-party`
- delegated agent call: agent -> router with `caller_assertion` and optional `user_context_token` -> router mints `invocation_token` with `sub = caller agent principal`

### 4. Provider Verification Rules

Every provider runtime verifies, in order:

1. token signature with router public key
2. `aud` equals self
3. `iat` / `exp` valid and max lifetime <= 120 seconds
4. `jti` not already used within TTL window
5. `body_hash` matches canonical request body
6. `binding_id` resolves to a live workspace binding for this caller, provider, and contract
7. `tool` is allowed by the contract and by provider operation policy
8. `scope` is a subset of:
   - consumer manifest `requires.<alias>.maxScopes`
   - binding-approved scopes
   - provider-supported scopes
9. if delegated user context exists, provider domain logic applies its own ACL checks against that normalized actor

Provider runtimes ignore `_meta.auth` and `x-ploinky-auth-info` for authorization once secure mode is enabled. During migration they may accept them only as deprecated compatibility input, never as a preferred trust mechanism.

### 5. Secret Authorization Model

The DPU secret provider enforces three distinct policies:

- consumer requested maximum scopes from its manifest
- workspace binding approved scopes
- provider-side grant rules for the target grantee agent

Grant-time validation remains in DPU:

- when granting to an agent principal, DPU validates the grantee agent's provider-side max roles from manifest policy

Call-time validation is added:

- DPU verifies invocation scope and binding on every request
- DPU does not treat `requires.secrets.roles` as the sole source of truth

This closes the current gap where a consumer could drift out of policy after a grant exists.

### 6. SSO As A Provider Agent

Core keeps:

- `/auth/login`, `/auth/callback`, `/auth/logout`, `/auth/check`
- cookie issuance
- workspace session store
- dev-only web-token auth
- local auth fallback
- browser pending-auth state

Provider agents own:

- OIDC discovery
- auth URL construction
- PKCE and nonce internals
- code-for-token exchange
- JWKS resolution and JWT verification
- provider-specific claims extraction
- provider-specific logout and refresh behavior

The bridge contract is:

- `sso_begin_login({ redirectUri, prompt }) -> { authorizationUrl, providerState, expiresAt }`
- `sso_handle_callback({ redirectUri, query, providerState }) -> { user, providerSession }`
- `sso_validate_session({ providerSession }) -> { user, providerSession }`
- `sso_refresh_session({ providerSession }) -> { user, providerSession }`
- `sso_logout({ providerSession, postLogoutRedirectUri }) -> { redirectUrl }`

Core stores a pending browser-auth record containing:

- provider agent name
- opaque `providerState`
- `returnTo`
- created-at / expiry

Core never parses Keycloak-specific fields such as realms, `realm_access.roles`, `resource_access`, or Keycloak URL shapes.

## Concrete Contracts

### Manifest Shape

```json
{
  "provides": {
    "secret-store/v1": {
      "operations": ["secret_get", "secret_put", "secret_grant", "secret_revoke", "secret_list"],
      "supportedScopes": ["secret:access", "secret:read", "secret:write", "secret:grant", "secret:revoke"]
    }
  },
  "requires": {
    "secretStore": {
      "contract": "secret-store/v1",
      "maxScopes": ["secret:read"]
    }
  },
  "runtime": {
    "resources": {
      "persistentStorage": {
        "key": "dpu-data",
        "containerPath": "/dpu-data"
      }
    }
  }
}
```

Examples:

- `dpuAgent`
  - `provides["secret-store/v1"]`
  - `runtime.resources.persistentStorage`
- `gitAgent`
  - `requires.secretStore = { contract: "secret-store/v1", maxScopes: ["secret:read"] }`
- `basic/keycloak`
  - `provides["auth-provider/v1"]`

### Workspace Binding Shape

```json
{
  "capabilityBindings": {
    "gitAgent:secretStore": {
      "provider": "dpuAgent",
      "contract": "secret-store/v1",
      "approvedScopes": ["secret:read"]
    },
    "workspace:sso": {
      "provider": "basic/keycloak",
      "contract": "auth-provider/v1"
    }
  }
}
```

## Critical File Changes

### Core Runtime

- `ploinky/cli/services/capabilityRegistry.js`
  - new
  - index `provides`, validate `requires`, resolve bindings

- `ploinky/cli/services/agentKeystore.js`
  - new
  - create, load, rotate Ed25519 keypairs
  - persist public keys in workspace registry

- `ploinky/cli/services/docker/agentServiceManager.js`
  - remove `if (agentName === 'dpuAgent')`
  - consume `manifest.runtime.resources.*`

- `ploinky/cli/services/bwrap/bwrapServiceManager.js`
  - remove provider-specific `/opt/keycloak/data` assumptions
  - use normalized runtime resource metadata instead

- `ploinky/cli/services/workspaceDependencyGraph.js`
  - remove `keycloak` name gating
  - gate optional auth-provider dependencies by capability presence, not provider name

- `ploinky/cli/services/bootstrapManifest.js`
  - same change as dependency graph

### Router and Auth

- `ploinky/cli/server/mcp-proxy/index.js`
  - replace `x-ploinky-auth-info` forwarding with router-issued `invocation_token`
  - ignore `_meta.auth` as a trust input

- `ploinky/cli/server/auth/genericAuthBridge.js`
  - new
  - map `/auth/*` routes to the bound `auth-provider/v1` agent

- `ploinky/cli/server/auth/service.js`
  - keep session-store integration and bridge orchestration
  - remove Keycloak-specific discovery, JWKS, claim parsing, and role extraction

- `ploinky/cli/server/auth/keycloakClient.js`
  - move provider-specific logic into the existing `basic/keycloak` agent runtime surface

- `ploinky/cli/services/sso.js`
  - replace Keycloak env-key handling with provider-neutral SSO binding config
  - persist only `{ enabled, providerAgent }`

- `ploinky/cli/services/status.js`
  - show bound SSO provider generically
  - no realm/client/Keycloak-specific formatting in core

### Shared Agent Runtime

- `ploinky/Agent/lib/toolEnvelope.mjs`
  - new
  - shared parse/normalize/write helpers for tool wrappers

- `ploinky/Agent/lib/wireSign.mjs`
  - new
  - caller assertion signing

- `ploinky/Agent/lib/wireVerify.mjs`
  - new
  - router invocation verification, replay protection, request-hash validation

- `ploinky/Agent/server/AgentServer.mjs`
  - verify `invocation_token` before exposing caller context to tools
  - deprecate `x-ploinky-auth-info`

### DPU

- `AssistOSExplorer/dpuAgent/manifest.json`
  - add `provides["secret-store/v1"]`
  - move persistent storage declaration under `runtime.resources`

- `AssistOSExplorer/dpuAgent/server/standalone-mcp-server.mjs`
  - replace `parseAuthInfo` with shared wire verification
  - accept legacy auth header only during migration window

- `AssistOSExplorer/dpuAgent/lib/dpu-store.mjs`
  - keep grant-time agent policy validation
  - add per-call invocation scope and binding enforcement

### Git Agent

- `AssistOSExplorer/gitAgent/lib/dpu-secret-client.mjs`
  - delete

- `AssistOSExplorer/gitAgent/lib/secret-store-client.mjs`
  - new
  - generic capability client using router-mediated calls only

- `AssistOSExplorer/gitAgent/manifest.json`
  - replace DPU-specific capability declarations with `requires.secretStore`

### SSO Provider Agent

- `basic/keycloak/`
  - extend the existing agent so it also exposes `auth-provider/v1`
  - owns OIDC discovery, auth URL generation, callback exchange, JWKS/JWT validation, session refresh, logout, and claim normalization
  - if the current container-only service layout makes that awkward, add a thin companion runtime inside `basic/keycloak` rather than introducing a separate provider concept in core

## Migration Strategy

1. Land pure additions:
   - `capabilityRegistry.js`
   - `agentKeystore.js`
   - `toolEnvelope.mjs`
   - `wireSign.mjs`
   - `wireVerify.mjs`

2. Backfill agent keys:
   - generate on next `enable agent`
   - add `ploinky agent keys init-all`
   - add `ploinky agent keys rotate <agent>`

3. Introduce capability bindings and generic runtime resource planning without behavior change.

4. Switch `gitAgent` to `SecretStoreClient` and router-mediated calls.

5. Make DPU and `AgentServer` accept both:
   - legacy forwarded auth blob
   - secure invocation token
   for one release, with structured warnings for legacy usage.

6. Extend `basic/keycloak` to provide `auth-provider/v1` and add the generic auth bridge.

7. Make `ploinky sso enable [providerAgent]` bind a concrete `auth-provider/v1` implementation, with `basic/keycloak` as the first supported provider.

8. Remove legacy auth blob acceptance and provider-specific core code.

## Test Plan

### Unit

- capability registry indexing and binding resolution
- runtime resource planning parity with current DPU storage behavior
- `wireSign` / `wireVerify` round-trip
- reject on:
  - wrong signature
  - wrong audience
  - expired token
  - excessive TTL
  - replayed `jti`
  - mutated `body_hash`
  - out-of-scope tool
  - binding mismatch

### Integration

- `gitAgent` retrieves its GitHub token through `secret-store/v1` via the bound provider
- captured invocation replay is rejected
- invocation with swapped `aud` is rejected
- unsigned request to provider MCP is rejected once secure mode is enforced
- same request signed by a different agent identity is rejected
- consumer requesting wider scope than binding-approved scope is rejected

### Forgery

- third process on localhost POSTs forged user JSON to DPU without router-issued invocation token -> rejected
- same request with stale `jti` -> rejected
- same request with wrong `body_hash` -> rejected

### SSO

- with no installed `auth-provider/v1`, `ploinky sso enable` fails
- after enabling `basic/keycloak` and binding it, login/callback/refresh/logout complete through the bridge
- when SSO is disabled, current dev-only web-token auth still gates `/webtty`, `/webchat`, and similar routes unchanged

### Decoupling Acceptance

- no runtime or auth branches in core on concrete provider names
- no consumer-side DPU route lookup or `dpu_secret_*` calls remain in `gitAgent`
- no Keycloak-specific config parsing or claim extraction remains in core runtime/auth code

## Assumptions and Defaults

- The router is the only trusted issuer of invocation grants.
- Direct agent-to-provider host-port trust is removed; routed calls are the supported trust path.
- Providers may keep private internal MCP tool names during migration behind adapters.
- DPU is the first `secret-store/v1` provider.
- `basic/keycloak` is the first `auth-provider/v1` provider.
- Legacy `x-ploinky-auth-info` compatibility lasts one release only.
