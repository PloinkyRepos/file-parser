# Runtime-Keyed Dependency Preparation Plan

This document defines the next dependency-management refactor for Ploinky.

It is intentionally aligned with the current architectural direction:

- normal agent startup must not run `npm install`
- dependency preparation is a separate concern from runtime boot
- shared dependencies come from `ploinky/globalDeps/package.json`
- agent-specific dependencies still remain agent-specific
- the design must support `bwrap` first, without blocking later `seatbelt`
- runtime artifacts must be keyed by the environment that will actually run them

## 1. Goal

Replace startup-time dependency installation with prepared dependency caches,
keyed by runtime environment, and mounted into agents at runtime.

The current branch now implements this model for:

- `bwrap`
- `seatbelt`
- container runtimes

The design still needs to remain extensible without redesigning the cache model.

## 2. Why This Change Is Needed

The current startup-time install path is fragile because it mixes build-time and
runtime responsibilities.

Current problems:

1. Agent boot currently performs dependency work.
2. Startup depends on network/package-registry/GitHub availability.
3. Startup can fail because `git`, `ssh`, build tools, or credentials are not available.
4. Restarts can re-trigger expensive installs.
5. Global dependencies are conceptually shared, but are still prepared in an
   ad hoc per-agent startup path.
6. Runtime environments differ:
   - `bwrap` runs on host Linux
   - `seatbelt` runs on host macOS
   - containers run in container Linux
   so one universal `node_modules` tree is not a safe assumption.

The problem is not “installing in a container is bad.”

The problem is:

- installing during normal startup is bad

and:

- dependency artifacts need to match the runtime that will execute them.

## 3. Core Design

## 3.1 Shared model, runtime-specific artifacts

Dependency declarations stay shared.

Prepared dependency artifacts become runtime-specific.

That means:

- one logical dependency graph
- many prepared caches, one per runtime key

## 3.2 Runtime key

Prepared artifacts are keyed by the actual execution environment:

```text
<runtime-family>-<os>-<arch>-node<major>
```

Examples:

- `bwrap-linux-x64-node20`
- `seatbelt-darwin-arm64-node20`
- `container-linux-x64-node20`

Container runtimes now use an optional Linux libc variant segment when needed:

- `container-linux-x64-musl-node20`
- `container-linux-x64-glibc-node20`

Image fingerprinting can still be added later if libc is not specific enough.

## 3.3 Prepare phase, not runtime phase

Normal startup must:

- verify cache availability and validity
- mount/use prepared artifacts
- never opportunistically run `npm install`

Dependency installation must happen in:

- an explicit prepare step
- or a pre-start prepare phase that is separate from the runtime process

The agent runtime itself must only consume prepared deps.

## 4. Source Of Truth

## 4.1 Global dependencies

The only source of truth for shared deps is:

- `ploinky/globalDeps/package.json`

Not:

- `ploinky/node_modules`

`ploinky/node_modules` contains CLI/runtime implementation dependencies and must
not become the canonical source of agent-global dependencies.

## 4.2 Agent-specific dependencies

Each agent may also declare its own dependencies via:

- `<agent>/package.json`

The prepared dependency tree for an agent is the merge of:

1. `ploinky/globalDeps/package.json`
2. `<agent>/package.json` if present

## 5. Cache Layout

Use explicit prepared cache directories under `.ploinky`.

Suggested layout:

```text
.ploinky/
  deps/
    global/
      <runtime-key>/
        package.json
        node_modules/
        stamp.json
    agents/
      <repo>/
        <agent>/
          <runtime-key>/
            package.json
            node_modules/
            stamp.json
```

Where:

- `global/<runtime-key>/` contains prepared artifacts for `globalDeps/package.json`
- `agents/<repo>/<agent>/<runtime-key>/` contains the merged per-agent prepared tree

## 6. Stamp Format

Each prepared cache gets a deterministic stamp file.

Suggested fields:

```json
{
  "version": 1,
  "runtimeKey": "bwrap-linux-x64-node20",
  "preparedAt": "2026-04-20T18:00:00.000Z",
  "globalPackageHash": "<sha256>",
  "agentPackageHash": "<sha256 or null>",
  "mergedPackageHash": "<sha256>",
  "installer": {
    "runtimeFamily": "bwrap",
    "nodeMajor": 20,
    "platform": "linux",
    "arch": "x64"
  }
}
```

Cache validity requires:

- stamp exists
- runtime key matches
- merged package hash matches current inputs
- required modules exist in `node_modules`

## 7. Runtime Key Detection

## 7.1 `bwrap`

Use the host runtime because the agent executes on the host.

Inputs:

- `runtimeFamily = bwrap`
- `os = process.platform`
- `arch = process.arch`
- `nodeMajor = process.versions.node.split('.')[0]`

## 7.2 `seatbelt`

Same rule as `bwrap`.

Inputs:

- `runtimeFamily = seatbelt`
- host `platform`
- host `arch`
- host `nodeMajor`

## 7.3 Container runtimes

Do not derive from the manifest alone.

Derive from the actual image/runtime environment, for example:

- image probe
- image inspect
- `node -p` inside a tiny probe container

Initial implementation can defer this because phase 1 targets `bwrap`.

## 8. Prepare Flows

## 8.1 Global prepare flow

Input:

- `runtimeKey`
- `ploinky/globalDeps/package.json`

Steps:

1. Compute `globalPackageHash`.
2. Check `.ploinky/deps/global/<runtimeKey>/stamp.json`.
3. If valid, reuse cache.
4. If invalid/missing:
   - create cache dir
   - install dependencies in the environment matching `runtimeKey`
   - write `package.json`
   - populate `node_modules`
   - write `stamp.json`

## 8.2 Agent prepare flow

Input:

- `runtimeKey`
- global prepared cache
- agent package.json if present

Steps:

1. Build merged package.json.
2. Compute `mergedPackageHash`.
3. Check `.ploinky/deps/agents/<repo>/<agent>/<runtimeKey>/stamp.json`.
4. If valid, reuse cache.
5. If invalid/missing:
   - create agent cache dir
   - seed from global prepared cache
   - if agent has its own deps, install merged tree in matching environment
   - write merged `package.json`
   - write `stamp.json`

## 8.3 Runtime startup flow

For every agent start:

1. Determine runtime key.
2. Ensure prepared deps exist for that agent/runtime key.
3. Mount or expose prepared `node_modules` into the runtime path.
4. Start the agent process.

No `npm install` runs in the normal startup path.

## 9. First Implementation Scope

## 9.1 Phase 1: `bwrap` only

Implement the full cache model for `bwrap`.

That means:

- runtime-key detection for `bwrap`
- global cache preparation
- per-agent merged cache preparation
- runtime startup uses prepared deps only
- no automatic runtime install in `bwrap` path

## 9.2 Phase 2: `seatbelt`

Reuse the same cache model with:

- `seatbelt` runtime key
- host-macOS preparation backend
- runtime mounts/sandbox paths updated to use prepared caches

## 9.3 Phase 3: containers

Reuse the same cache model with:

- container runtime key
- install/prep in dedicated install container
- runtime containers mount prepared caches only

## 10. Required Code Changes

## 10.1 New Ploinky module: runtime key detection

Add:

- `ploinky/cli/services/dependencyRuntimeKey.js`

Suggested API:

- `detectHostRuntimeKey(runtimeFamily)`
- `detectContainerRuntimeKey(image, runtime)`
- `detectRuntimeKeyForAgent(manifest, repoName, agentName)`

## 10.2 New Ploinky module: prepared cache management

Add:

- `ploinky/cli/services/dependencyCache.js`

Suggested responsibilities:

- cache path resolution
- stamp read/write
- hash calculation
- cache validation
- global cache prepare
- agent cache prepare

## 10.3 Refactor `dependencyInstaller.js`

`dependencyInstaller.js` currently mixes:

- package merge
- host sync
- container install
- startup-time install snippets

Refactor it into:

1. package merge helpers
2. explicit preparation backends
3. cache validation helpers

Target removals:

- normal startup dependence on `buildEntrypointInstallScript()`
- routine install-on-boot behavior

Target retained pieces:

- merged package generation
- hash/stamp logic
- explicit install backend helpers

## 10.4 `bwrapServiceManager.js`

Update `bwrap` startup to:

1. detect runtime key
2. prepare global cache if needed
3. prepare agent cache if needed
4. point runtime `NODE_PATH` / mounted `node_modules` at prepared cache
5. start the agent without runtime install

## 10.5 `seatbeltServiceManager.js`

Do not fully implement in phase 1, but align the interface:

- same runtime-key API
- same cache-path API
- same startup contract

This prevents a later redesign.

## 10.6 `docker/agentServiceManager.js`

For phase 1:

- stop saying generic “falling back to container” in logs
- make fallback runtime explicit (`podman` first, then `docker`)

For later phases:

- replace runtime install behavior with prepared cache mount behavior

## 10.7 `docker/common.js`

Expose:

- preferred container runtime detection
- runtime family naming helpers

Likely keep:

- `podman` preferred over `docker`

## 11. Data Flow After Refactor

For a `bwrap` agent:

1. Read `ploinky/globalDeps/package.json`
2. Read `<agent>/package.json` if present
3. Detect runtime key, e.g. `bwrap-linux-x64-node20`
4. Ensure `.ploinky/deps/global/<runtimeKey>/` exists
5. Ensure `.ploinky/deps/agents/<repo>/<agent>/<runtimeKey>/` exists
6. Expose prepared `node_modules` to runtime
7. Start the agent

The agent process itself never performs package installation.

## 12. Handling Global Vs Agent-Specific Dependencies

## 12.1 Global

Prepared once per runtime key.

Shared across agents.

## 12.2 Agent-specific

Prepared per agent per runtime key.

They still remain agent-specific.

They are not flattened into one shared global cache.

## 12.3 Merge rule

Merged package input is:

```text
merged = globalDeps + agent package.json
```

Agent-specific dependencies override/extend the global set where needed.

## 13. CLI / Operational Surface

Add an explicit prepare command.

Suggested commands:

- `ploinky deps prepare`
- `ploinky deps prepare <repo>/<agent>`
- `ploinky deps status`
- `ploinky deps clean`

Behavior:

- `prepare` builds caches
- `status` reports runtime keys, stamps, and staleness
- `clean` removes prepared caches

This keeps dependency work explicit and operator-visible.

## 14. Acceptance Criteria

The refactor is complete when all of the following are true:

1. Normal `bwrap` agent startup does not run `npm install`.
2. Shared dependencies come from `ploinky/globalDeps/package.json`, not `ploinky/node_modules`.
3. Prepared caches are keyed by runtime key.
4. Agent-specific dependencies are still installed per agent, not flattened into one shared tree.
5. A changed global or agent package input invalidates only the relevant prepared cache.
6. A warm restart reuses prepared caches and is materially faster than today.
7. `llmAssistant`, `webCli`, and `webAdmin` can start without trying to fetch GitHub deps during normal startup.
8. The design leaves a clean seam for later `seatbelt` implementation.

## 15. Recommended Execution Order

1. Add runtime-key detection helper.
2. Add cache-path + stamp helper.
3. Refactor global package merge into reusable functions.
4. Implement global prepared cache for `bwrap`.
5. Implement per-agent prepared cache for `bwrap`.
6. Update `bwrap` runtime startup to consume prepared caches only.
7. Remove runtime install behavior from the `bwrap` path.
8. Add CLI inspection/prepare commands.
9. Add tests.
10. Validate on `testExplorer`.

## 16. Tests

Required automated tests:

1. runtime-key derivation for `bwrap`
2. cache invalidation when global deps change
3. cache invalidation when agent deps change
4. cache reuse on warm start
5. merged package generation
6. startup path does not invoke install on warm cache

Required live validation:

1. `testExplorer` boots with `webCli` and `webAdmin`
2. `llmAssistant` boots without SSH/GitHub install failures
3. Git/DPU path still works afterward

## 17. Non-Goals

This plan does not attempt to:

- redesign secure wire again
- redesign SSO again
- solve clustered replay caches
- eliminate container runtimes immediately
- fully implement `seatbelt` in phase 1

It is specifically a dependency lifecycle refactor.
