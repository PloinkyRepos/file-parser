# gitAgent <-> dpuAgent Identity, Authentication, and Authorization Flow

This document describes the current implemented flow for delegated Git secret
operations between `AssistOSExplorer/gitAgent` and `AssistOSExplorer/dpuAgent`.

It answers these specific questions:

1. how `gitAgent` gets its identity from Ploinky
2. whether `gitAgent` requests a JWT from `dpuAgent`
3. how `gitAgent` proves its identity to `dpuAgent`
4. how `dpuAgent` authenticates and authorizes `gitAgent`
5. how delegated user identity is propagated

This is the current implementation on `feature/capabilities-wire-sso`, not an
older capability-binding design and not a future optional optimization.

## 1. Short Answer

The current live model is:

- Ploinky derives the agent principal as `agent:<repo>/<agent>`.
- Ploinky provisions the agent keypair and injects the principal plus key path
  into the running agent.
- The router issues a short-lived router-signed `user_context_token` for the
  authenticated browser user.
- `gitAgent` does **not** request a JWT from `dpuAgent` in the normal flow.
- `gitAgent` signs its own per-request caller assertion and forwards the router
  user token.
- `dpuAgent` verifies both signed artifacts and then applies DPU-owned scope,
  ACL, grant, and agent-policy checks.

So the trust split is:

- `Ploinky/router` proves the human user
- `gitAgent` proves the caller agent
- `dpuAgent` decides authorization

## 2. Actors and Responsibilities

| Component | Responsibility |
| --- | --- |
| `ploinky/cli/services/agentIdentity.js` | Canonical principal derivation |
| `ploinky/cli/services/agentKeystore.js` | Ed25519 key provisioning for router and agents |
| `ploinky/cli/server/mcp-proxy/secureWire.js` | Router-signed user token issuance and delegated-call verification |
| `ploinky/Agent/lib/runtimeWire.mjs` | Generic agent runtime verification of secure headers |
| `AssistOSExplorer/gitAgent/lib/secret-store-client.mjs` | DPU-aware client used by `gitAgent` |
| `AssistOSExplorer/dpuAgent/tools/dpu_tool.mjs` | DPU MCP entrypoint |
| `AssistOSExplorer/dpuAgent/lib/dpu-store.mjs` | DPU authorization, ACL, grant, and policy enforcement |

## 3. How gitAgent Gets Its Identity

`gitAgent` does not choose its own identity in `manifest.json`.

Current rule:

- canonical principal format: `agent:<repo>/<agent>`
- `gitAgent` principal: `agent:AssistOSExplorer/gitAgent`
- `dpuAgent` principal: `agent:AssistOSExplorer/dpuAgent`

Implementation:

- principal derivation: [ploinky/cli/services/agentIdentity.js](/Users/danielsava/work/file-parser/ploinky/cli/services/agentIdentity.js)
- registry build: [ploinky/cli/services/capabilityRegistry.js](/Users/danielsava/work/file-parser/ploinky/cli/services/capabilityRegistry.js)
- key provisioning: [ploinky/cli/services/agentKeystore.js](/Users/danielsava/work/file-parser/ploinky/cli/services/agentKeystore.js)
- launcher injection:
  - [ploinky/cli/services/docker/agentServiceManager.js](/Users/danielsava/work/file-parser/ploinky/cli/services/docker/agentServiceManager.js)
  - [ploinky/cli/services/bwrap/bwrapServiceManager.js](/Users/danielsava/work/file-parser/ploinky/cli/services/bwrap/bwrapServiceManager.js)

At startup, Ploinky ensures the Ed25519 keypair for the derived principal and
injects at least:

- `PLOINKY_AGENT_PRINCIPAL`
- `PLOINKY_AGENT_PRIVATE_KEY_PATH`
- `PLOINKY_ROUTER_PUBLIC_KEY_JWK`
- `PLOINKY_AGENT_PUBLIC_KEYS_JSON`
- `PLOINKY_ROUTER_URL`

This is why `gitAgent` can sign requests without ever generating or choosing
its own runtime identity.

## 4. Tokens and Signed Artifacts

There are three relevant secure-wire artifacts in the current system.

### 4.1 First-party invocation token

Used when the router sends a first-hop authenticated request into an agent.

- signed by the router
- audience = receiving agent principal
- verified by `AgentServer`

This is how the browser -> router -> `gitAgent` hop is represented internally.

### 4.2 `user_context_token`

Used for delegated user identity on the second hop.

- issued by the router in
  [ploinky/cli/server/mcp-proxy/secureWire.js](/Users/danielsava/work/file-parser/ploinky/cli/server/mcp-proxy/secureWire.js)
- signed by the router
- audience = immediate caller agent principal
  - for the Git flow, `agent:AssistOSExplorer/gitAgent`
- contains normalized user identity and session information

Important:

- this token is minted by the router, not by `gitAgent`
- this token is not minted by `dpuAgent`

### 4.3 `x-ploinky-caller-assertion`

Used by `gitAgent` to prove the caller agent identity for one request.

Implementation:

- signing: [ploinky/Agent/lib/wireSign.mjs](/Users/danielsava/work/file-parser/ploinky/Agent/lib/wireSign.mjs)
- verification: [ploinky/Agent/lib/wireVerify.mjs](/Users/danielsava/work/file-parser/ploinky/Agent/lib/wireVerify.mjs)

Claims include:

- `iss = agent:AssistOSExplorer/gitAgent`
- `aud = agent:AssistOSExplorer/dpuAgent`
- `tool`
- `scope`
- `body_hash`
- `jti`
- `iat`
- `exp`
- optionally the same forwarded `user_context_token`

This is a signed JWS, but in the current design it is an agent assertion
created by `gitAgent`, not a DPU-issued session token.

## 5. Does gitAgent Request a JWT from dpuAgent?

No, not in the normal implemented flow.

Current behavior:

- `gitAgent` never asks `dpuAgent` for a login/session JWT before calling
  secret operations
- `gitAgent` signs every delegated DPU request itself
- `gitAgent` forwards the router-issued `user_context_token`
- `dpuAgent` verifies both and makes the authorization decision directly

There is an optional handshake/session-token optimization mentioned in
[dpu-authority-simplified-architecture-plan.md](/Users/danielsava/work/file-parser/dpu-authority-simplified-architecture-plan.md),
but that is only a future option. It is **not** the current implementation.

## 6. End-to-End Request Flow

### 6.1 First hop: browser -> router -> gitAgent

1. The user authenticates with local auth or SSO.
2. The router resolves `req.user` and `req.session`.
3. A browser MCP request reaches `gitAgent`.
4. The router mints a first-party invocation token for `gitAgent`.
5. `AgentServer` verifies that first-party invocation token.
6. `git_tool.mjs` reconstructs `authInfo` from verified invocation metadata.

Relevant files:

- [ploinky/cli/server/authHandlers.js](/Users/danielsava/work/file-parser/ploinky/cli/server/authHandlers.js)
- [ploinky/cli/server/mcp-proxy/secureWire.js](/Users/danielsava/work/file-parser/ploinky/cli/server/mcp-proxy/secureWire.js)
- [ploinky/Agent/server/AgentServer.mjs](/Users/danielsava/work/file-parser/ploinky/Agent/server/AgentServer.mjs)
- [AssistOSExplorer/shared/invocation-auth.mjs](/Users/danielsava/work/file-parser/AssistOSExplorer/shared/invocation-auth.mjs)
- [AssistOSExplorer/gitAgent/tools/git_tool.mjs](/Users/danielsava/work/file-parser/AssistOSExplorer/gitAgent/tools/git_tool.mjs)

### 6.2 Second hop: gitAgent -> router -> dpuAgent

When `gitAgent` needs a secret:

1. `gitAgent` receives verified first-hop invocation metadata.
2. `gitAgent` extracts `authInfo.invocation.userContextToken`.
3. `gitAgent` builds a direct JSON-RPC `tools/call` request for `dpuAgent`.
4. `gitAgent` signs a caller assertion using its injected private key.
5. `gitAgent` sends:
   - `x-ploinky-caller-assertion`
   - `x-ploinky-user-context`
6. The router verifies the delegated tool call before forwarding it.
7. `AgentServer` in `dpuAgent` verifies the same two headers again.
8. `dpu_tool.mjs` reconstructs `authInfo` from verified invocation metadata.
9. `dpu-store.mjs` applies DPU authorization logic.

Relevant files:

- [AssistOSExplorer/gitAgent/lib/secret-store-client.mjs](/Users/danielsava/work/file-parser/AssistOSExplorer/gitAgent/lib/secret-store-client.mjs)
- [ploinky/cli/server/mcp-proxy/secureWire.js](/Users/danielsava/work/file-parser/ploinky/cli/server/mcp-proxy/secureWire.js)
- [ploinky/Agent/lib/runtimeWire.mjs](/Users/danielsava/work/file-parser/ploinky/Agent/lib/runtimeWire.mjs)
- [AssistOSExplorer/dpuAgent/tools/dpu_tool.mjs](/Users/danielsava/work/file-parser/AssistOSExplorer/dpuAgent/tools/dpu_tool.mjs)

## 7. What the Router Verifies

For delegated `gitAgent -> dpuAgent` calls, the router verifies:

- caller assertion signature
- caller assertion audience = DPU principal
- caller assertion TTL
- caller assertion body hash
- caller assertion replay via `jti`
- forwarded user-token signature
- forwarded user-token audience = caller principal

Implementation:

- [ploinky/cli/server/mcp-proxy/secureWire.js](/Users/danielsava/work/file-parser/ploinky/cli/server/mcp-proxy/secureWire.js)

The router then relays the request. It does not make the final DPU
authorization decision.

## 8. What dpuAgent Verifies

`dpuAgent` receives the relayed call through generic `AgentServer` and verifies:

- caller assertion signature against registered agent public keys
- caller assertion audience = this agent principal
- caller assertion TTL
- caller assertion body hash
- caller assertion replay via `jti`
- `user_context_token` signature using the router public key
- `user_context_token` audience = caller assertion issuer

Implementation:

- [ploinky/Agent/lib/runtimeWire.mjs](/Users/danielsava/work/file-parser/ploinky/Agent/lib/runtimeWire.mjs)
- [ploinky/Agent/server/AgentServer.mjs](/Users/danielsava/work/file-parser/ploinky/Agent/server/AgentServer.mjs)

If verification succeeds, `AgentServer` exposes verified invocation metadata to
the tool wrapper. `dpuAgent` does not trust ad hoc headers or an unsigned auth
blob.

## 9. How dpuAgent Reconstructs Caller/User Identity

`dpu_tool.mjs` receives `metadata.invocation` and converts it to `authInfo`
through [AssistOSExplorer/shared/invocation-auth.mjs](/Users/danielsava/work/file-parser/AssistOSExplorer/shared/invocation-auth.mjs).

That gives DPU:

- `authInfo.agent.principalId`
- `authInfo.user.id`
- `authInfo.user.username`
- `authInfo.user.email`
- `authInfo.user.roles`
- `authInfo.invocation.scope`
- `authInfo.invocation.tool`
- `authInfo.invocation.userContextToken`

From that point on, DPU authorization is based on verified invocation data, not
on untrusted request parameters.

## 10. How dpuAgent Authenticates and Authorizes gitAgent

Authentication and authorization are separate.

### 10.1 Authentication

`dpuAgent` authenticates `gitAgent` by verifying the signed caller assertion:

- the signature matches the registered public key for
  `agent:AssistOSExplorer/gitAgent`
- the request was targeted to `agent:AssistOSExplorer/dpuAgent`
- the request body matches what was signed
- the assertion is fresh and unreplayed

### 10.2 Delegated user validation

`dpuAgent` validates the human user by verifying the router-signed
`user_context_token` and checking that its audience matches the caller agent
principal.

That prevents:

- `gitAgent` from forging a different user
- one agent from replaying a user token minted for another agent

### 10.3 Authorization

After authentication succeeds, `dpu-store.mjs` enforces:

1. invocation scope checks for the requested operation
2. authenticated-actor requirement
3. secret ownership and ACL checks
4. confidential-object ACL checks where applicable
5. agent-policy checks for grants to agent principals

Relevant implementation:

- [AssistOSExplorer/dpuAgent/lib/dpu-store.mjs](/Users/danielsava/work/file-parser/AssistOSExplorer/dpuAgent/lib/dpu-store.mjs)

Important examples:

- `secret_get` requires invocation scope permitting read
- `secret_put` requires invocation scope permitting write
- `secret_grant` requires invocation scope permitting grant/write
- a grant to `agent:AssistOSExplorer/gitAgent` is rejected unless DPU policy
  explicitly allows that role under
  `permissions.manifest.json -> agentPolicies`

So DPU policy is authoritative for agent secret-role ceilings. The `gitAgent`
manifest no longer controls that.

## 11. Storage and Retrieval Example

### 11.1 Storing the GitHub token

Normal store flow:

1. GitHub device flow completes in `gitAgent`.
2. `gitAgent` receives the GitHub access token.
3. `gitAgent` calls DPU `secret_put(\"GIT_GITHUB_TOKEN\", token)`.
4. `gitAgent` signs the caller assertion and forwards the user token.
5. DPU verifies both artifacts.
6. DPU stores the secret owned by the delegated user principal.
7. `gitAgent` may perform a best-effort `secret_grant` to its own canonical
   agent principal if policy allows it.

### 11.2 Retrieving the GitHub token

Normal retrieval flow:

1. A browser action reaches `gitAgent`.
2. `gitAgent` reuses the delegated `user_context_token` from the first hop.
3. `gitAgent` calls DPU `secret_get(\"GIT_GITHUB_TOKEN\")`.
4. DPU authenticates the caller agent and delegated user again.
5. DPU applies ACL/grant checks.
6. If authorized, DPU returns the secret value.
7. `gitAgent` uses the token for the Git operation and does not persist it in
   local workspace files.

## 12. Current Non-Goals / Clarifications

- There is no provider-neutral `secret-store/v1` contract in the live Git/DPU
  path anymore.
- There is no manifest `identity` block for `gitAgent` or `dpuAgent`.
- There is no manifest `capabilities` block controlling DPU grant ceilings.
- There is no normal DPU-issued session JWT for `gitAgent`.
- The router is a transport and identity boundary for this path, not the final
  DPU policy engine.

## 13. Where This Is Also Documented

Related documents:

- [explorer-router-gitagent-dpu-architecture.md](/Users/danielsava/work/file-parser/explorer-router-gitagent-dpu-architecture.md)
- [current-architecture-login-secret-flows.md](/Users/danielsava/work/file-parser/current-architecture-login-secret-flows.md)
- [capability-wire-sso-implementation-handoff.md](/Users/danielsava/work/file-parser/capability-wire-sso-implementation-handoff.md)
- [dpu-authority-simplified-architecture-plan.md](/Users/danielsava/work/file-parser/dpu-authority-simplified-architecture-plan.md)
- [dpu-authority-simplified-implementation-plan.md](/Users/danielsava/work/file-parser/dpu-authority-simplified-implementation-plan.md)

This file is the focused answer for the Git/DPU identity and auth flow. The
other documents provide broader architecture and historical context.
