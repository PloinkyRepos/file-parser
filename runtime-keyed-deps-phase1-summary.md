# Runtime-Keyed Dependency Preparation — Phase 1 Summary

Phase-1 (`bwrap` + `seatbelt`) implementation of
[runtime-keyed-dependency-preparation-plan.md](/Users/danielsava/work/file-parser/runtime-keyed-dependency-preparation-plan.md)
is landed on branch `feature/capabilities-wire-sso` in the `ploinky` repo.

## What changed

### New modules

- `ploinky/cli/services/dependencyRuntimeKey.js` — runtime-key derivation. Exports `detectHostRuntimeKey(family)`, `detectRuntimeKeyForAgent(manifest, repo, agent)`, `parseRuntimeKey(key)`, and a stubbed `detectContainerRuntimeKey` that throws in phase 1.
- `ploinky/cli/services/dependencyCache.js` — prepared-cache lifecycle. Owns path resolution, sha256-based stamps, `prepareGlobalCache`, `prepareAgentCache`, `verifyAgentCacheForFamily`, and a lock file so concurrent prepares serialize.
- `ploinky/cli/commands/depsCommands.js` — `ploinky deps prepare|status|clean` CLI, registered in `cli/commands/cli.js`.

### Modified modules

- `ploinky/cli/services/config.js` — new constants `DEPS_DIR`, `GLOBAL_DEPS_CACHE_DIR`, `AGENTS_DEPS_CACHE_DIR`.
- `ploinky/cli/services/dependencyInstaller.js` — `mergePackageJson` rewritten with agent-wins semantics (plan §12.3); both inline merges in `installDependenciesInContainer` and `prepareAgentPackageJson` now route through it; `syncCoreDependencies` call removed from `prepareAgentPackageJson`; `buildEntrypointInstallScript` and `prepareAgentPackageJson` tagged `@deprecated` (still alive for the container path in phase 1).
- `ploinky/cli/services/bwrap/bwrapServiceManager.js` — startup now calls `verifyAgentCacheForFamily('bwrap', …)`, mounts the cache `--ro-bind` at `/code/node_modules` and `/Agent/node_modules`, and no longer concatenates any `npm install` into the entry command. Missing/stale cache throws with `ploinky deps prepare` guidance.
- `ploinky/cli/services/seatbelt/seatbeltServiceManager.js` — same pattern with `'seatbelt'` family; `buildSeatbeltEntryCommand` no longer emits an install snippet.
- `ploinky/cli/services/seatbelt/seatbeltProfile.js` — `node_modules` seatbelt rule flipped from `file-read* file-write*` to `file-read*` (matches the new read-only cache mount).
- `ploinky/cli/services/docker/agentServiceManager.js` — container path still runs `buildEntrypointInstallScript()` at boot; added a `console.warn` per boot that phase-3 container caches are pending.
- `ploinky/cli/services/docker/common.js` — added `runtimeFamilyName(runtime)` helper for the future container key.
- `ploinky/README.md` — new "Dependency caches" section and three new `deps` subcommands documented.

### Tests

- `ploinky/tests/unit/dependencyRuntimeKey.test.mjs` — 11 tests: key shape, family normalization, parser round-trip, container rejection.
- `ploinky/tests/unit/dependencyCache.test.mjs` — 15 tests: sha256 determinism, merged-package hash stability, stamp round-trip, global/agent cache validity flips (runtime-key mismatch, package-hash change, missing core marker), path-layout invariants.

Both new files pass, and every existing file under `ploinky/tests/unit/` still passes.

## What's still open

- **Phase-1 live validation on `testExplorer`** (plan §14, §15 step 10) — not yet executed. Requires running `ploinky deps prepare` against the live workspace, which triggers a real `npm install` of the four `globalDeps` entries (several hundred MB, mostly GitHub-hosted). This has not been run here so the user's existing Git/DPU state in `/Users/danielsava/work/testExplorer` is untouched.
- **Phase 2 — seatbelt polish** — the seatbelt service manager mirrors the bwrap interface but has not had a macOS boot smoke beyond unit tests. The seatbelt profile change (rw → ro) needs a live agent boot to confirm sandbox-exec accepts the profile.
- **Phase 3 — container runtime keys** — `detectContainerRuntimeKey` is a stub. `docker/agentServiceManager.js` still installs at container boot; the `console.warn` makes this explicit so it does not quietly regress.
- **Workspace readiness probe** — `workspaceUtil.js:170` still uses the legacy `needsHostInstall` to size the readiness timeout. With prepared caches that check will more often say "needs install" (because it walks the old `.ploinky/agents/<agent>/node_modules` path, not the new cache), giving bwrap/seatbelt agents the longer 10-minute timeout. Not a correctness regression; worth revisiting when `dependencyInstaller` is retired.

## How to validate locally (when ready)

```bash
cd /Users/danielsava/work/testExplorer
# Cold: first-time cache build
ploinky deps prepare                     # global + every enabled agent
ploinky deps status                      # expect entries for each runtime-key

# Warm: confirm no boot-time install
ploinky stop
ploinky start                            # bwrap logs must not contain "npm install"

# Regression (Git/DPU path):
#   git_auth_status / git_auth_store_token / git_auth_disconnect
#   via /mcps/gitAgent/mcp?agent=explorer
```

If any agent fails to start with "prepared dependency cache is stale/missing", the fix is `ploinky deps prepare <repo>/<agent>` (or `ploinky deps prepare` for all).
