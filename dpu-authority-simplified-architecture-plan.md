# DPU-Authority Simplified Architecture Plan

This document supersedes the earlier assumption that `gitAgent` itself must be provider-neutral.

The clarified architecture is:

- `Ploinky core` must not be coupled to `gitAgent`, `dpuAgent`, or Keycloak specifics
- `gitAgent` may be explicitly coupled to `dpuAgent`
- `dpuAgent` is the authority for secret authentication, delegated-user validation, access control, scopes, and grants
- SSO remains provider-agent-based and provider-neutral in Ploinky core

This document defines the revised invariants, the simplified agent-to-agent protocol, and the migration direction from the current implementation to that target.

Detailed execution plan:

- [dpu-authority-simplified-implementation-plan.md](./dpu-authority-simplified-implementation-plan.md)

## 1. Revised Invariants

These invariants replace the stricter earlier reading of invariant 1.

### 1.1 Invariant 0

OOP and modular design principles should still be respected:

- single-responsibility boundaries should be explicit
- duplicated security logic should be minimized
- Ploinky runtime concerns, DPU authorization concerns, and Git workflow concerns should remain separated

### 1.2 Invariant 1

`Ploinky core` must not know about the specifics of `dpuAgent`, `gitAgent`, Keycloak, or any other concrete provider in runtime/auth logic.

Clarification:

- `gitAgent` is allowed to know about `dpuAgent`
- `dpuAgent` is allowed to know about `gitAgent` if needed for grant policy
- the decoupling requirement applies to `Ploinky core`, not necessarily to every agent pair

### 1.3 Invariant 2

The `gitAgent -> dpuAgent` wire must be secure against:

- agent impersonation
- forged delegated user context
- replay
- request tampering

Clarification:

- `dpuAgent` is the security authority for secret operations
- `dpuAgent` owns the final authorization decision
- `Ploinky` may provide generic identity/session primitives, but not DPU-specific access-control policy

### 1.4 Invariant 3

SSO must still be delivered by a Ploinky agent.

Specifically:

- Ploinky core must not contain Keycloak-specific claim parsing or URL knowledge
- `basic/keycloak` remains the first provider implementation
- when SSO is disabled, the current dev-only web-token auth and local auth behavior remain available

## 2. What This Clarification Changes

The earlier implementation optimized for a stronger requirement:

- consumers should depend on a generic capability contract instead of a concrete provider

That led to:

- `provides`
- `requires`
- workspace capability bindings
- provider-neutral `secret-store/v1`

Under the clarified invariants, that machinery is not necessary for the `gitAgent <-> dpuAgent` path.

What actually matters is:

1. Ploinky must not special-case DPU or Git in core runtime/auth logic.
2. `gitAgent` may directly target `dpuAgent`.
3. `dpuAgent` may own access control and scope policy.

So the system can be simplified substantially without violating the clarified architecture.

## 3. Simplified Target Architecture

## 3.1 Ploinky Core

Ploinky core should provide only generic platform primitives:

- browser/session authentication
- normalized user session model
- optional signed `user_context_token` issuance
- generic agent identity and key provisioning
- agent launch and routing
- provider-neutral SSO bridge

Ploinky core should not decide:

- DPU scopes
- DPU ACL rules
- which DPU operations `gitAgent` may call
- DPU grant semantics

## 3.2 gitAgent

`gitAgent` should be a DPU-aware client.

That means:

- it may directly call `dpuAgent`
- it may know DPU route names or endpoints
- it may know DPU tool names or a DPU-specific API surface
- it signs requests to DPU with its own agent key
- it forwards a non-forgeable delegated user token

This is acceptable because the invariant forbids Ploinky core coupling, not consumer/provider coupling.

## 3.3 dpuAgent

`dpuAgent` should be the security authority for secret operations.

It is responsible for:

- authenticating the caller agent
- verifying delegated user context
- preventing replay
- validating request integrity
- enforcing scope/tool policy
- enforcing per-secret ACLs and grants
- maintaining the authoritative secret store

## 3.4 basic/keycloak

`basic/keycloak` remains the SSO provider agent.

It is still responsible for:

- OIDC discovery
- PKCE/nonce
- token exchange
- JWT validation
- claim normalization

The simplification of the Git/DPU path does not change the SSO provider architecture.

## 4. Minimal Secure Protocol for gitAgent -> dpuAgent

This protocol keeps the important security properties while removing capability-registry complexity from this path.

## 4.1 Artifacts

Two signed artifacts are sufficient:

1. `user_context_token`
2. `agent_request_assertion`

### 4.1.1 `user_context_token`

Issued by Ploinky from an authenticated browser session.

Purpose:

- prove the delegated human identity to DPU

Claims:

- `iss = ploinky-router`
- `aud = agent:gitAgent`
- `sid`
- `sub` for the normalized user principal
- normalized user claims:
  - `id`
  - `username`
  - `email`
  - `roles`
- `iat`
- `exp`
- `jti`

Properties:

- short-lived
- signed by the router
- audience-pinned to the immediate caller agent that is allowed to forward it
- never minted by `gitAgent`

### 4.1.2 `agent_request_assertion`

Signed by `gitAgent` for each request sent to DPU.

Purpose:

- prove the caller is `gitAgent`
- bind the proof to one request body and one target operation

Claims:

- `iss = agent:gitAgent`
- `aud = agent:dpuAgent`
- `tool`
- optional `scope`
- `body_hash`
- `jti`
- `iat`
- `exp`

Properties:

- signed by `gitAgent` private key
- very short TTL
- replay-protected by DPU

## 4.2 Request shape

For each DPU call, `gitAgent` sends:

- request body
- `x-ploinky-agent-assertion: <signed per-request assertion>`
- `x-ploinky-user-context: <signed user_context_token>`

If the call goes through the router transport, the router should act only as:

- authenticated HTTP boundary
- pass-through for these signed artifacts

The router does not need to resolve capability bindings or mint a provider-facing delegated invocation token for this path.

## 4.3 DPU verification sequence

`dpuAgent` verifies, in order:

1. the agent assertion signature using `gitAgent`’s public key
2. `aud == agent:dpuAgent`
3. `iat/exp` within allowed skew
4. `jti` not seen before
5. `body_hash` matches the actual request body
6. the `user_context_token` signature using the router public key
7. the `user_context_token` TTL and audience
8. the requested tool is allowed for the caller agent
9. the requested scope, if used, is allowed for that tool/agent
10. the delegated human user is authorized by DPU ACL/grant policy

This keeps the trust boundary small:

- Ploinky proves the user
- `gitAgent` proves the caller
- `dpuAgent` decides authorization

## 4.4 Optional optimization

If per-request signatures are too expensive or awkward, DPU may expose a signed-handshake flow:

1. `gitAgent` signs a challenge from DPU
2. DPU verifies the signature
3. DPU returns a short-lived DPU session token
4. `gitAgent` uses that token for subsequent calls

Even in that model, delegated user context must still be independently signed by Ploinky.

So the handshake optimization does not replace the need for a router-issued user token.

## 5. What the Current Implementation Overdoes for This Architecture

The current implementation introduces several things that are no longer required for this path under the clarified invariants:

1. `gitAgent.requires.secretStore`
2. workspace capability binding for `gitAgent:secretStore`
3. provider-neutral `secret-store/v1` indirection for Git/DPU
4. router resolution of binding/provider/scope for delegated Git/DPU calls
5. provider-binding allowlist as the primary authorization model for this path

These were reasonable under the stronger “consumer must be provider-neutral” design, but they are not required now.

## 6. What Should Be Kept

Some pieces from the implementation are still useful and should remain:

### 6.1 Keep

- agent key provisioning in Ploinky launchers
- router-issued signed normalized user context tokens
- provider-agent-based SSO bridge
- Keycloak provider runtime in `basic/keycloak`
- provider-side replay and body-hash verification patterns

### 6.2 Simplify or remove

- `requires` / binding dependence for Git/DPU
- generic `secret-store/v1` path for Git/DPU
- router-minted delegated invocation token for Git/DPU
- capability-registry-based scope resolution for Git/DPU

## 7. Migration Direction From Current Code

The current codebase already contains the stronger capability-driven implementation. The simplified target should be approached as a cleanup/refactor pass, not a rewrite from scratch.

### 7.1 Step 1: Update the target docs and invariants

Done in this document.

The next coding session should treat this as the target architecture rather than the older stronger provider-neutral consumer model.

### 7.2 Step 2: Reintroduce an explicit DPU client in gitAgent

Likely changes:

- replace `gitAgent/lib/secret-store-client.mjs` with a DPU-specific client, or keep the file and simplify it into a DPU client
- allow direct DPU operation names in `gitAgent`
- remove dependence on `PLOINKY_CAPABILITY_BINDINGS_JSON` for Git/DPU

### 7.3 Step 3: Make the router a pass-through for signed Git->DPU calls

Likely changes:

- keep browser auth/session handling in Ploinky
- keep user token issuance in Ploinky
- stop minting delegated provider-facing invocation tokens for Git/DPU secret calls
- forward the signed agent assertion and signed user token to DPU

### 7.4 Step 4: Move tool/scope authorization fully into DPU

Likely changes:

- DPU should own the mapping from caller agent to allowed tools/scopes
- the router should stop being the primary scope-policy engine for this path
- DPU may continue to use manifest policy for grant constraints, but that policy should be DPU-owned, not routed through generic capability wiring

### 7.5 Step 5: Remove Git/DPU dependency on `requires` and bindings

Likely changes:

- remove `requires.secretStore` from `gitAgent/manifest.json`
- remove workspace `gitAgent:secretStore` binding as a requirement
- remove the need for `PLOINKY_PROVIDER_BINDINGS_JSON` in DPU for this path

### 7.6 Step 6: Keep SSO provider-neutral

No simplification should reintroduce Keycloak-specific logic into Ploinky core.

This part of the current implementation should remain.

## 8. File Areas Likely Affected in the Simplification Pass

### Ploinky

- `ploinky/cli/server/mcp-proxy/secureWire.js`
- `ploinky/cli/server/mcp-proxy/index.js`
- `ploinky/cli/services/capabilityRegistry.js`
- `ploinky/cli/services/docker/agentServiceManager.js`
- `ploinky/cli/services/bwrap/bwrapServiceManager.js`
- `ploinky/Agent/server/AgentServer.mjs`
- `ploinky/Agent/lib/wireSign.mjs`
- `ploinky/Agent/lib/wireVerify.mjs`

### AssistOSExplorer gitAgent

- `AssistOSExplorer/gitAgent/lib/secret-store-client.mjs`
- `AssistOSExplorer/gitAgent/lib/github-auth.mjs`
- `AssistOSExplorer/gitAgent/tools/git_tool.mjs`
- `AssistOSExplorer/gitAgent/manifest.json`

### AssistOSExplorer dpuAgent

- `AssistOSExplorer/dpuAgent/server/standalone-mcp-server.mjs`
- `AssistOSExplorer/dpuAgent/tools/dpu_tool.mjs`
- `AssistOSExplorer/dpuAgent/lib/dpu-store.mjs`
- `AssistOSExplorer/dpuAgent/manifest.json`

## 9. Recommended Revised Invariants For Future Sessions

Use these exact invariants going forward:

1. `Ploinky core` must not contain `dpuAgent`-, `gitAgent`-, or Keycloak-specific runtime/auth policy logic.
2. `gitAgent` may be explicitly coupled to `dpuAgent`.
3. `dpuAgent` is the authority for secret-operation authentication, delegated-user validation, scopes, ACLs, and grants.
4. The `gitAgent -> dpuAgent` wire must remain protected against impersonation, forged user context, replay, and tampering.
5. SSO must remain provider-agent-based and provider-neutral in Ploinky core.
6. When SSO is disabled, the current dev/local auth behavior must remain available.

## 10. Short Summary

What was previously implemented is a valid stronger architecture, but it is stronger than what the clarified invariants require.

The simpler architecture is:

- Ploinky core stays generic
- `gitAgent` directly knows `dpuAgent`
- Ploinky proves the user
- `gitAgent` proves the caller
- `dpuAgent` decides authorization

That is the design target this document recommends for the next refactor pass.
