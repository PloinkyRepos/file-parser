# Principal Derivation And DPU Agent Policy Plan

This document defines the next simplification step for the current branch.

It assumes:

- no backward compatibility
- no migration shims
- no support for legacy short-form agent principals such as `agent:gitAgent`
- no support for manifest-declared agent identity
- no support for manifest-declared DPU secret-role ceilings

## 1. Goal

Remove `identity` and legacy `capabilities` from agent manifests, make Ploinky the only component that derives agent principals, and move agent secret-role ceilings fully into DPU-owned policy.

## 2. Target End State

### 2.1 Principal ownership

Ploinky derives every agent principal from the installed agent ref:

- `agentRef = <repo>/<agent>`
- `principalId = agent:<repo>/<agent>`

Examples:

- `agent:AssistOSExplorer/gitAgent`
- `agent:AssistOSExplorer/dpuAgent`
- `agent:basic/keycloak`

No manifest overrides this.

### 2.2 Manifest shape

Affected manifests no longer contain:

- `identity`
- legacy `capabilities`

`basic/keycloak` keeps `provides["auth-provider/v1"]` because Ploinky core still needs a generic SSO provider contract.

`dpuAgent` no longer advertises `provides["secret-store/v1"]` because the Git/DPU path is now explicitly DPU-aware and no longer provider-neutral.

`gitAgent` no longer declares any DPU-specific policy in its manifest.

### 2.3 DPU-owned policy

DPU becomes the only place that stores the maximum secret roles an agent may receive.

That policy moves into DPU state, keyed by canonical principal:

```json
{
  "agentPolicies": {
    "agent:AssistOSExplorer/gitAgent": {
      "secrets": {
        "allowedRoles": ["read"]
      }
    }
  }
}
```

No code reads:

- `manifest.capabilities.dpu.allowedRoles`
- `manifest.permissions.secrets.allowedRoles`

for agent secret-role ceilings anymore.

### 2.4 No short-form aliases

The system stops treating these as equivalent:

- `agent:gitAgent`
- `agent:AssistOSExplorer/gitAgent`

Only the canonical principal survives.

Agent principal resolution in DPU must rely on:

- `authInfo.agent.principalId`
- explicit canonical entries in the DPU identity/policy store

not on short names or manifest-derived identity.

## 3. Non-Goals

This plan does not try to:

- redesign the remaining generic SSO capability system
- add clustered replay-cache storage
- preserve existing DPU permissions manifests or test workspace state

If existing state uses old principal names, the supported answer is reset/reseed, not compatibility logic.

## 4. Workstreams

## 4.1 Centralize Principal Derivation In Ploinky

Create one Ploinky helper as the canonical source of agent principals.

Suggested new file:

- `ploinky/cli/services/agentIdentity.js`

Suggested API:

- `deriveAgentRef(repoName, agentName) -> "<repo>/<agent>"`
- `deriveAgentPrincipalId(repoName, agentName) -> "agent:<repo>/<agent>"`

Use it in:

- `ploinky/cli/services/capabilityRegistry.js`
- `ploinky/cli/services/docker/agentServiceManager.js`
- `ploinky/cli/services/bwrap/bwrapServiceManager.js`
- any test helpers currently hardcoding short principals

Rules:

- delete reads of `manifest.identity.principalId`
- do not keep a fallback to `agent:<agentName>`
- do not support manifest identity overrides

Result:

- Ploinky computes one canonical principal everywhere
- key generation and env injection become deterministic

## 4.2 Remove Manifest Identity

Delete the `identity` block from:

- `AssistOSExplorer/gitAgent/manifest.json`
- `AssistOSExplorer/dpuAgent/manifest.json`
- `basic/keycloak/manifest.json`

If other manifests gain `identity` later, that should be treated as invalid architecture unless explicitly reintroduced for a new reason.

## 4.3 Remove Legacy Manifest Capabilities

Delete the legacy `capabilities` block from:

- `AssistOSExplorer/gitAgent/manifest.json`
- `AssistOSExplorer/dpuAgent/manifest.json`

Specifically:

- remove `gitAgent.capabilities.dpu.allowedRoles`
- remove `dpuAgent.capabilities.dpu.platform.*`

`dpuAgent` already has `runtime.resources` for the platform/runtime declaration, so the legacy `capabilities.dpu.platform` block is duplicate data and should be deleted.

## 4.4 Remove Manifest-Driven Secret Policy

Update DPU so agent secret-role ceilings no longer come from agent manifests.

Primary file:

- `AssistOSExplorer/dpuAgent/lib/dpu-store.mjs`

Current behavior to delete:

- `assertAgentSecretGrantAllowed()` loads the target agent manifest
- reads `capabilities.dpu.allowedRoles`
- falls back to `permissions.secrets.allowedRoles`

Target behavior:

- `assertAgentSecretGrantAllowed()` reads only DPU-owned policy for the canonical principal
- if no DPU policy exists for that agent principal, reject the grant

No manifest lookup should remain in this path.

## 4.5 Add DPU-Owned Agent Policy Storage

Extend the DPU permissions/policy model.

Primary file:

- `AssistOSExplorer/dpuAgent/lib/dpu-store-internal/permissions-manifest.mjs`

Add a new top-level section:

```json
{
  "version": 1,
  "identities": { "principals": {} },
  "permissions": { "secrets": {}, "objects": {} },
  "agentPolicies": {}
}
```

Proposed schema:

```json
{
  "agentPolicies": {
    "agent:<repo>/<agent>": {
      "secrets": {
        "allowedRoles": ["read", "write"]
      },
      "updatedAt": "<iso timestamp>"
    }
  }
}
```

Add helpers such as:

- `normalizeAgentPolicies(...)`
- `getAgentPolicy(manifest, principalId)`
- `setAgentAllowedRoles(manifest, principalId, roles)`

Use this as the only source of truth for agent secret ceilings.

## 4.6 Expose DPU Policy Through DPU, Not Through Agent Manifests

Because option 2 is a DPU-owned config surface, DPU should expose policy management explicitly.

Add admin-only tools:

- `dpu_agent_policy_get`
- `dpu_agent_policy_set`

Affected files:

- `AssistOSExplorer/dpuAgent/tools/dpu_tool.mjs`
- `AssistOSExplorer/dpuAgent/mcp-config.json`
- `AssistOSExplorer/dpuAgent/lib/dpu-store.mjs`

Authorization:

- admin/security only

Behavior:

- `get` returns the stored policy for a canonical agent principal
- `set` replaces the allowed secret roles for that agent principal

This makes the policy operator-visible without reintroducing manifest coupling.

## 4.7 Remove Agent-Name Alias Logic From DPU Principal Resolution

DPU still carries short-name agent identity shortcuts.

Files to simplify:

- `AssistOSExplorer/dpuAgent/lib/dpu-store-internal/permissions-manifest.mjs`
- `AssistOSExplorer/dpuAgent/lib/dpu-store-internal/identity-acl.mjs`
- `AssistOSExplorer/dpuAgent/lib/dpu-store.mjs`

Remove or stop relying on:

- `aliases.agentNames`
- `agentName -> agent:<agentName>` fallback
- short-form principal candidate generation like `agent:${actor.agentName}`

Target rule:

- the canonical agent principal is `authInfo.agent.principalId`
- DPU ACL/policy resolution uses that value directly

`agent.name` may still exist as display metadata, but not as an authorization identity.

## 4.8 Canonical Principal Cutover Everywhere

Replace short principals with canonical principals in code, tests, docs, and workspace assumptions.

Main examples:

- `agent:gitAgent` -> `agent:AssistOSExplorer/gitAgent`
- `agent:dpuAgent` -> `agent:AssistOSExplorer/dpuAgent`
- `agent:keycloak` or ad hoc short forms -> `agent:basic/keycloak`

Likely affected files:

- `AssistOSExplorer/gitAgent/lib/secret-store-client.mjs`
- `AssistOSExplorer/gitAgent/tests/unit/secretStoreClient.test.mjs`
- `AssistOSExplorer/dpuAgent/tests/dpu-store.test.mjs`
- `ploinky/tests/unit/runtimeWire.test.mjs`
- `ploinky/tests/unit/secureWire.test.mjs`
- `ploinky/tests/unit/capabilityRegistry.test.mjs`
- `ploinky/tests/unit/genericAuthBridge.test.mjs`
- `ploinky/tests/unit/ssoService.test.mjs`
- root architecture docs and handoff docs

No alias compatibility should be kept.

## 4.9 Remove Unused Secret-Store Capability Metadata From Ploinky

The simplified Git/DPU architecture no longer needs provider-neutral secret-store metadata in core.

That means:

- remove `dpuAgent.provides["secret-store/v1"]` from `AssistOSExplorer/dpuAgent/manifest.json`
- prune secret-store-specific tests/docs from the capability-registry layer where they are only historical

Keep:

- `auth-provider/v1`

Do not break:

- `basic/keycloak`
- `ploinky sso enable`
- `workspace:sso` binding

## 5. File-By-File Plan

## 5.1 `ploinky`

Change:

- `cli/services/capabilityRegistry.js`
  - add/consume central principal derivation helper
  - stop reading `manifest.identity`
  - keep `provides/requires` support only for still-live generic contracts

- `cli/services/docker/agentServiceManager.js`
  - derive principal from repo/agent
  - stop reading `manifest.identity.principalId`

- `cli/services/bwrap/bwrapServiceManager.js`
  - same change as Docker launcher

- `tests/unit/capabilityRegistry.test.mjs`
  - remove manifest identity assumptions
  - update expected principals to `agent:<repo>/<agent>`

- `tests/unit/runtimeWire.test.mjs`
- `tests/unit/secureWire.test.mjs`
- `tests/unit/genericAuthBridge.test.mjs`
- `tests/unit/ssoService.test.mjs`
  - update principals to canonical `agent:<repo>/<agent>`

Potential new file:

- `cli/services/agentIdentity.js`

## 5.2 `AssistOSExplorer/gitAgent`

Change:

- `manifest.json`
  - remove `identity`
  - remove `capabilities`

- `lib/secret-store-client.mjs`
  - change default DPU principal to `agent:AssistOSExplorer/dpuAgent`
  - update comments/examples

- `tests/unit/secretStoreClient.test.mjs`
  - update principal fixtures

- any docs that still describe:
  - `requires.secretStore`
  - manifest secret role ceilings
  - short-form `agent:gitAgent`

## 5.3 `AssistOSExplorer/dpuAgent`

Change:

- `manifest.json`
  - remove `identity`
  - remove legacy `capabilities`
  - remove `provides["secret-store/v1"]`

- `lib/dpu-store-internal/permissions-manifest.mjs`
  - add `agentPolicies`
  - remove agent-name alias dependence from principal resolution

- `lib/dpu-store-internal/identity-acl.mjs`
  - stop deriving agent principals from `agentName`

- `lib/dpu-store.mjs`
  - remove manifest lookup for allowed roles
  - read only DPU-owned `agentPolicies`

- `tools/dpu_tool.mjs`
- `mcp-config.json`
  - add `dpu_agent_policy_get/set`

- `tests/dpu-store.test.mjs`
  - replace manifest-based role ceilings with DPU policy fixtures
  - update all short agent principals to canonical principals

## 5.4 `basic/keycloak`

Change:

- `manifest.json`
  - remove `identity`
  - keep `provides["auth-provider/v1"]`

Tests/docs using fake provider principals should switch to canonical forms such as:

- `agent:fake/fakeProvider`

instead of short names.

## 5.5 Root docs

Update:

- `capability-wire-sso-implementation-handoff.md`
- `current-architecture-login-secret-flows.md`
- `dpu-authority-simplified-architecture-plan.md`
- `dpu-authority-simplified-implementation-plan.md`

Add this document to the related-docs set in the handoff.

## 6. Documentation Updates Required

## 6.1 Ploinky docs

Update:

- `ploinky/docs/specs/DS-capability-and-secure-wire.md`

Reflect:

- Ploinky derives principals, manifests do not
- canonical principal format is `agent:<repo>/<agent>`
- `auth-provider/v1` remains live
- Git/DPU no longer relies on provider-neutral secret-store capability metadata

## 6.2 DPU docs

Update:

- `AssistOSExplorer/dpuAgent/docs/specs/DS03-secrets-model.md`
- `AssistOSExplorer/dpuAgent/docs/specs/DS05-runtime-and-mcp.md`
- `AssistOSExplorer/dpuAgent/docs/specs/DS06-secrets-product-model.md`

Reflect:

- agent principals are canonical `agent:<repo>/<agent>`
- DPU secret ceilings come from DPU-owned `agentPolicies`
- agent manifests no longer declare allowed secret roles

## 6.3 Git docs

Update:

- `AssistOSExplorer/gitAgent/docs/specs/DS05-Security-Auth-and-Operational-Validation.md`
- `AssistOSExplorer/gitAgent/docs/specs/DS06-secret-store-v1-client.md`
- `AssistOSExplorer/gitAgent/docs/execution-workflow.html`

Reflect:

- `gitAgent` no longer declares identity or allowed secret roles in its manifest
- DPU principal is canonical `agent:AssistOSExplorer/dpuAgent`
- the DPU hop is explicit and direct

## 7. Test And Workspace Plan

## 7.1 Automated tests

Run at minimum:

- `node --test ploinky/tests/unit/runtimeWire.test.mjs`
- `node --test ploinky/tests/unit/secureWire.test.mjs`
- `node --test ploinky/tests/unit/capabilityRegistry.test.mjs`
- `node --test ploinky/tests/unit/genericAuthBridge.test.mjs`
- `node --test ploinky/tests/unit/ssoService.test.mjs`
- `node --test AssistOSExplorer/dpuAgent/tests/dpu-store.test.mjs`
- `node --test AssistOSExplorer/gitAgent/tests/unit/*.test.mjs`

## 7.2 Live workspaces

Because there is no migration or backward compatibility:

- reset/reseed `testExplorer` DPU state if it contains old short principals
- reinstall `gitAgent` and `dpuAgent`
- reinstall/restart `basic/keycloak` if needed in `testCoral`

Supported approach:

- clean workspace state
- clean redeploy

Not supported:

- keeping old persisted ACL/policy data and expecting it to resolve automatically

## 8. Recommended Execution Order

1. Add central principal derivation in Ploinky.
2. Update tests to canonical principals.
3. Remove manifest `identity` from all affected manifests.
4. Remove manifest `capabilities` from `gitAgent` and `dpuAgent`.
5. Remove `dpuAgent.provides["secret-store/v1"]`.
6. Add `agentPolicies` to DPU and switch grant validation to it.
7. Add DPU admin policy tools.
8. Remove agent-name alias logic in DPU.
9. Update docs.
10. Reset/redeploy `testExplorer` and `testCoral`.

## 9. Acceptance Criteria

The change is complete when all of the following are true:

1. No affected manifest contains `identity`.
2. No affected manifest contains legacy `capabilities`.
3. Ploinky no longer reads `manifest.identity.principalId`.
4. All agent principals are derived as `agent:<repo>/<agent>`.
5. No Git/DPU code uses short principals like `agent:gitAgent`.
6. DPU does not read agent manifests to determine secret-role ceilings.
7. DPU stores and enforces agent secret ceilings only through DPU-owned policy.
8. `basic/keycloak` still works as `auth-provider/v1`.
9. `testExplorer` still exercises the Git/DPU path after a clean redeploy.
10. `testCoral` still exercises the SSO path after a clean redeploy.
