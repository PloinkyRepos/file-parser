# DPU Authority / SSO Implementation Handoff

This document is the continuity pack for a new agentic session on the current branch state.

It is meant to be enough context to continue implementation, debug regressions, review the architecture, or finish the remaining cleanup without replaying the full conversation history.

The important update is that the architecture target was clarified mid-session:

- `Ploinky core` must stay agnostic of `gitAgent`, `dpuAgent`, and Keycloak specifics
- `gitAgent` is allowed to be explicitly coupled to `dpuAgent`
- `dpuAgent` is the authority for secret-operation authentication, delegated-user validation, scopes, ACLs, and grants
- SSO still remains provider-agent-based and provider-neutral in Ploinky core

When this document conflicts with earlier capability-heavy assumptions, the simplified DPU-authority model is the authoritative target.

Related documents:

- [explorer-router-gitagent-dpu-architecture.md](/Users/danielsava/work/file-parser/explorer-router-gitagent-dpu-architecture.md)
- [gitagent-dpuagent-auth-flow.md](/Users/danielsava/work/file-parser/gitagent-dpuagent-auth-flow.md)
- [dpu-authority-simplified-architecture-plan.md](/Users/danielsava/work/file-parser/dpu-authority-simplified-architecture-plan.md)
- [dpu-authority-simplified-implementation-plan.md](/Users/danielsava/work/file-parser/dpu-authority-simplified-implementation-plan.md)
- [principal-derivation-and-dpu-agent-policy-plan.md](/Users/danielsava/work/file-parser/principal-derivation-and-dpu-agent-policy-plan.md)
- [runtime-keyed-dependency-preparation-plan.md](/Users/danielsava/work/file-parser/runtime-keyed-dependency-preparation-plan.md)
- [current-architecture-login-secret-flows.md](/Users/danielsava/work/file-parser/current-architecture-login-secret-flows.md)
- [ploinky-capability-wire-sso-refactor-plan.md](/Users/danielsava/work/file-parser/ploinky-capability-wire-sso-refactor-plan.md)

## 1. Current Invariants

These are the current target invariants for ongoing work.

1. `Ploinky core` must not contain `dpuAgent`-, `gitAgent`-, or Keycloak-specific runtime or authorization policy logic.
2. `gitAgent` may explicitly know about and call `dpuAgent`.
3. `dpuAgent` is the authority for secret-operation authentication, delegated-user validation, scope checks, grants, and ACL decisions.
4. The `gitAgent -> dpuAgent` wire must be secure against impersonation, forged delegated user context, replay, and request tampering.
5. SSO must remain provider-agent-based. `basic/keycloak` is the first provider, but Ploinky core must stay provider-neutral.
6. When SSO is disabled, local auth and the existing dev-only web-token auth behavior must continue to work.
7. Agent principals are derived by Ploinky only, as `agent:<repo>/<agent>`. Manifests must not declare an `identity` block, and short-form aliases like `agent:gitAgent` are no longer recognized.
8. The maximum secret roles an agent may receive live in DPU-owned policy (`permissions.manifest.json -> agentPolicies`), not in agent manifests. DPU rejects secret grants to agent principals that have no DPU policy entry.

## 2. Original Request and Prompt Context

The original user request was to analyze:

- `AssistOSExplorer/gitAgent`
- `AssistOSExplorer/dpuAgent`
- `ploinky`

and refactor the architecture so:

- Ploinky stops knowing concrete agent specifics
- the inter-agent wire is secure
- SSO is delivered by an agent, not by Ploinky core

The first execution prompt used for implementation was:

```text
Read and execute the refactor described in:

/Users/danielsava/work/file-parser/ploinky-capability-wire-sso-refactor-plan.md

Treat that document as the implementation source of truth, with one important clarification already reflected there:
- the initial `auth-provider/v1` implementation must be the existing `basic/keycloak` agent
- do not invent a separate `keycloakAgent` unless you absolutely need a thin runtime inside `basic/keycloak` itself

Codebase areas to analyze first:
- `ploinky/`
- `AssistOSExplorer/dpuAgent/`
- `AssistOSExplorer/gitAgent/`
- `basic/keycloak/`

Goal:
Implement the architecture in the markdown plan end to end so these invariants hold:
1. Ploinky core no longer knows about `dpuAgent`, `gitAgent`, `keycloak`, or other provider specifics in runtime/auth logic.
2. `gitAgent` no longer depends directly on DPU route names, DPU MCP tool names, or forged auth headers.
3. Inter-agent capability calls are secured with router-mediated signed invocation grants that prevent impersonation, forged user context, replay, request tampering, and scope-creep.
4. SSO is provided through a bound `auth-provider/v1` agent, starting with `basic/keycloak`.
5. When SSO is disabled, the current dev-only web-token auth and local auth behavior remain unchanged.
```

That prompt drove the first major implementation wave. After the clarification that `gitAgent` may be DPU-aware, the architecture was simplified and part of the earlier capability-driven Git/DPU path was intentionally unwound.

## 3. Constraints That Shaped The Work

### 3.1 Architectural constraints

- Ploinky core must remain generic.
- `basic/keycloak` must be used as the first SSO provider implementation.
- Browser pending-auth/session state stays in core.
- Provider protocol logic stays in the provider agent runtime.
- `dpuAgent` is allowed to own secret authorization logic.

### 3.2 Security constraints

- no trusting raw forwarded user JSON
- delegated user identity must be signed by the router
- caller identity must be signed by the agent
- replay must be rejected
- request tampering must be rejected

### 3.3 Repo/process constraints

- branch name had to be the same across repos
- unrelated dirty state was not to be reverted
- generated artifacts were not to be committed
- [AGENTS.md](/Users/danielsava/work/file-parser/AGENTS.md) was not to be committed

## 4. Current Branch And Push State

The same branch name is used across all repos:

- `feature/capability-wire-sso`

Current pushed heads:

| Repo | Head | Summary | Pushed |
| --- | --- | --- | --- |
| root `file-parser` | `0348050` | docs: capture simplified dpu authority architecture | yes |
| `ploinky` | `46dfe07` | refactor: simplify routed agent auth relay | yes |
| `AssistOSExplorer` | `7c0e32c` | refactor: let dpu authorize git secret access | yes |
| `basic` | `d09eea7` | feat: expose keycloak as auth-provider | yes |
| `coralFlow` | `1141458` | chore: bind coral sso to basic providers | yes |

Important prior commits on the same branch:

| Repo | Commit | Summary |
| --- | --- | --- |
| root `file-parser` | `b3c93fb` | docs: capture current capability wire architecture |
| `ploinky` | `576c532` | refactor: add secure capability wire and pluggable sso |
| `AssistOSExplorer` | `09ae19a` | refactor: route git secrets through secret-store contract |

The branch is now published upstream in all five repos.

## 5. Current Architecture

## 5.1 Ploinky core

Ploinky currently owns:

- browser/session auth
- local auth and dev-only web-token auth fallback
- generic SSO bridge
- agent identity/key provisioning
- router ingress and agent MCP proxying
- issuance and verification helpers for signed user-context tokens

Ploinky should not decide:

- DPU grants
- DPU ACL rules
- DPU scope policy
- Git/DPU-specific authorization logic

## 5.2 `basic/keycloak`

`basic/keycloak` now provides the SSO provider runtime.

Ploinky core no longer owns:

- Keycloak realm URL construction
- Keycloak-specific claims parsing
- OIDC provider-specific protocol details

`basic/keycloak/manifest.json` also no longer declares an `identity` block. Its principal is derived by Ploinky as `agent:basic/keycloak`.

## 5.3 `gitAgent`

`gitAgent` is now intentionally DPU-aware again.

It:

- signs each DPU request with its own key
- forwards the router-signed delegated `user_context_token`
- calls DPU directly through the routed MCP path with a single signed JSON-RPC `tools/call`
- no longer depends on capability binding metadata for secret storage

`gitAgent/manifest.json` no longer declares `identity`, `capabilities`, or any other DPU-specific policy hook. The agent principal is derived by Ploinky as `agent:AssistOSExplorer/gitAgent`, and the maximum secret roles the agent may receive live entirely in DPU-owned `agentPolicies`.

## 5.4 `dpuAgent`

`dpuAgent` is now the authority for secret operations.

It verifies:

- caller assertion signature
- caller assertion audience and expiry
- caller assertion replay token
- caller assertion request hash
- delegated user token signature
- delegated user token expiry
- delegated user token audience against the immediate caller agent, not a broad shared audience

It enforces:

- caller/tool/scope policy
- secret ACLs and grants
- DPU-owned `agentPolicies[<principalId>].secrets.allowedRoles` as the ceiling for any agent-principal secret grant; grants to agent principals without a policy entry are rejected
- final authorization

DPU no longer loads agent manifests during grant validation and no longer accepts short-form agent aliases such as `agent:gitAgent`. Admins manage `agentPolicies` through the `dpu_agent_policy_get` / `dpu_agent_policy_set` tools.

The router no longer re-authorizes the Git/DPU call via capability bindings.

## 6. Current Secure Wire Model

The current simplified Git/DPU path uses two signed artifacts:

1. `x-ploinky-caller-assertion`
2. `x-ploinky-user-context`

### 6.1 `x-ploinky-user-context`

This is a router-signed delegated user token.

Purpose:

- prove the logged-in human user to downstream agents

Properties:

- minted by the router
- short-lived
- audience-pinned to the immediate caller agent that is allowed to forward it
- forwarded unchanged by `gitAgent`
- never minted by `gitAgent`

### 6.2 `x-ploinky-caller-assertion`

This is an agent-signed per-request assertion.

Purpose:

- prove the caller is `gitAgent`
- bind the proof to the request body/tool

Properties:

- signed by the agent private key
- contains `jti`
- short TTL
- includes request hash

### 6.3 Router behavior

The current router behavior for `/mcps/*` is:

- if a valid browser/user request arrives, treat it as a first-party routed call
- if a delegated agent request arrives, parse the JSON-RPC payload and verify the caller assertion plus forwarded user token before forwarding
- otherwise reject

The router no longer does the following for the Git/DPU path:

- capability-binding-based nested authorization
- provider alias resolution for Git secret calls
- delegated invocation-token minting for nested Git/DPU calls
- legacy `x-ploinky-auth-info` compatibility in this path

### 6.4 DPU verification sequence

DPU verifies, in order:

1. caller assertion signature using the caller agent public key
2. caller assertion audience/TTL
3. `jti` replay protection
4. request body hash
5. user-context token signature using the router public key
6. user-context token TTL and audience = caller assertion issuer
7. DPU-side tool/scope allowlist
8. DPU ACL/grant policy

## 7. Login And Secret Flows

## 7.1 Local login flow

Used in `testExplorer`.

1. Browser logs in through Ploinky local auth.
2. Ploinky creates the browser session.
3. When the browser calls a tool through the router, Ploinky can mint a short-lived delegated user token.
4. `gitAgent` receives the user token and, if it needs DPU, signs a caller assertion and forwards both headers.
5. DPU verifies both artifacts and authorizes or rejects the secret operation.

## 7.2 SSO login flow

Used in `testCoral`.

1. Browser starts `/auth/login`.
2. Ploinky core uses the generic auth bridge.
3. The bridge calls the bound `auth-provider/v1` provider in `basic/keycloak`.
4. `basic/keycloak` performs provider-specific OIDC work and returns normalized user data.
5. Ploinky creates the browser session and from then on issues the same normalized delegated user token shape to downstream agents.

The important boundary is:

- Keycloak-specific logic is in `basic/keycloak`
- Ploinky core only sees normalized provider-neutral identity data

## 7.3 GitHub token storage flow

Current flow after the simplification:

1. User completes GitHub auth in Explorer.
2. Browser calls `gitAgent` through the router.
3. Router authenticates the browser session and passes the request through.
4. `gitAgent` signs a direct JSON-RPC `tools/call` request for DPU.
5. `gitAgent` forwards the router-signed user token in `x-ploinky-user-context`.
6. DPU verifies both artifacts and confirms the user token audience matches `agent:AssistOSExplorer/gitAgent`.
7. DPU stores the GitHub token under its secret policy.

## 7.4 GitHub token retrieval flow

1. User triggers a Git action requiring the stored token.
2. Browser calls `gitAgent` through the router.
3. `gitAgent` issues a DPU `tools/call` request signed with its private key.
4. `gitAgent` forwards the delegated user token.
5. DPU verifies the call, checks the user token audience against `gitAgent`, and then checks grants/ACLs.
6. If authorized, DPU returns the secret material to `gitAgent`.
7. `gitAgent` uses the token for the Git operation.

## 8. Repo-By-Repo Implementation Summary

## 8.1 `ploinky`

Main outcomes:

- capability-driven runtime and generic SSO bridge landed in the first wave
- SSO provider binding moved into core without Keycloak-specific logic
- later simplification removed Git/DPU nested delegated authorization from the router

Important files:

- [ploinky/cli/server/RoutingServer.js](/Users/danielsava/work/file-parser/ploinky/cli/server/RoutingServer.js)
  - `/mcps/*` admission now defers delegated-call verification to the MCP proxy instead of relying on header presence
- [ploinky/cli/server/mcp-proxy/index.js](/Users/danielsava/work/file-parser/ploinky/cli/server/mcp-proxy/index.js)
  - verifies delegated direct `tools/call` requests before forwarding them
  - no longer performs Git/DPU delegated re-authorization
- [ploinky/cli/server/mcp-proxy/secureWire.js](/Users/danielsava/work/file-parser/ploinky/cli/server/mcp-proxy/secureWire.js)
  - now focuses on first-party helpers, delegated direct-call verification, and immediate-caller-scoped user-context tokens
- [ploinky/Agent/lib/runtimeWire.mjs](/Users/danielsava/work/file-parser/ploinky/Agent/lib/runtimeWire.mjs)
  - generic runtime-side verification for direct caller assertion + user-context headers
- [ploinky/Agent/lib/wireSign.mjs](/Users/danielsava/work/file-parser/ploinky/Agent/lib/wireSign.mjs)
  - caller assertions now include `jti`
- [ploinky/Agent/lib/wireVerify.mjs](/Users/danielsava/work/file-parser/ploinky/Agent/lib/wireVerify.mjs)
  - `jti` is mandatory; replay protection no longer silently degrades
- [ploinky/cli/services/docker/agentServiceManager.js](/Users/danielsava/work/file-parser/ploinky/cli/services/docker/agentServiceManager.js)
- [ploinky/cli/services/bwrap/bwrapServiceManager.js](/Users/danielsava/work/file-parser/ploinky/cli/services/bwrap/bwrapServiceManager.js)
  - inject agent key material and public-key registry
  - mount the private key at `/run/ploinky-agent.key` instead of `/tmp/ploinky-agent.key`
  - no longer inject provider/consumer capability binding env or the now-dead strict-wire env for the Git/DPU path
- [ploinky/cli/server/auth/genericAuthBridge.js](/Users/danielsava/work/file-parser/ploinky/cli/server/auth/genericAuthBridge.js)
- [ploinky/cli/server/auth/service.js](/Users/danielsava/work/file-parser/ploinky/cli/server/auth/service.js)
- [ploinky/cli/services/sso.js](/Users/danielsava/work/file-parser/ploinky/cli/services/sso.js)
- [ploinky/cli/commands/ssoCommands.js](/Users/danielsava/work/file-parser/ploinky/cli/commands/ssoCommands.js)
  - generic SSO provider selection and bridge logic

## 8.2 `AssistOSExplorer`

Main outcomes:

- `gitAgent` first moved to a generic `secret-store/v1` client
- then the Git/DPU path was simplified so `gitAgent` directly targets DPU again
- DPU now verifies the caller assertion and delegated user token itself

Important files:

- [AssistOSExplorer/gitAgent/lib/secret-store-client.mjs](/Users/danielsava/work/file-parser/AssistOSExplorer/gitAgent/lib/secret-store-client.mjs)
  - now acts as an explicit DPU-aware client
  - sends one signed JSON-RPC `tools/call` per DPU operation using raw `fetch`
  - no MCP SDK session is used for the DPU hop
  - no longer reads capability-binding env
- [AssistOSExplorer/gitAgent/manifest.json](/Users/danielsava/work/file-parser/AssistOSExplorer/gitAgent/manifest.json)
  - `requires.secretStore`, `identity`, and `capabilities` all removed
  - no DPU-specific policy remains in the manifest
- [AssistOSExplorer/dpuAgent/server/standalone-mcp-server.mjs](/Users/danielsava/work/file-parser/AssistOSExplorer/dpuAgent/server/standalone-mcp-server.mjs)
  - verifies direct caller assertion + user token path
- [AssistOSExplorer/dpuAgent/lib/dpu-store.mjs](/Users/danielsava/work/file-parser/AssistOSExplorer/dpuAgent/lib/dpu-store.mjs)
  - no longer depends on provider-binding env for Git/DPU secret authorization
  - delegated owner + agent-read resolves to effective write by design; agent grants do not downgrade owner rights
- [invocation-auth.mjs](/Users/danielsava/work/file-parser/ploinky/Agent/lib/invocation-auth.mjs)
  - shared runtime helper for reconstructing `authInfo` from verified invocation metadata
- [AssistOSExplorer/dpuAgent/tools/dpu_tool.mjs](/Users/danielsava/work/file-parser/AssistOSExplorer/dpuAgent/tools/dpu_tool.mjs)
  - reads only verified `metadata.invocation`; no legacy `metadata.authInfo` fallback remains
- [AssistOSExplorer/gitAgent/tools/git_tool.mjs](/Users/danielsava/work/file-parser/AssistOSExplorer/gitAgent/tools/git_tool.mjs)
  - reads only verified `metadata.invocation`; no legacy `metadata.authInfo` fallback remains

UI and browser-test support work:

- Explorer plugin discovery was fixed so the Git toolbar plugin renders reliably in the file explorer
- the Git modal repo-loading and identity-prefill bugs were fixed

## 8.3 `basic`

Main outcome:

- `basic/keycloak` is now the first `auth-provider/v1` implementation
- its manifest no longer declares a self-chosen principal; Ploinky derives `agent:basic/keycloak`

Important area:

- [basic/keycloak/runtime/index.mjs](/Users/danielsava/work/file-parser/basic/keycloak/runtime/index.mjs)

## 8.4 `coralFlow`

Main outcome:

- CoralFlow setup now binds SSO through `basic/keycloak`

This repo mainly exists here as a real deployment target to validate the SSO work from a browser.

## 8.5 root `file-parser`

Main outcome:

- architecture, implementation, and handoff docs were added here to keep cross-repo reasoning in one place

Important docs:

- [current-architecture-login-secret-flows.md](/Users/danielsava/work/file-parser/current-architecture-login-secret-flows.md)
- [dpu-authority-simplified-architecture-plan.md](/Users/danielsava/work/file-parser/dpu-authority-simplified-architecture-plan.md)
- [dpu-authority-simplified-implementation-plan.md](/Users/danielsava/work/file-parser/dpu-authority-simplified-implementation-plan.md)

## 9. Deployments And Browser-Test Workspaces

## 9.1 `testCoral`

Workspace:

- `/Users/danielsava/work/testCoral`

Purpose:

- browser-level validation of the new provider-agent SSO path

State achieved:

- CoralFlow deployed and reachable after a clean restart
- SSO works through `basic/keycloak`
- router listening again on `127.0.0.1:8080`
- Keycloak OIDC discovery confirmed after restart

Useful endpoints/credentials used during setup:

- app: `http://127.0.0.1:8080`
- dashboard: `http://127.0.0.1:8080/dashboard`
- Keycloak: `http://127.0.0.1:8180`
- test user: `sysadmin` / `coralAdmin`
- Keycloak admin: `admin` / `admin`

## 9.2 `testExplorer`

Workspace:

- `/Users/danielsava/work/testExplorer`

Purpose:

- browser-level validation of the Git/DPU path

Important current state:

- Explorer is reachable at `http://127.0.0.1:8088`
- local auth is used here, not SSO
- the stale capability binding `AssistOSExplorer/gitAgent:secretStore -> dpuAgent` was removed from `.ploinky/agents.json`
- `gitAgent` no longer needs `PLOINKY_CAPABILITY_BINDINGS_JSON`
- `dpuAgent` no longer needs `PLOINKY_PROVIDER_BINDINGS_JSON`
- both use `PLOINKY_AGENT_PUBLIC_KEYS_JSON`
- the DPU state was clean-reseeded with canonical `agentPolicies`
- workspace-only copies of `soplangAgent`, `webCli`, and `webAdmin` manifests were disabled so the router could start without unrelated broken agents
- the workspace was redeployed after the router-admission and immediate-caller-audience hardening changes

Credentials:

- `admin` / `admin`
- `user` / `user`

Live verification already performed:

- router health on `127.0.0.1:8088`
- authenticated `git_auth_status` through `router -> gitAgent -> dpuAgent`
- Git modal now shows repos and identity autofill logic behaves correctly after the fixes
- after the principal/policy cutover, a clean local-auth MCP session was established on `/mcps/gitAgent/mcp?agent=explorer`
- `git_auth_status` succeeded before token storage
- `git_auth_store_token` succeeded against the clean canonical DPU state
- a follow-up `git_auth_status` confirmed `connected: true` and `tokenStored: true`
- the temporary test token was then removed with `git_auth_disconnect`
- `node /Users/danielsava/work/file-parser/ploinky/cli/index.js deps prepare AssistOSExplorer/gitAgent` prepared the container cache path successfully
- the real runtime key derived in `testExplorer` was `container-linux-arm64-musl-node20`
- `deps status` then reported both:
  - `.ploinky/deps/global/container-linux-arm64-musl-node20`
  - `.ploinky/deps/agents/AssistOSExplorer/gitAgent/container-linux-arm64-musl-node20`
  as valid

## 10. Tests And Verification

Tests run during the session included:

- `node --check` on touched JS/MJS files in `ploinky`, `AssistOSExplorer`, and `basic`
- `node --test ploinky/tests/unit/secureWire.test.mjs`
- `node --test ploinky/tests/unit/runtimeWire.test.mjs`
- `node --test ploinky/tests/unit/capabilityRegistry.test.mjs`
- `node --test ploinky/tests/unit/genericAuthBridge.test.mjs`
- `node --test ploinky/tests/unit/ssoService.test.mjs`
- `node --test ploinky/tests/unit/dependencyRuntimeKey.test.mjs`
- `node --test ploinky/tests/unit/dependencyCache.test.mjs`
- `node --test ploinky/tests/unit/startupReadiness.test.mjs`
- `npm test` in [AssistOSExplorer/dpuAgent](/Users/danielsava/work/file-parser/AssistOSExplorer/dpuAgent)
- `node --test AssistOSExplorer/dpuAgent/tests/dpu-store.test.mjs`
- `node --test AssistOSExplorer/gitAgent/tests/unit/secretStoreClient.test.mjs`
- `node --test AssistOSExplorer/gitAgent/tests/unit/*.test.mjs`

Additional live verification:

- `testCoral` SSO browser flow works
- `testExplorer` Git/DPU flow works after redeploy
- authenticated `git_auth_status` succeeds through the routed path
- authenticated `git_auth_store_token` succeeds through the direct routed gitAgent MCP endpoint after a clean DPU reseed
- later hardening passes were unit-verified and redeployed to `testExplorer`
- `deps prepare` and `deps status` were smoke-tested in `testExplorer` against the container runtime path

## 11. Known Gaps / Remaining Work

These are the most relevant remaining items.

1. There are still legacy mentions of the earlier capability-heavy model in some docs and some non-Git/DPU code paths. Core current-state docs (DPU DS03/DS05/DS06, gitAgent DS05/DS06, Ploinky DS-capability-and-secure-wire) have been updated to the principal-derivation / DPU-owned-policy model; historical architecture-plan docs have not been rewritten.
2. `gitAgent/manifest.json` no longer carries `identity` or `capabilities`. Secret-role ceilings are now DPU-owned and managed via `dpu_agent_policy_get` / `dpu_agent_policy_set`. Existing `testExplorer`/`testCoral` workspaces need a clean reseed to pick up the canonical principal form; old persisted short-form principals will not resolve.
3. The secure-wire and capability-registry code still contain more machinery than the simplified Git/DPU architecture strictly needs.
4. Replay protection is currently in-process only:
   - router delegated replay cache is process-local
   - DPU direct-caller replay cache is process-local
   Clustering either component would require shared replay state.
5. Full browser-driven end-to-end negative-path tests for replay/forgery are still thinner than the unit coverage.
6. The DPU audit default is intentionally `disabled` on fresh state. This is documented in DPU specs and tests; do not treat it as an accidental regression unless product requirements change.
7. The aggregated router MCP endpoint (`/mcp`) still reaches hardened agents without a first-party invocation grant in at least one path. The validated live Git/DPU probe therefore used the direct routed endpoint (`/mcps/gitAgent/mcp?agent=explorer`) rather than the aggregated `/mcp` endpoint.
7. There is an unrelated local diff in `ploinky/globalDeps/package.json` (`achillesAgentLib` branch pin). Treat it as separate from the wire/SSO work unless explicitly requested.
8. The handoff branch is pushed, but the root `file-parser` repo still contains unrelated uncommitted local files outside this work. Do not blindly commit everything.

## 12. Debugging Map

If something breaks, start here.

### 12.1 Browser login / SSO

- [ploinky/cli/server/auth/service.js](/Users/danielsava/work/file-parser/ploinky/cli/server/auth/service.js)
- [ploinky/cli/server/auth/genericAuthBridge.js](/Users/danielsava/work/file-parser/ploinky/cli/server/auth/genericAuthBridge.js)
- [basic/keycloak/runtime/index.mjs](/Users/danielsava/work/file-parser/basic/keycloak/runtime/index.mjs)

### 12.2 Router admission / delegated header relay

- [ploinky/cli/server/RoutingServer.js](/Users/danielsava/work/file-parser/ploinky/cli/server/RoutingServer.js)
- [ploinky/cli/server/mcp-proxy/index.js](/Users/danielsava/work/file-parser/ploinky/cli/server/mcp-proxy/index.js)
- [ploinky/cli/server/mcp-proxy/secureWire.js](/Users/danielsava/work/file-parser/ploinky/cli/server/mcp-proxy/secureWire.js)

### 12.3 Agent signing / verification

- [ploinky/Agent/lib/wireSign.mjs](/Users/danielsava/work/file-parser/ploinky/Agent/lib/wireSign.mjs)
- [ploinky/Agent/lib/wireVerify.mjs](/Users/danielsava/work/file-parser/ploinky/Agent/lib/wireVerify.mjs)
- [ploinky/Agent/lib/runtimeWire.mjs](/Users/danielsava/work/file-parser/ploinky/Agent/lib/runtimeWire.mjs)
- [AssistOSExplorer/dpuAgent/server/standalone-mcp-server.mjs](/Users/danielsava/work/file-parser/AssistOSExplorer/dpuAgent/server/standalone-mcp-server.mjs)

### 12.4 Git secret storage / retrieval

- [AssistOSExplorer/gitAgent/lib/secret-store-client.mjs](/Users/danielsava/work/file-parser/AssistOSExplorer/gitAgent/lib/secret-store-client.mjs)
- [AssistOSExplorer/dpuAgent/lib/dpu-store.mjs](/Users/danielsava/work/file-parser/AssistOSExplorer/dpuAgent/lib/dpu-store.mjs)

### 12.5 Explorer UI Git behavior

- [AssistOSExplorer/explorer/utils/ide-plugins.mjs](/Users/danielsava/work/file-parser/AssistOSExplorer/explorer/utils/ide-plugins.mjs)
- [AssistOSExplorer/gitAgent/IDE-plugins/git-tool-button/components/git-commit-modal/git-commit-modal.js](/Users/danielsava/work/file-parser/AssistOSExplorer/gitAgent/IDE-plugins/git-tool-button/components/git-commit-modal/git-commit-modal.js)
- [AssistOSExplorer/gitAgent/IDE-plugins/git-tool-button/components/git-commit-modal/git-commit-modal-utils.js](/Users/danielsava/work/file-parser/AssistOSExplorer/gitAgent/IDE-plugins/git-tool-button/components/git-commit-modal/git-commit-modal-utils.js)

## 13. Immediate Next Steps For A New Session

If continuing implementation, the highest-signal next steps are:

1. Follow [principal-derivation-and-dpu-agent-policy-plan.md](/Users/danielsava/work/file-parser/principal-derivation-and-dpu-agent-policy-plan.md) to remove manifest `identity` and legacy `capabilities`.
2. Move agent secret-role ceilings fully into DPU-owned `agentPolicies`.
3. Keep [runtime-keyed-dependency-preparation-plan.md](/Users/danielsava/work/file-parser/runtime-keyed-dependency-preparation-plan.md) aligned with the implementation. The prepared-cache model now covers `bwrap`, `seatbelt`, and container runtimes, with container caches prepared in install containers and mounted read-only at runtime.
4. Add stronger browser-level negative tests for replay, tampering, and forged delegated headers, especially around the router’s delegated `tools/call` admission path.
5. If clustering ever becomes a requirement, replace in-process replay caches with shared state before claiming replay protection across replicas.
6. Keep `testExplorer` as the main live validation target for Git/DPU and dependency-runtime validation, and `testCoral` as the main live validation target for SSO.

This document reflects the current branch plus the latest uncommitted hardening changes in the working tree.
