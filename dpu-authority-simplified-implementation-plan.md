# DPU-Authority Simplified Implementation Plan

This document is the implementation plan for the clarified architecture on the current branch:

- branch: `feature/capability-wire-sso`
- workspace root: `/Users/danielsava/work/file-parser`

This plan is intentionally anchored to the code that exists on this branch today. It is not a greenfield design. It describes how to simplify the current capability-driven `gitAgent <-> dpuAgent` path without regressing the provider-neutral SSO work already landed in Ploinky core.

Related documents:

- [dpu-authority-simplified-architecture-plan.md](./dpu-authority-simplified-architecture-plan.md)
- [current-architecture-login-secret-flows.md](./current-architecture-login-secret-flows.md)
- [capability-wire-sso-implementation-handoff.md](./capability-wire-sso-implementation-handoff.md)

## 1. Revised Invariants

These are the target invariants for the next refactor step.

### 1.1 Core decoupling

`Ploinky core` must not contain `dpuAgent`-, `gitAgent`-, or Keycloak-specific runtime or authorization policy logic.

Clarification:

- `gitAgent` may explicitly know about `dpuAgent`
- `dpuAgent` may explicitly know about `gitAgent`
- `basic/keycloak` remains the SSO provider implementation

### 1.2 Secret authority

`dpuAgent` is the authority for secret-operation authentication, delegated-user validation, scopes, grants, and ACL decisions.

That means:

- `gitAgent` proves its own identity
- `Ploinky` proves the delegated human user
- `dpuAgent` makes the final authorization decision

### 1.3 Secure wire

The `gitAgent -> dpuAgent` path must remain secure against:

- agent impersonation
- forged delegated user context
- replay
- request tampering

### 1.4 SSO architecture

SSO remains provider-agent-based and provider-neutral in Ploinky core.

That means:

- keep `basic/keycloak` as the first `auth-provider/v1`
- keep pending browser auth/session concerns in core
- do not reintroduce Keycloak-specific parsing or config logic in core

## 2. What The Current Branch Still Does

The current branch still reflects the earlier, stronger requirement that `gitAgent` itself be provider-neutral.

### 2.1 Git currently depends on a capability binding

Current evidence:

- [AssistOSExplorer/gitAgent/manifest.json](./AssistOSExplorer/gitAgent/manifest.json) declares `requires.secretStore`
- [AssistOSExplorer/gitAgent/lib/secret-store-client.mjs](./AssistOSExplorer/gitAgent/lib/secret-store-client.mjs) reads `PLOINKY_CAPABILITY_BINDINGS_JSON`
- the same client resolves a provider alias and route from launcher-injected binding metadata

Why this is now wrong:

- it makes `gitAgent` depend on Ploinky capability wiring even though direct DPU coupling is allowed

### 2.2 Router still resolves consumer alias -> provider binding for delegated calls

Current evidence:

- [ploinky/cli/server/mcp-proxy/secureWire.js](./ploinky/cli/server/mcp-proxy/secureWire.js) uses `resolveAliasForConsumer()`
- the same code intersects requested scopes with binding-approved scopes and provider contract scopes before minting an invocation token

Why this is now wrong:

- it leaves DPU authorization partially in Ploinky instead of fully in DPU

### 2.3 DPU still relies on provider-binding metadata injected by Ploinky

Current evidence:

- [AssistOSExplorer/dpuAgent/lib/dpu-store.mjs](./AssistOSExplorer/dpuAgent/lib/dpu-store.mjs) reads `PLOINKY_PROVIDER_BINDINGS_JSON`
- it validates `binding_id`, `consumerPrincipal`, and binding scopes before applying DPU ACL checks

Why this is now wrong:

- DPU should not depend on Ploinky-injected workspace binding metadata to make secret access decisions

### 2.4 SSO is already in the right direction

Current evidence:

- [ploinky/cli/server/auth/service.js](./ploinky/cli/server/auth/service.js) is now a thin generic bridge
- `workspace:sso` binding is used in core to select the auth provider agent
- `basic/keycloak` owns provider-specific logic

Why this should stay:

- SSO is genuinely provider-pluggable
- that is a separate concern from the Git/DPU simplification

## 3. Target Runtime Model

## 3.1 Ploinky core

Ploinky keeps only generic platform responsibilities:

- browser/session auth
- normalized user model
- router-issued signed `user_context_token`
- agent key provisioning
- agent routing
- provider-neutral SSO bridge

Ploinky does not decide:

- which DPU tools `gitAgent` may call
- which secret scopes `gitAgent` gets
- how DPU grants are stored or validated

## 3.2 gitAgent

`gitAgent` becomes an explicit DPU client.

It may:

- call the DPU route directly
- know the DPU tool/API names
- sign per-request agent assertions
- forward the delegated `user_context_token`

It may not:

- mint or alter user tokens
- decide final secret authorization

## 3.3 dpuAgent

`dpuAgent` becomes the complete authority for secret operations.

It must:

- authenticate the calling agent
- verify the delegated human user token
- reject replays
- validate request integrity
- enforce tool/scope allowlists for caller agents
- enforce per-secret ACLs and grants

## 3.4 SSO

SSO remains as implemented now:

- `basic/keycloak` continues to provide `auth-provider/v1`
- Ploinky core stays provider-neutral
- the Git/DPU simplification must not disturb this path

## 4. Minimal Protocol To Keep

The target protocol for `gitAgent -> dpuAgent` is deliberately smaller than the current delegated-invocation design.

## 4.1 `user_context_token`

Issuer:

- Ploinky/router

Purpose:

- prove the logged-in human user to DPU

Properties:

- signed by router
- short-lived
- includes normalized user identity
- audience-pinned to the immediate caller agent
- forwarded by `gitAgent`, never minted by `gitAgent`

Suggested claims:

- `iss = ploinky-router`
- `aud = agent:AssistOSExplorer/gitAgent`
- `sub`
- `sid`
- `user`
- `iat`
- `exp`
- `jti`

## 4.2 `agent_request_assertion`

Issuer:

- `gitAgent`

Purpose:

- prove the caller is `gitAgent`
- bind the proof to one concrete request

Properties:

- signed with `gitAgent` private key
- very short-lived
- replay-protected by DPU

Suggested claims:

- `iss = agent:AssistOSExplorer/gitAgent`
- `aud = agent:AssistOSExplorer/dpuAgent`
- `tool`
- optional `scope`
- `body_hash`
- `jti`
- `iat`
- `exp`

## 4.3 Transport shape

For a DPU request, `gitAgent` sends:

- request body
- `x-ploinky-caller-assertion: <agent_request_assertion>`
- `x-ploinky-user-context: <user_context_token>`

If the call goes through the router:

- the router admits the request
- the router forwards these signed headers unchanged
- the router does not resolve capability bindings or mint a second provider-facing grant for this path

## 4.4 DPU verification order

`dpuAgent` verifies:

1. caller assertion signature using `gitAgent` public key
2. assertion audience equals `agent:AssistOSExplorer/dpuAgent`
3. assertion TTL and nonce
4. assertion `body_hash`
5. `user_context_token` signature using router public key
6. `user_context_token` TTL and audience
7. caller agent is allowed to use the requested DPU tool
8. requested scope, if any, is allowed for that caller/tool
9. delegated user is allowed by DPU ACL/grant policy

This preserves the important security properties while moving final policy to DPU.

## 5. Keep / Remove / Move

## 5.1 Keep

These parts of the current branch should survive:

- router signing key management in `ploinky/cli/services/agentKeystore.js`
- agent key provisioning in launcher code
- `user_context_token` issuance logic in `ploinky/cli/server/mcp-proxy/secureWire.js`
- provider-neutral SSO bridge and `workspace:sso` binding
- manifest-driven runtime resource planning in Ploinky
- current first-party router -> agent invocation flow for browser-originated agent calls

## 5.2 Remove from the Git/DPU path

These parts should no longer be required for Git secret operations:

- `gitAgent.manifest.requires.secretStore`
- `PLOINKY_CAPABILITY_BINDINGS_JSON` consumption inside `gitAgent`
- router alias resolution for `gitAgent -> dpuAgent`
- provider binding enforcement via `PLOINKY_PROVIDER_BINDINGS_JSON`
- binding-based scope intersection in the Git/DPU delegated path

## 5.3 Move into DPU

These concerns should be owned by DPU:

- caller-agent allowlist
- per-tool caller permissions
- scope allowlist for caller agents
- grant-time and read-time role policy
- optional static knowledge of `gitAgent`

## 6. Detailed Refactor Plan

## Phase 0. Freeze the target and avoid collateral damage

Goal:

- simplify only the Git/DPU delegated path
- do not disturb SSO or generic runtime resources

Actions:

- treat [dpu-authority-simplified-architecture-plan.md](./dpu-authority-simplified-architecture-plan.md) as the architectural source of truth
- keep `capabilityRegistry.js` for SSO/workspace provider selection
- do not delete generic secure-wire primitives that SSO or first-party routing still need

Exit criteria:

- clear separation between “Git/DPU simplification” and “SSO/provider-neutral core”

## Phase 1. Introduce the direct DPU delegated-auth path

Goal:

- allow DPU to authenticate `gitAgent` directly with caller assertion + user token

Files:

- [ploinky/Agent/lib/wireVerify.mjs](./ploinky/Agent/lib/wireVerify.mjs)
- [ploinky/Agent/lib/wireSign.mjs](./ploinky/Agent/lib/wireSign.mjs)
- [AssistOSExplorer/dpuAgent/server/standalone-mcp-server.mjs](./AssistOSExplorer/dpuAgent/server/standalone-mcp-server.mjs)
- [AssistOSExplorer/dpuAgent/tools/dpu_tool.mjs](./AssistOSExplorer/dpuAgent/tools/dpu_tool.mjs)
- possibly [ploinky/Agent/lib/toolEnvelope.mjs](./ploinky/Agent/lib/toolEnvelope.mjs)

Changes:

- add or expose verifier helpers for:
  - direct caller assertion verification
  - direct user-context token verification
- in DPU standalone server, accept:
  - `x-ploinky-caller-assertion`
  - `x-ploinky-user-context`
- normalize the verified result into the same internal auth envelope DPU tools already expect
- keep temporary compatibility with the current `x-ploinky-invocation` path during migration

Reason:

- DPU should be able to authenticate callers without a router-minted provider invocation grant

Exit criteria:

- DPU can securely handle direct `gitAgent` delegated requests

## Phase 2. Simplify router behavior for agent-originated DPU calls

Goal:

- make the router a transport boundary, not an authorization engine, for `gitAgent -> dpuAgent`

Files:

- [ploinky/cli/server/mcp-proxy/index.js](./ploinky/cli/server/mcp-proxy/index.js)
- [ploinky/cli/server/mcp-proxy/secureWire.js](./ploinky/cli/server/mcp-proxy/secureWire.js)
- [ploinky/cli/server/RoutingServer.js](./ploinky/cli/server/RoutingServer.js)

Changes:

- keep admitting caller-assertion traffic at the router boundary
- for agent-originated DPU requests:
  - forward `x-ploinky-caller-assertion`
  - forward `x-ploinky-user-context`
  - stop resolving alias bindings
  - stop minting delegated provider-facing invocation grants
- keep first-party invocation minting for browser -> agent calls
- retain a short migration window where both old and new nested-call paths can work if needed

Reason:

- core should remain generic transport/session infrastructure, not DPU-specific policy infrastructure

Exit criteria:

- router no longer participates in Git/DPU authorization decisions beyond authenticating the outer HTTP boundary

## Phase 3. Simplify `gitAgent`

Goal:

- make `gitAgent` an explicit DPU client

Files:

- [AssistOSExplorer/gitAgent/manifest.json](./AssistOSExplorer/gitAgent/manifest.json)
- [AssistOSExplorer/gitAgent/lib/secret-store-client.mjs](./AssistOSExplorer/gitAgent/lib/secret-store-client.mjs)
- [AssistOSExplorer/gitAgent/tools/git_tool.mjs](./AssistOSExplorer/gitAgent/tools/git_tool.mjs)
- Git auth helper files that call the secret client

Changes:

- remove `requires.secretStore` from `gitAgent/manifest.json`
- stop reading `PLOINKY_CAPABILITY_BINDINGS_JSON`
- stop sending alias/binding metadata in caller assertions
- replace provider resolution with an explicit DPU target:
  - `PLOINKY_DPU_ROUTE` env var, or
  - default route name `dpuAgent`
- keep forwarding `user_context_token` from the inbound router-authenticated request
- keep per-request agent signing

Recommended implementation choice:

- keep using the current `secret_get|put|delete|grant|revoke|list` operation names as DPU’s public secret API
- do not force a rename back to `dpu_secret_*` unless there is a functional reason

Reason:

- this minimizes churn while making the Git/DPU coupling explicit instead of hidden behind Ploinky capability binding

Exit criteria:

- `gitAgent` can store and retrieve secrets through DPU without any capability-binding metadata

## Phase 4. Move all secret authorization policy into DPU

Goal:

- eliminate Ploinky-owned binding policy from the DPU decision path

Files:

- [AssistOSExplorer/dpuAgent/lib/dpu-store.mjs](./AssistOSExplorer/dpuAgent/lib/dpu-store.mjs)
- [AssistOSExplorer/dpuAgent/lib/dpu-store-internal/permissions-manifest.mjs](./AssistOSExplorer/dpuAgent/lib/dpu-store-internal/permissions-manifest.mjs)
- [AssistOSExplorer/dpuAgent/lib/dpu-store-internal/storage.mjs](./AssistOSExplorer/dpuAgent/lib/dpu-store-internal/storage.mjs)
- DPU docs/specs

Changes:

- remove reliance on `PLOINKY_PROVIDER_BINDINGS_JSON`
- replace `assertInvocationBindingFor()` with DPU-local caller policy checks
- move any remaining `gitAgent` allowlist or role-cap policy out of `gitAgent` manifest and into DPU-controlled configuration or code
- define one authoritative DPU caller policy source, for example:
  - static defaults in DPU code for known agent principals
  - plus optional workspace overrides stored in DPU-managed state

Recommended policy model:

- caller principal -> allowed DPU operations
- caller principal + operation -> allowed scopes
- delegated user + secret ACL -> final access check

Reason:

- if DPU is the authority, Ploinky and `gitAgent` manifests should not be the final source of secret permission truth

Exit criteria:

- DPU can reject unauthorized agent/tool/scope combinations without reading Ploinky binding metadata or Git manifest policy

## Phase 5. Remove obsolete launcher/env plumbing

Goal:

- keep only the generic runtime primitives the simplified model still needs

Files:

- [ploinky/cli/services/docker/agentServiceManager.js](./ploinky/cli/services/docker/agentServiceManager.js)
- [ploinky/cli/services/bwrap/bwrapServiceManager.js](./ploinky/cli/services/bwrap/bwrapServiceManager.js)

Changes:

- keep injecting:
  - `PLOINKY_AGENT_PRINCIPAL`
  - `PLOINKY_AGENT_PRIVATE_KEY_PATH`
  - `PLOINKY_ROUTER_PUBLIC_KEY_JWK`
  - `PLOINKY_ROUTER_URL`
- stop injecting for the Git/DPU path:
  - `PLOINKY_CAPABILITY_BINDINGS_JSON`
  - `PLOINKY_PROVIDER_BINDINGS_JSON`
- if capability-binding env injection has no remaining runtime consumers after this refactor, delete it entirely

Reason:

- launcher responsibilities should stay generic and minimal

Exit criteria:

- Git/DPU traffic depends only on generic identity/session env plus explicit DPU route selection

## Phase 6. Keep capability bindings only where they still make sense

Goal:

- avoid over-deleting useful generic machinery

Files:

- [ploinky/cli/services/capabilityRegistry.js](./ploinky/cli/services/capabilityRegistry.js)
- [ploinky/cli/services/sso.js](./ploinky/cli/services/sso.js)
- [ploinky/cli/server/auth/genericAuthBridge.js](./ploinky/cli/server/auth/genericAuthBridge.js)

Changes:

- retain workspace binding support for `workspace:sso -> auth-provider/v1`
- remove or de-emphasize Git/DPU-specific binding helpers that become unused
- update docs/tests to describe capability binding as:
  - still valid for SSO/provider selection
  - no longer the secret-routing dependency for `gitAgent`

Reason:

- the capability system still has value for truly swappable providers such as SSO

Exit criteria:

- capability bindings remain only where they are architecturally justified

## Phase 7. Update tests, deployments, and docs

Goal:

- prove the simplified model works in the real deployments already used on this branch

Files and environments:

- Ploinky unit tests
- DPU unit tests
- Git unit tests
- [testExplorer](../testExplorer) deployment
- [testCoral](../testCoral) deployment
- docs in root, `ploinky/`, and `AssistOSExplorer/`

Changes:

- replace or delete tests that assume Git secret calls require capability bindings
- add direct caller-assertion + user-token verification tests in DPU
- add router passthrough tests for agent-originated calls
- update Explorer deployment so it no longer needs a `gitAgent:secretStore -> dpuAgent` workspace binding
- keep Coral SSO deployment tests unchanged except for regression verification

Reason:

- the branch already has working `testExplorer` and `testCoral` deployments; they should be the acceptance environment

Exit criteria:

- Explorer works for Git login/token storage without capability binding
- Coral SSO still works

## 7. File-by-File Change List

This section condenses the expected edits.

### Ploinky

- `ploinky/cli/server/mcp-proxy/index.js`
  - remove delegated binding resolution for Git/DPU nested calls
  - forward caller assertion and user token
- `ploinky/cli/server/mcp-proxy/secureWire.js`
  - keep `issueUserContextToken()`
  - reduce or remove `buildDelegatedInvocation()` usage for Git/DPU
- `ploinky/cli/services/docker/agentServiceManager.js`
  - stop injecting capability/provider binding env for Git/DPU
- `ploinky/cli/services/bwrap/bwrapServiceManager.js`
  - same as Docker launcher
- `ploinky/cli/services/capabilityRegistry.js`
  - keep for SSO
  - remove dead Git/DPU helpers if no longer used
- `ploinky/Agent/lib/wireVerify.mjs`
  - expose direct verifier helpers used by DPU

### AssistOSExplorer / gitAgent

- `AssistOSExplorer/gitAgent/manifest.json`
  - remove `requires.secretStore`
  - remove `capabilities.dpu.allowedRoles`
- `AssistOSExplorer/gitAgent/lib/secret-store-client.mjs`
  - simplify into explicit DPU client
  - remove binding/alias/provider-resolution logic
- `AssistOSExplorer/gitAgent/tools/git_tool.mjs`
  - keep extracting forwarded `user_context_token`
  - stop depending on capability alias metadata
- Git auth helper/tests/docs
  - update terminology from “bound secret-store provider” to “DPU secret service”

### AssistOSExplorer / dpuAgent

- `AssistOSExplorer/dpuAgent/server/standalone-mcp-server.mjs`
  - verify direct caller assertion + user token headers
- `AssistOSExplorer/dpuAgent/lib/dpu-store.mjs`
  - remove binding-based checks
  - add DPU-local caller/tool/scope policy
- `AssistOSExplorer/dpuAgent/tools/dpu_tool.mjs`
  - normalize direct verified auth context
- DPU tests/docs
  - cover replay, tamper, forged user token, unauthorized tool/scope

### basic

- no functional SSO redesign required
- only touch if shared docs/tests need updates

## 8. Migration Strategy

Recommended migration order:

1. Add DPU support for direct caller assertion + user token verification.
2. Switch `gitAgent` to the direct path.
3. Change router nested-call handling to passthrough mode.
4. Remove DPU reliance on provider-binding env.
5. Remove Git `requires.secretStore`.
6. Delete obsolete binding/env/test/doc paths.

Recommended compatibility window:

- one release where DPU accepts both:
  - old router-issued invocation tokens
  - new direct caller assertion + user-context headers

Why:

- it allows Git to migrate first without breaking deployed workspaces during the cutover

## 9. Acceptance Criteria

The refactor is complete when all of the following are true.

### 9.1 Architecture

- `gitAgent` no longer requires `secretStore` capability binding to reach DPU
- `Ploinky core` still contains no DPU- or Git-specific policy logic
- `dpuAgent` alone decides whether `gitAgent` may call a secret operation

### 9.2 Security

- replayed `agent_request_assertion` is rejected by DPU
- tampered request body is rejected by DPU
- forged or expired `user_context_token` is rejected by DPU
- unauthorized caller principal is rejected by DPU
- unauthorized tool/scope is rejected by DPU

### 9.3 Runtime

- launchers still provide generic identity/session primitives
- no Git secret operation depends on `PLOINKY_CAPABILITY_BINDINGS_JSON`
- no DPU secret authorization depends on `PLOINKY_PROVIDER_BINDINGS_JSON`

### 9.4 Product behavior

- `testExplorer` works end to end for:
  - browser login
  - GitHub OAuth/device flow
  - token storage in DPU
  - token retrieval by `git_auth_status`
- `testCoral` SSO still works end to end

## 10. Test Plan

## 10.1 Unit tests

Add or update tests for:

- caller assertion verification
- `user_context_token` verification
- replay cache behavior
- request body tamper rejection
- caller-tool-scope allowlist rejection in DPU
- Git client request construction without binding metadata

## 10.2 Integration tests

Add or update tests for:

- browser -> router -> gitAgent first hop still works
- gitAgent -> router -> dpuAgent direct delegated call works without capability binding
- DPU rejects forged direct calls from an untrusted local process

## 10.3 Manual deployment checks

`testExplorer`:

- remove `gitAgent:secretStore -> dpuAgent` binding
- deploy and confirm Git login/token storage still works

`testCoral`:

- confirm SSO login still works unchanged after the simplification

## 11. Explicit Non-Goals

This refactor should not:

- remove the provider-neutral SSO architecture
- reintroduce Keycloak-specific logic into Ploinky core
- remove manifest-driven runtime resource planning
- require Ploinky core to understand DPU scopes or grants
- force `gitAgent` to become provider-neutral again

## 12. Decision Summary

The key design decisions in this plan are:

1. Keep Ploinky generic, not provider-authoritative.
2. Let `gitAgent` be explicitly DPU-aware.
3. Let `dpuAgent` be the single authority for secret authn/authz policy.
4. Keep router-issued user tokens and agent keys as generic platform primitives.
5. Keep capability bindings only where they still solve a real provider-swappability problem, especially SSO.

That is the simplest architecture that matches the clarified invariants.
