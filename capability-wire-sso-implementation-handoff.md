# Capability Wire / SSO / Git-DPU Implementation Handoff

This document is the continuity pack for a new agentic session. It is intended to be sufficient context to continue implementation, debug regressions, or extend the refactor without replaying the full conversation history.

It covers:

- the original goals and invariants
- the implementation prompt used for the coding session
- the architectural decisions and the reasoning behind them
- the repo-by-repo implementation that was committed
- operational deployment/testing work done in local workspaces
- tests run, known gaps, and debugging entry points

Important:

- this handoff documents the committed implementation and the reasoning used during that implementation
- after the implementation, the architecture requirement was clarified: `gitAgent` may be explicitly coupled to `dpuAgent`; only `Ploinky core` must remain uncoupled
- the revised target architecture is documented in [dpu-authority-simplified-architecture-plan.md](/Users/danielsava/work/file-parser/dpu-authority-simplified-architecture-plan.md)
- where this handoff conflicts with that revised target, treat the new DPU-authority plan as the authoritative target for future refactoring

## 1. Scope

This work refactored the Ploinky/AssistOSExplorer stack so that:

1. Ploinky core becomes capability-driven instead of provider-name-driven.
2. `gitAgent` stops directly depending on `dpuAgent`.
3. inter-agent calls move to a router-mediated secure wire with signed assertions and signed provider-facing invocation grants.
4. SSO is implemented by a bound provider agent, using `basic/keycloak` as the first `auth-provider/v1`.
5. the existing dev/local auth paths remain available when SSO is disabled.

Superseded target note:

- item 2 reflects the earlier stronger target used during implementation
- the clarified target is now: `gitAgent` may directly depend on `dpuAgent`; only `Ploinky core` must remain agnostic

## 2. Original User Request and Invariants

The original request was effectively:

> Carefully analyze the code in `AssistOSExplorer/gitAgent`, `AssistOSExplorer/dpuAgent`, and `ploinky`, then design and implement a refactor so the following invariants hold:
>
> 0. OOP design principles like SOLID and DRY should be obeyed.
> 1. Ploinky must stop knowing about the specifics of `dpuAgent` or `gitAgent`. Any agent that keeps secrets behind `dpuAgent` should work the same way.
> 2. The wire between caller agent and capability agent must be secure against impersonation, forged user context, replay, and scope-creep.
> 3. SSO must be delivered by a Ploinky agent, not by code baked into Ploinky core. `ploinky enable sso` should wire in whichever agent the operator installs; Ploinky must not know Keycloak-specific concepts. When SSO is disabled, Ploinky’s current dev-only web-token auth stays as-is.

Additional clarification added during the session:

- there is already an existing provider in `basic/keycloak`
- the first `auth-provider/v1` implementation must be that existing `basic/keycloak` agent
- do not invent a separate `keycloakAgent`

Later clarification that supersedes the stronger earlier reading of invariant 1:

- `gitAgent` is allowed to be coupled to `dpuAgent`
- `dpuAgent` may own authentication, authorization, access control, and scopes for secret operations
- the decoupling requirement applies to `Ploinky core`, not necessarily to the `gitAgent <-> dpuAgent` pair

## 3. Claude Code Execution Prompt

This is the implementation prompt that was produced for Claude Code and used as the execution contract for the refactor:

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

Important constraints:
- Follow the repo’s AGENTS instructions.
- Preserve existing behavior unless the plan explicitly changes it.
- Make the implementation phased and coherent. If you need to add migration shims, do so exactly as described in the plan.
- Do not leave consumer-side DPU-specific code in `gitAgent` as the final architecture.
- Do not leave Keycloak-specific parsing or config logic in Ploinky core as the final architecture.
- Keep browser pending-auth state in core; keep provider protocol specifics inside the SSO provider agent.
- Use `basic/keycloak` as the first `auth-provider/v1` provider.
- Update docs/specs required by the touched subprojects.
- Add or update tests for the new capability registry, secure wire, migration behavior, and SSO bridge.

Execution instructions:
1. First, inspect the relevant code and map the exact files that need to change relative to the markdown plan.
2. Then implement the work in phases that keep the repo buildable:
   - shared capability/runtime additions
   - runtime decoupling from hardcoded providers
   - secure wire and verification
   - `gitAgent` migration to generic secret-store client
   - `basic/keycloak` extension to `auth-provider/v1`
   - core auth bridge
   - removal of legacy paths
3. After each major phase, run the most relevant tests.
4. At the end, run the broadest test set that is practical and summarize what passed, what failed, and any residual migration gaps.

Required deliverables:
- code changes implementing the plan
- updated docs/specs where required
- tests covering the new behavior
- a concise final summary listing:
  - major files changed
  - security properties now enforced
  - remaining migration shims, if any
  - exact tests run

If you find a direct conflict between the markdown plan and the current repo reality, do not silently improvise. Call out the conflict, explain the minimal adjustment, and continue with the closest implementation that preserves the plan’s intent.
```

## 4. Key Constraints and Assumptions

These constraints shaped the implementation:

### 4.1 Architectural constraints

- Ploinky core must be provider-neutral.
- `gitAgent` must consume a contract, not a concrete provider.
- the router is the trust mediator for inter-agent communication.
- browser pending-auth state remains in core.
- provider protocol logic lives in the provider agent runtime.

### 4.2 Security constraints

- no trusting raw forwarded user JSON for authorization
- protect against:
  - impersonation
  - forged user context
  - replay
  - request tampering
  - scope creep

### 4.3 Product/runtime constraints

- local/dev auth fallback must continue to work
- SSO can be enabled only if a provider agent is installed and bound
- existing deployments had to remain testable from the browser

### 4.4 Repo hygiene constraints

- branch name had to be the same across all repos
- unrelated dirty workspace state was not to be reverted
- generated artifacts such as `node_modules` were not to be committed

## 5. Final Branches and Commits

The same branch name was created in all affected repos:

- `feature/capability-wire-sso`

Committed revisions:

| Repo | Branch | Commit | Summary |
| --- | --- | --- | --- |
| root `file-parser` | `feature/capability-wire-sso` | `b3c93fb` | docs: capture current capability wire architecture |
| `ploinky` | `feature/capability-wire-sso` | `576c532` | refactor: add secure capability wire and pluggable sso |
| `AssistOSExplorer` | `feature/capability-wire-sso` | `09ae19a` | refactor: route git secrets through secret-store contract |
| `basic` | `feature/capability-wire-sso` | `d09eea7` | feat: expose keycloak as auth-provider |
| `coralFlow` | `feature/capability-wire-sso` | `1141458` | chore: bind coral sso to basic providers |

## 6. High-Level Implementation Summary

### 6.1 What was implemented

- capability registry in Ploinky core
- manifest-driven runtime resource planning
- agent keypair generation and launcher injection
- signed caller assertion flow
- router-issued signed invocation token flow
- provider-side invocation verification
- generic `secret-store/v1` consumer in `gitAgent`
- `secret-store/v1` provider implementation in `dpuAgent`
- provider-bound `auth-provider/v1` bridge in Ploinky
- `basic/keycloak` runtime implementation of `auth-provider/v1`
- CoralFlow updates to use `basic/keycloak`
- Explorer UI fixes needed to test the Git/DPU path in browser

### 6.2 What was not fully eliminated

- legacy auth compatibility shim still exists unless strict secure-wire mode is enabled
- `gitAgent/manifest.json -> capabilities.dpu.allowedRoles` remains as a DPU-side grant policy hook
- provider binding allowlist refresh is launcher-time, not hot-reloaded at runtime
- full end-to-end replay/forgery browser integration coverage is still thinner than the unit coverage

## 7. Major Design Decisions and Reasons

This section is the shortest path to understanding why the implementation looks the way it does.

### 7.1 Capability registry instead of provider-name branching

Decision:

- add `provides` and `requires`
- resolve actual provider bindings centrally in `ploinky/cli/services/capabilityRegistry.js`

Reason:

- removes hardcoded `dpuAgent`/`keycloak` branching from core
- lets consumers depend on a contract and alias instead of a provider name
- gives the router a single place to validate consumer/provider/binding compatibility

### 7.2 Router-mediated secure wire

Decision:

- the calling agent signs a caller assertion
- the router verifies it, resolves the live binding, then mints the provider-facing invocation token

Reason:

- the router is the only place that knows both the authenticated user session and the live workspace binding
- this closes impersonation and scope-creep problems better than peer-to-peer trust
- provider agents only need to trust the router public key, not each caller directly

### 7.3 Separate user context token from caller proof

Decision:

- user context is router-issued and forwarded
- caller proof is agent-signed

Reason:

- agents must not be able to mint arbitrary user identity
- the router remains the trust root for “who is the user”
- the agent remains accountable for “who is the caller”

### 7.4 Keep pending browser-auth state in core

Decision:

- `genericAuthBridge.js` stores pending browser-auth state
- provider runtime receives opaque `providerState`

Reason:

- callback integrity belongs at the HTTP boundary owned by core
- provider-specific PKCE/nonce logic still belongs in the provider runtime
- this keeps Ploinky provider-neutral while preserving correct browser flow handling

### 7.5 Move Keycloak specifics into `basic/keycloak/runtime`

Decision:

- delete core `keycloakClient.js`
- add `basic/keycloak/runtime/index.mjs`

Reason:

- Keycloak-specific URL construction, token verification, claim extraction, and role mapping should not live in core
- the same core path can later support another provider such as Okta or another OIDC implementation

### 7.6 Keep a best-effort grant from `gitAgent` to itself

Decision:

- `putStoredGitToken()` still best-effort calls `secret_grant(key, agent:gitAgent, read)`

Reason:

- this keeps current DPU access semantics working while the secret is still effectively user-owned
- it avoids breaking the existing agent-read pattern during transition
- it is not the cleanest final design, but it preserves compatibility with the current DPU ACL model

### 7.7 Add provider-side binding validation in DPU

Decision:

- DPU validates `binding_id`, consumer principal, and approved scopes against `PLOINKY_PROVIDER_BINDINGS_JSON`

Reason:

- the router is the primary policy gate, but the provider should still defend itself
- this catches mismatched bindings and provider misuse even if a request reaches the provider

### 7.8 Fix Explorer UI instead of treating browser failures as backend-only

Decision:

- patch plugin discovery, repo loading, and GitHub identity prefill in Explorer UI

Reason:

- the refactor needed real browser testing
- the Git/DPU path was being masked by frontend issues unrelated to the secure-wire changes
- without these fixes, the backend implementation could not be reliably validated in the UI

## 8. Repo-by-Repo Implementation

## 8.1 Root `file-parser`

Purpose:

- handoff and design documentation

Committed files:

- `current-architecture-login-secret-flows.md`
- `ploinky-capability-wire-sso-refactor-plan.md`

Reason:

- preserve the reviewed plan and the as-built architecture in repo-visible form

## 8.2 `ploinky`

### Implemented

1. Shared secure-wire libraries
   - `Agent/lib/toolEnvelope.mjs`
   - `Agent/lib/wireSign.mjs`
   - `Agent/lib/wireVerify.mjs`

2. Provider-neutral capability model
   - `cli/services/capabilityRegistry.js`
   - `cli/services/runtimeResourcePlanner.js`

3. Key management and launcher injection
   - `cli/services/agentKeystore.js`
   - `cli/services/docker/agentServiceManager.js`
   - `cli/services/bwrap/bwrapServiceManager.js`

4. Router secure-wire support
   - `cli/server/mcp-proxy/secureWire.js`
   - `cli/server/mcp-proxy/index.js`
   - `cli/server/RoutingServer.js`
   - `Agent/server/AgentServer.mjs`

5. Provider-neutral SSO bridge
   - `cli/server/auth/genericAuthBridge.js`
   - `cli/server/auth/service.js`
   - `cli/server/authHandlers.js`
   - `cli/commands/ssoCommands.js`
   - `cli/services/sso.js`

6. Dependency/help/status cleanup
   - `cli/services/bootstrapManifest.js`
   - `cli/services/workspaceDependencyGraph.js`
   - `cli/services/help.js`
   - `cli/services/status.js`
   - `cli/services/config.js`
   - `cli/services/workspaceUtil.js`

7. Deleted core Keycloak-specific files
   - `cli/server/auth/config.js`
   - `cli/server/auth/keycloakClient.js`

8. Docs/tests
   - `docs/specs/DS-capability-and-secure-wire.md`
   - `tests/unit/capabilityRegistry.test.mjs`
   - `tests/unit/genericAuthBridge.test.mjs`
   - `tests/unit/runtimeResourcePlanner.test.mjs`
   - `tests/unit/secureWire.test.mjs`
   - `tests/unit/secureWireDelegation.test.mjs`
   - `tests/unit/ssoService.test.mjs`
   - `tests/unit/workspaceDependencyGraph.test.mjs`

### Reasons behind the main file groups

- `capabilityRegistry.js`
  - central source of truth for `provides`, `requires`, bindings, and scope intersection
- `runtimeResourcePlanner.js`
  - replace provider-name-based storage/env injection with manifest-driven planning
- `agentKeystore.js`
  - every agent needs key material for caller assertions or invocation verification
- `secureWire.js`
  - router must verify assertions and mint provider-facing grants
- `genericAuthBridge.js`
  - SSO must be provider-neutral in core while still handling HTTP session concerns

## 8.3 `AssistOSExplorer`

### Implemented in `dpuAgent`

- added `provides["secret-store/v1"]` to `dpuAgent/manifest.json`
- added generic secret operation aliases to `dpuAgent/mcp-config.json`
- updated `dpuAgent/tools/dpu_tool.mjs` to consume invocation metadata
- updated `dpuAgent/server/standalone-mcp-server.mjs` to verify secure-wire inputs
- updated `dpuAgent/lib/dpu-store.mjs` to enforce:
  - invocation scope
  - provider binding allowlist
  - consumer principal match
  - approved-scope match
- updated `dpuAgent/lib/dpu-store-internal/storage.mjs`
  - aligned audit default behavior
  - confirmed secret map remains encrypted
- updated DPU docs and tests

Committed DPU files:

- `dpuAgent/docs/mcp-tools.html`
- `dpuAgent/docs/specs/DS05-runtime-and-mcp.md`
- `dpuAgent/lib/dpu-store-internal/storage.mjs`
- `dpuAgent/lib/dpu-store.mjs`
- `dpuAgent/manifest.json`
- `dpuAgent/mcp-config.json`
- `dpuAgent/server/standalone-mcp-server.mjs`
- `dpuAgent/tests/dpu-store.test.mjs`
- `dpuAgent/tools/dpu_tool.mjs`

### Implemented in `gitAgent`

- removed direct DPU client
  - deleted `gitAgent/lib/dpu-secret-client.mjs`
- added generic contract client
  - `gitAgent/lib/secret-store-client.mjs`
- updated GitHub auth to store/retrieve token via the contract client
  - `gitAgent/lib/github-auth.mjs`
- updated `gitAgent/tools/git_tool.mjs` to forward invocation/user-context metadata
- updated manifest to use `requires.secretStore`
- documented the new client contract

Committed Git files:

- `gitAgent/docs/execution-workflow.html`
- `gitAgent/docs/specs/DS01-agent-overview.md`
- `gitAgent/docs/specs/DS06-secret-store-v1-client.md`
- `gitAgent/lib/github-auth.mjs`
- `gitAgent/lib/secret-store-client.mjs`
- `gitAgent/manifest.json`
- `gitAgent/tests/unit/gitIdentityPrefill.test.mjs`
- `gitAgent/tools/git_tool.mjs`
- deleted `gitAgent/lib/dpu-secret-client.mjs`

### Implemented in `explorer`

- fixed plugin discovery so symlinked/local repo layouts still expose IDE plugins
- fixed Git modal to load repo overviews during the credentials gate
- fixed GitHub identity prefill when the modal is opened from the workspace root instead of a specific repo

Committed Explorer files:

- `explorer/tests/unit/idePluginsAggregation.test.js`
- `explorer/utils/ide-plugins.mjs`
- `gitAgent/IDE-plugins/git-tool-button/components/git-commit-modal/git-commit-modal-utils.js`
- `gitAgent/IDE-plugins/git-tool-button/components/git-commit-modal/git-commit-modal.js`

### Reasons behind the Explorer/UI changes

- without plugin discovery fixes, the Git button did not appear reliably in the deployed Explorer workspace
- without repo loading fixes, the Git modal could show a fake “Loading repositories…” state and hide the backend result
- without identity prefill fixes, the successful GitHub connection looked broken even when the backend had correct profile data

## 8.4 `basic`

Implemented:

- exposed `keycloak` as a capability provider for `auth-provider/v1`
- added `keycloak/runtime/index.mjs`
- updated `keycloak/manifest.json`

Committed files:

- `keycloak/manifest.json`
- `keycloak/runtime/index.mjs`

Reason:

- preserve provider neutrality in core while reusing the already existing Keycloak agent repo

## 8.5 `coralFlow`

Implemented:

- updated manifest/setup/deploy scripts to use `basic/keycloak` and `basic/postgres`
- aligned development setup with the new provider-bound SSO path

Committed files:

- `coral-agent/manifest.json`
- `coral-agent/scripts/deploy-development/startCoralDevel.sh`
- `coral-agent/scripts/setup/dev.sh`
- `coral-agent/scripts/setup/prod.sh`

Reason:

- CoralFlow was used as the real browser validation target for the new SSO architecture

## 9. Non-Committed Operational / Workspace Changes

These were used for testing and deployment but were not committed into the product repos.

### 9.1 `testCoral`

Workspace:

- `/Users/danielsava/work/testCoral`

Operational outcome:

- CoralFlow was deployed and reachable in browser
- SSO was verified working through the new provider-bound path

Notable workspace-side work performed during testing:

- local `.ploinky` workspace isolation so the deployment does not inherit `~/.ploinky`
- sync local `basic` and `coralFlow` sources into workspace repos
- stop conflicting workspaces that occupied router/database ports

Observed browser endpoints during validation:

- app: `http://127.0.0.1:8080`
- dashboard: `http://127.0.0.1:8080/dashboard`
- Keycloak: `http://127.0.0.1:8180`

### 9.2 `testExplorer`

Workspace:

- `/Users/danielsava/work/testExplorer`

Operational outcome:

- AssistOSExplorer deployed for browser testing of `gitAgent -> dpuAgent`
- Git plugin was made visible and usable
- GitHub login + repo listing + DPU-backed token path were exercised

Workspace-side changes during testing:

- capability binding in workspace config:
  - `AssistOSExplorer/gitAgent:secretStore -> AssistOSExplorer/dpuAgent`
- synced local `AssistOSExplorer` and `basic` sources into `.ploinky/repos`
- removed stale provider records from the workspace state when necessary
- created a real test git repo:
  - `/Users/danielsava/work/testExplorer/demo-repo`

Observed browser endpoint:

- Explorer: `http://127.0.0.1:8088`

## 10. Tests and Verification

### 10.1 Automated tests run

Ploinky:

- `node --test ploinky/tests/unit/secureWire.test.mjs`
- `node --test ploinky/tests/unit/capabilityRegistry.test.mjs`
- `node --test ploinky/tests/unit/secureWireDelegation.test.mjs`
- `node --test ploinky/tests/unit/genericAuthBridge.test.mjs`
- `node --test ploinky/tests/unit/ssoService.test.mjs`
- `node --test ploinky/tests/unit/runtimeResourcePlanner.test.mjs`

AssistOSExplorer:

- `npm test` in `AssistOSExplorer/dpuAgent`
- `node --test AssistOSExplorer/gitAgent/tests/unit/*.test.mjs`
- `node --test AssistOSExplorer/explorer/tests/unit/idePluginsAggregation.test.js`
- `node --test AssistOSExplorer/gitAgent/tests/unit/gitIdentityPrefill.test.mjs`

Syntax validation that was run during the work:

- `node --check` on touched JS/MJS files after major changes

### 10.2 Manual/browser verification done

- CoralFlow SSO login works through `basic/keycloak`
- Explorer local auth works in `testExplorer`
- Git plugin appears in the Explorer toolbar
- GitHub OAuth/device flow reaches connected state
- Git repo discovery works in the Git modal
- GitHub identity autofill was fixed in the modal
- `git_auth_status` successfully reaches the live `gitAgent -> router -> dpuAgent` path

## 11. Current Known Gaps / Follow-Up Targets

These are the most relevant follow-up items for a new session:

### 11.1 Still-open architectural debt

1. `gitAgent.manifest.json -> capabilities.dpu.allowedRoles`
   - still used by DPU as a provider-side grant cap
   - should eventually be replaced by a provider-neutral contract/policy model

2. legacy auth compatibility path
   - `x-ploinky-auth-info` and `_meta.auth` still exist for migration compatibility
   - strict mode can disable them, but they have not been fully deleted

3. provider binding allowlist refresh
   - provider allowlists come from launcher-injected `PLOINKY_PROVIDER_BINDINGS_JSON`
   - binding changes require a restart to refresh provider-side defensive checks

### 11.2 Testing gaps

1. no full browser/integration replay-attack harness
2. no full forged-caller end-to-end HTTP suite beyond current unit coverage
3. no broad multi-agent nested delegation test beyond current focused unit tests

### 11.3 Repo state intentionally left uncommitted

`ploinky` still has unrelated local changes or generated artifacts not included in the feature commit:

- `globalDeps/package.json`
- `globalDeps/package-lock.json`
- `globalDeps/node_modules/`
- `node_modules/`
- some extra untracked docs/scripts/test outputs

`AssistOSExplorer` still has unrelated untracked local files not included:

- `CLAUDE.md`
- `_analysis_repos/`
- `docs/analysis-explorer-agents.md`

The root repo also contains many unrelated dirty/untracked items that were not part of this feature work.

## 12. Debugging Map

If a future session needs to debug specific issues, start here:

### 12.1 Capability/binding resolution

- `ploinky/cli/services/capabilityRegistry.js`

Questions it answers:

- which provider is bound to a consumer alias
- which scopes are granted or denied
- what provider principal/route should be used

### 12.2 Agent env injection / runtime wiring

- `ploinky/cli/services/docker/agentServiceManager.js`
- `ploinky/cli/services/bwrap/bwrapServiceManager.js`
- `ploinky/cli/services/runtimeResourcePlanner.js`

Questions it answers:

- which env vars an agent receives
- whether router URL, keys, and bindings are available in the runtime
- where persistent storage mounts come from

### 12.3 Secure wire

- `ploinky/cli/server/mcp-proxy/secureWire.js`
- `ploinky/Agent/lib/wireSign.mjs`
- `ploinky/Agent/lib/wireVerify.mjs`
- `ploinky/Agent/server/AgentServer.mjs`

Questions it answers:

- why a caller assertion is rejected
- why an invocation token is rejected
- whether scope/binding/provider mismatch is happening

### 12.4 SSO core

- `ploinky/cli/server/auth/genericAuthBridge.js`
- `ploinky/cli/server/auth/service.js`
- `ploinky/cli/server/authHandlers.js`
- `ploinky/cli/commands/ssoCommands.js`
- `ploinky/cli/services/sso.js`

Questions it answers:

- which provider is bound to `workspace:sso`
- where browser pending state is stored
- why login/callback/logout/token refresh succeeds or fails

### 12.5 Keycloak provider runtime

- `basic/keycloak/runtime/index.mjs`

Questions it answers:

- OIDC discovery
- PKCE and nonce handling
- token exchange
- JWT verification
- role extraction and normalized user mapping

### 12.6 Git token storage and retrieval

- `AssistOSExplorer/gitAgent/lib/github-auth.mjs`
- `AssistOSExplorer/gitAgent/lib/secret-store-client.mjs`
- `AssistOSExplorer/gitAgent/tools/git_tool.mjs`
- `AssistOSExplorer/dpuAgent/tools/dpu_tool.mjs`
- `AssistOSExplorer/dpuAgent/lib/dpu-store.mjs`
- `AssistOSExplorer/dpuAgent/lib/dpu-store-internal/storage.mjs`

Questions it answers:

- where GitHub metadata is stored
- where the actual token is stored
- why a `secret_get` or `secret_put` failed
- whether failure is in gitAgent, router, or DPU

### 12.7 Explorer Git modal/UI

- `AssistOSExplorer/explorer/utils/ide-plugins.mjs`
- `AssistOSExplorer/gitAgent/IDE-plugins/git-tool-button/components/git-commit-modal/git-commit-modal.js`
- `AssistOSExplorer/gitAgent/IDE-plugins/git-tool-button/components/git-commit-modal/git-commit-modal-utils.js`

Questions it answers:

- why the Git plugin button does not appear
- why repos do not load in the modal
- why GitHub identity does not prefill

## 13. Useful Local Artifacts During Debugging

These artifacts are useful when debugging the live system:

- root architecture docs:
  - `current-architecture-login-secret-flows.md`
  - `ploinky-capability-wire-sso-refactor-plan.md`
- Explorer GitHub state:
  - `/Users/danielsava/work/testExplorer/.ploinky/state/git-agent-github-auth.json`
- workspace routing state:
  - `<workspace>/.ploinky/routing.json`
- router/watchdog logs:
  - `<workspace>/.ploinky/logs/router.log`
  - `<workspace>/.ploinky/logs/watchdog.log`

## 14. Recommended Next Steps for a New Session

If continuing feature work, the best next tasks are:

1. remove the last DPU-specific grant-policy dependency from `gitAgent.manifest.json`
2. delete the legacy auth compatibility path under strict secure-wire rollout
3. add end-to-end replay/forgery/scope denial integration tests
4. add hot-reload or runtime refresh for provider binding allowlists if operationally needed
5. broaden browser-driven tests for GitHub auth and downstream git operations using the stored token

## 15. Short Summary

The implementation achieved the main architectural shift:

- Ploinky core is now capability-driven and provider-neutral for SSO
- the wire is router-mediated and signed
- `gitAgent` uses a generic `secret-store/v1` client instead of a DPU-specific client
- `dpuAgent` serves that contract and enforces both scope and binding constraints
- `basic/keycloak` now owns the provider-specific SSO logic
- CoralFlow and AssistOSExplorer were deployed and used to validate the changes from the browser

The main remaining work is cleanup and hardening, not establishing the architecture itself.
