# bwrap VM Deployment and Ploinky Bugs — Handoff

This document is the continuity pack for picking up the bwrap validation and ploinky-bug debugging that was done on 2026-04-21 against a local multipass VM. The previous session's conversation is not visible to you; this file is the whole briefing.

The target codebase is on branch `feature/capabilities-wire-sso` across five repos under `/Users/danielsava/work/file-parser/`:

- `ploinky/`
- `AssistOSExplorer/`
- `basic/`
- `coralFlow/`
- root `file-parser` (docs only)

The prior architecture context is in [capability-wire-sso-implementation-handoff.md](/Users/danielsava/work/file-parser/capability-wire-sso-implementation-handoff.md). That document calls the branch `feature/capability-wire-sso` (singular); the actual branch across all five repos is `feature/capabilities-wire-sso` (plural).

## 1. Session Goal and Outcome

The goal was:

- deploy the Explorer agent in a multipass Ubuntu VM so bwrap runtime is exercised
- validate end-to-end that bwrap works on Linux

The outcome:

- bwrap was validated: three `"lite-sandbox": true` agents (`explorer`, `multimedia`, `soplangAgent`) ran as real `/usr/bin/bwrap` processes with `--unshare-pid --clearenv`, prepared-deps mount, agent key mount, and router-public-key env.
- An MCP handshake against the bwrap explorer through the router succeeded: `initialize` → session id → `tools/list` → `tools/call list_allowed_directories` and `list_directory` returned actual filesystem content from inside the sandbox.
- A real Git auth flow was then attempted end-to-end through the browser. It surfaced a cascade of unrelated ploinky bugs (documented below). The bugs were worked around in this session, not fixed in code.

## 2. What Is Running Right Now

### 2.1 Multipass VM

- VM name: `ubuntu`
- IP: `192.168.2.2`
- OS: Ubuntu 24.04.4 LTS aarch64
- State as of last activity: Router on 8080, 7 podman agent containers, 3 bwrap processes.

Access without SSH:

```bash
multipass exec ubuntu -- bash -c '<command>'
```

No SSH key is configured for this VM; multipass's own SSH key is root-owned and was not worth unwrapping. All VM inspection in this session went through `multipass exec`.

### 2.2 Source layout on the VM

- `/home/ubuntu/work/` — multipass mount of the Mac-side `/Users/danielsava/work/file-parser/` (read-write)
- `/home/ubuntu/src/ploinky` — Linux-native copy rsynced from the mount, `npm install --omit=dev` run; has Linux `node-pty` native builds
- `/home/ubuntu/src/ploinky/globalDeps` — same treatment
- `/home/ubuntu/src/AssistOSExplorer`, `/home/ubuntu/src/basic` — Linux-native copies without `node_modules`
- `/home/ubuntu/testExplorer/` — the workspace in use

The mount still exists and can be updated from the Mac at any time by rsyncing again into `/home/ubuntu/src/…`. Do not `npm install` inside `/home/ubuntu/work/` — it would write Linux `node_modules` into the Mac tree.

### 2.3 Workspace layout

- `.ploinky/repos/AssistOSExplorer`, `.ploinky/repos/basic` — planted by hand, not cloned from GitHub.
- `.ploinky/repos/webassist` — auto-cloned by ploinky when the explorer manifest's `repos.webassist` kicked in.
- `.ploinky/agents.json` — includes `_config.capabilityAgentKeys` with all 10 agent principals, fingerprints, JWKs.
- `.ploinky/keys/agents/` — Ed25519 keypairs for each agent principal on disk (filenames use `%3A` / `%2F` URL-encoding of `agent:<repo>/<agent>`).
- `.ploinky/state/git-agent-github-auth.json` — gitAgent GitHub device-flow state; may be stale between sessions.

### 2.4 Mac-side forwarder

Because macOS 26.4.1 (Tahoe) gates access from apps to RFC1918 addresses behind the Local Network privacy prompt, Chrome cannot reach `192.168.2.2` directly unless granted permission. A simple Node TCP forwarder was started as a background process:

```javascript
net.createServer(c => {
  const u = net.connect(8080, "192.168.2.2", () => { c.pipe(u); u.pipe(c); });
  u.on("error", () => c.destroy());
  c.on("error",  () => u.destroy());
}).listen(9090, "127.0.0.1");
```

- `http://127.0.0.1:9090/` on the Mac → `192.168.2.2:8080` (VM router).
- The forwarder's background task id in the previous session was `b52htp5f3`. It may or may not be alive when you pick up; verify with `lsof -iTCP:9090 -sTCP:LISTEN -P` and restart if needed.
- Grant Chrome Local Network permission and you can hit `http://192.168.2.2:8080/` directly and skip the forwarder.

### 2.5 Mac testExplorer is also running (separately)

`http://127.0.0.1:8088/` on the Mac hits a native Mac ploinky deployment in `/Users/danielsava/work/testExplorer/`. It predates this session and was not touched. Don't confuse it with the VM deployment.

## 3. What Was Validated vs What Was Not

### Validated (observed directly)

- `kernel.apparmor_restrict_unprivileged_userns = 0` set on the VM (memory-only + `/etc/sysctl.d/99-bwrap.conf`).
- bwrap 0.9.0, antiword, nodejs 20.20.2, podman 4.9.3 installed.
- `ls .ploinky/bwrap-pids/` → `explorer.pid`, `multimedia.pid`, `soplangAgent.pid`. Each PID is a real `/usr/bin/bwrap` process per `ps axo pid,cmd`.
- MCP handshake + `tools/list` + `tools/call list_allowed_directories` + `tools/call list_directory` against `/mcps/explorer/mcp` via the router succeeded with the explorer running under bwrap.
- `git_tool` first-hop delegated flow reaching podman-run `gitAgent`: router-signed `x-ploinky-invocation` tokens verified, tools `git_repos_overview`, `git_status`, `git_auth_status`, `git_auth_begin`, `git_auth_poll` were dispatched.
- gitAgent container reaches `api.github.com` and `github.com/login/oauth/access_token` — manually replayed the poll call with the real client_id and the stored device_code; GitHub returned a valid access token. (Side effect: that device_code was consumed and the user's first in-browser attempt was therefore stuck; the state file was cleared afterwards.)

### Not validated

- gitAgent → router → dpuAgent delegated hop (§9 of the architecture doc) end-to-end producing a stored token in DPU. At session end, the last workaround was applied (destroy+recreate agent containers so env is rebuilt with full registry), but the user had not yet retried the Git modal. The next session should start by asking whether the retry worked.
- SSO path through `basic/keycloak` — not exercised; workspace is local-auth only.
- Negative-path tests (forged caller assertion, replay, tampering).
- Dashboard rendering in Chrome (the forwarder works, `/health` returns 200, but no full-UI click-through was done in this session).

## 4. Ploinky Bugs Surfaced

All citations are under `/Users/danielsava/work/file-parser/ploinky/` unless noted.

### 4.1 `agents.js:293` wrong relative path

File: [cli/services/agents.js](/Users/danielsava/work/file-parser/ploinky/cli/services/agents.js) line 293:

```javascript
{ source: path.resolve(__dirname, '../../../Agent'), target: '/Agent' },
```

`agents.js` is at `cli/services/`, so `../../../Agent` climbs to the parent of `ploinky/`, not into `ploinky/Agent/`. The correct expression here is `'../../Agent'`. Compare with the correct uses at:

- [cli/services/bwrap/bwrapServiceManager.js:74](/Users/danielsava/work/file-parser/ploinky/cli/services/bwrap/bwrapServiceManager.js)
- [cli/services/seatbelt/seatbeltServiceManager.js:65](/Users/danielsava/work/file-parser/ploinky/cli/services/seatbelt/seatbeltServiceManager.js)
- [cli/services/docker/agentServiceManager.js:76](/Users/danielsava/work/file-parser/ploinky/cli/services/docker/agentServiceManager.js)

Those live in `cli/services/<runtime>/` (one directory deeper), so for them `'../../../Agent'` is correct.

Observable effect on this VM: the stored `agents.json` for the explorer record has `source: "/home/ubuntu/src/Agent"` (does not exist) instead of `/home/ubuntu/src/ploinky/Agent` (exists). Only affects the container-mode mount path; bwrap/seatbelt resolve it correctly via their own `AGENT_LIB_PATH` constants.

### 4.2 Hard container-runtime requirement

File: [cli/services/docker/common.js:72-82](/Users/danielsava/work/file-parser/ploinky/cli/services/docker/common.js).

```javascript
function getContainerRuntime() {
    const preferredRuntimes = ['podman', 'docker'];
    for (const runtime of preferredRuntimes) {
        if (isRuntimeInstalled(runtime)) { … return runtime; }
    }
    console.error('Neither podman nor docker found in PATH. Please install one of them.');
    process.exit(1);
}

const containerRuntime = getContainerRuntime();   // runs at module load
```

`process.exit(1)` at module load means even a pure-bwrap workspace cannot run without podman or docker installed. On this VM, podman was removed temporarily to force-skip the OnlyOffice preinstall, and ploinky then refused to start at all until podman was reinstalled.

A lazy-init pattern (only resolve the runtime when a container actually needs to be spawned) would allow pure-bwrap workspaces.

### 4.3 `PLOINKY_AGENT_PUBLIC_KEYS_JSON` not included in env-hash → stale env on restart (the "unknown caller principal" root cause)

Files:

- [cli/services/docker/common.js:275-287 `computeEnvHash`](/Users/danielsava/work/file-parser/ploinky/cli/services/docker/common.js)
- [cli/services/docker/agentServiceManager.js:393-396](/Users/danielsava/work/file-parser/ploinky/cli/services/docker/agentServiceManager.js) — injects `PLOINKY_AGENT_PUBLIC_KEYS_JSON` into env *after* `buildEnvMap`
- [cli/services/bwrap/bwrapServiceManager.js:338](/Users/danielsava/work/file-parser/ploinky/cli/services/bwrap/bwrapServiceManager.js) — same injection pattern
- [cli/services/docker/agentServiceManager.js:606 `ensureAgentService`](/Users/danielsava/work/file-parser/ploinky/cli/services/docker/agentServiceManager.js) — reuses the existing container when `computeEnvHash` says env is unchanged (around line 678)

The symptom chain:

1. `computeEnvHash` hashes `buildEnvMap(manifest, profileConfig)` — manifest-derived env only. It does not include the secure-wire env (`PLOINKY_AGENT_PUBLIC_KEYS_JSON`, `PLOINKY_ROUTER_PUBLIC_KEY_JWK`, `PLOINKY_AGENT_PRINCIPAL`, `PLOINKY_AGENT_PRIVATE_KEY_PATH`).
2. On subsequent `ploinky start`, `ensureAgentService` sees the existing container, computes the same manifest-hash, concludes env is unchanged, and starts the existing container in place. The original baked-in secure-wire env is preserved.
3. Combined with 4.4 below, this means an agent can be stuck with a partial `PLOINKY_AGENT_PUBLIC_KEYS_JSON` forever unless its container is destroyed.

### 4.4 Agent public-key registry incomplete for agents spawned early in the dep wave

On a *first-ever* start of a workspace, agents are spawned in dep-wave order. [cli/services/agentKeystore.js:165-200 `ensureAgentKeypair`](/Users/danielsava/work/file-parser/ploinky/cli/services/agentKeystore.js) generates (or loads) and registers one agent's key. [cli/services/docker/agentServiceManager.js:393 `listRegisteredAgentPublicKeys()`](/Users/danielsava/work/file-parser/ploinky/cli/services/docker/agentServiceManager.js) then reads the registry to build the env.

Because registrations happen sequentially, the first agent (e.g. `dpuAgent` in this workspace) sees only its own key. The second sees itself plus the first. And so on.

The static front-door agent (`explorer`) runs last and gets the full registry, which is why first-hop flows through explorer worked throughout this session.

The delegated hop `gitAgent → router → dpuAgent` failed because dpuAgent's AgentServer runs `verifyDirectAgentRequest` against its `PLOINKY_AGENT_PUBLIC_KEYS_JSON` env, and gitAgent's principal wasn't in it. Error surfaced to the browser as:

```
MCP error -32600: Invocation rejected: wireVerify: unknown caller principal 'agent:AssistOSExplorer/gitAgent'
```

Error is thrown from [Agent/server/AgentServer.mjs:439](/Users/danielsava/work/file-parser/ploinky/Agent/server/AgentServer.mjs), which relays `verifyDirectAgentRequest`'s reason from [Agent/lib/wireVerify.mjs:179](/Users/danielsava/work/file-parser/ploinky/Agent/lib/wireVerify.mjs).

Two viable real fixes:

- **(a)** Pre-generate all agent keypairs in a preflight pass at the start of `startWorkspace` before the dep wave spawns anything. Cheap and localized.
- **(b)** Have `verifyDirectAgentRequest` resolve caller public keys dynamically from disk (re-read `.ploinky/agents.json` `_config.capabilityAgentKeys`) rather than from frozen env. More tolerant of future drift.

Either fix on its own is sufficient; combining (a) with the 4.3 hash fix is probably the right long-term answer.

### 4.5 Explorer preinstall unconditionally starts OnlyOffice when podman is present

File: [AssistOSExplorer/explorer/scripts/hooks/preinstall.sh:174,424](/Users/danielsava/work/file-parser/AssistOSExplorer/explorer/scripts/hooks/preinstall.sh).

`ensure_onlyoffice_service` is called unconditionally from the bottom of the script. It skips only when `command -v podman` returns non-zero. There is no env flag (`SKIP_ONLYOFFICE`, `HEADLESS`) to bypass it when podman is installed but you want a lean deploy. On this VM that pulled `docker.io/onlyoffice/documentserver:latest` (~1 GB) and stalled the first smoke test.

In this session the function was stubbed out by `sed` in the *workspace-local* copy at `/home/ubuntu/testExplorer/.ploinky/repos/AssistOSExplorer/explorer/scripts/hooks/preinstall.sh`. The source in `AssistOSExplorer/explorer/scripts/hooks/preinstall.sh` on Mac was not modified.

A proper fix would be a `[[ "${SKIP_ONLYOFFICE:-0}" = "1" ]] && return 0` guard at the top of `ensure_onlyoffice_service`.

### 4.6 Stale `.lock` left behind by a killed `deps prepare`

File: [cli/services/dependencyCache.js](/Users/danielsava/work/file-parser/ploinky/cli/services/dependencyCache.js).

`deps prepare` acquires `.ploinky/deps/global/<key>/.lock` (contents `{"pid":…,"at":"…"}`) but does not check on acquire whether the recorded pid is still alive. When the first `ploinky start` in this session was killed by its outer `timeout` wrapper, it left a stale lock behind; a subsequent `deps prepare` then waited out its full timeout before erroring with:

```
Error: Timed out waiting for cache lock at .ploinky/deps/global/<key>/.lock
```

On-acquire pid-liveness check (`kill(pid, 0)` returning ESRCH means the holder is dead) would make this self-healing.

## 5. Concrete Next Steps

In rough priority order.

### 5.1 Confirm the Git flow actually works post-workaround

The last thing done in the previous session was `podman rm -f` on all agent containers and `ploinky start explorer` to rebuild their env with the full 10-principal registry. The user was asked to retry the Git modal but did not report back.

Steps:

1. Check forwarder: `lsof -iTCP:9090 -sTCP:LISTEN -P`. If missing, start a new one (snippet in §2.4).
2. Open `http://127.0.0.1:9090/` → login `admin`/`admin` → Git modal → Login with GitHub.
3. Success looks like `.ploinky/state/git-agent-github-auth.json` having `connection != null` and the modal flipping to "connected" with a GitHub username.
4. If it still fails, grab the new error (screenshot or text) and the relevant tail of:
   - VM: `/home/ubuntu/testExplorer/.ploinky/logs/router.log`
   - `podman logs ploinky_AssistOSExplorer_gitAgent_testExplorer_bacaa68a`
   - `podman logs ploinky_AssistOSExplorer_dpuAgent_testExplorer_bacaa68a`

Ask the user to re-attempt before assuming the workaround held.

### 5.2 Code fix for bug 4.4

Add a preflight at the top of `startWorkspace` in [cli/services/workspaceUtil.js](/Users/danielsava/work/file-parser/ploinky/cli/services/workspaceUtil.js) that iterates enabled agents and calls `ensureAgentKeypair(deriveAgentPrincipalId(repo, agent))` for each one before the dep wave starts spawning anything.

Add a unit test that asserts, for a workspace with agents `A`, `B`, `C` spawned in order, that each agent's `PLOINKY_AGENT_PUBLIC_KEYS_JSON` after start contains all three principals.

### 5.3 Code fix for bug 4.3

Include the secure-wire env vars in `computeEnvHash`. Minimum set: `PLOINKY_AGENT_PUBLIC_KEYS_JSON`, `PLOINKY_ROUTER_PUBLIC_KEY_JWK`, `PLOINKY_AGENT_PRINCIPAL`. Since these are injected after `buildEnvMap`, either compute the hash from the final env map (preferred) or update both service managers to add these to the map before hashing.

Reminder: this hash is also used to decide whether a container-mode agent's container is recreated on restart. Including more env in the hash means more restarts trigger destroy+recreate; check whether that's acceptable for e.g. `postgres` or `keycloak` (infra services the user likely wants sticky). If too aggressive, consider a separate "secure-wire hash" stored as a container label.

### 5.4 Code fix for bug 4.1

One-character fix: in `cli/services/agents.js:293`, change `'../../../Agent'` to `'../../Agent'`. Verify by greping `agents.json` after a fresh `enable agent` on both Mac and VM — the stored `source` for the `/Agent` bind should point at `<file-parser>/ploinky/Agent`, not `<file-parser>/Agent`.

### 5.5 Nice-to-have fixes

- Bug 4.2 — lazy container-runtime init. Touching `getContainerRuntime()` means touching everything that imports `containerRuntime` as a bound value; start by converting it to a memoized getter and updating consumers.
- Bug 4.5 — add an env-flag skip to `ensure_onlyoffice_service`. Update the explorer manifest's `profiles.default.env` allowlist so `SKIP_ONLYOFFICE` is passed through.
- Bug 4.6 — pid-liveness check in the deps cache lock path.

### 5.6 If you want to re-run the bwrap validation from scratch

The VM already has everything installed. To start from a clean workspace:

```bash
multipass exec ubuntu -- bash -c '
  cd /home/ubuntu/testExplorer
  node /home/ubuntu/src/ploinky/cli/index.js stop
  rm -rf .ploinky
  mkdir -p .ploinky/repos
  cp -r /home/ubuntu/src/basic .ploinky/repos/basic
  cp -r /home/ubuntu/src/AssistOSExplorer .ploinky/repos/AssistOSExplorer
  node /home/ubuntu/src/ploinky/cli/index.js enable repo AssistOSExplorer
  node /home/ubuntu/src/ploinky/cli/index.js enable agent explorer
  # stub out OnlyOffice in the workspace-local preinstall copy
  sed -i "s|^ensure_onlyoffice_service\$|: # stubbed|" .ploinky/repos/AssistOSExplorer/explorer/scripts/hooks/preinstall.sh
  # prepare deps for the three lite-sandbox agents
  for a in explorer multimedia soplangAgent; do
    node /home/ubuntu/src/ploinky/cli/index.js deps prepare AssistOSExplorer/$a
  done
  node /home/ubuntu/src/ploinky/cli/index.js start explorer
'
```

Note: on the **first** start of a fresh workspace you will hit bug 4.4 — delegated calls will fail until you destroy the agent containers once (`podman rm -f $(podman ps -a --format '{{.Names}}' | grep testExplorer)`) and `ploinky start explorer` again. Subsequent starts then work because `capabilityAgentKeys` on disk is fully populated and every fresh container picks up all 10 principals. This workaround is captured here because 4.4 has no code fix yet.

## 6. Debugging Map

### Router admission / first-hop invocation

- [ploinky/cli/server/RoutingServer.js](/Users/danielsava/work/file-parser/ploinky/cli/server/RoutingServer.js)
- [ploinky/cli/server/mcp-proxy/index.js](/Users/danielsava/work/file-parser/ploinky/cli/server/mcp-proxy/index.js)
- [ploinky/cli/server/mcp-proxy/secureWire.js](/Users/danielsava/work/file-parser/ploinky/cli/server/mcp-proxy/secureWire.js)

### Delegated hop verification (the path where bug 4.4 bit)

- [ploinky/Agent/server/AgentServer.mjs:439](/Users/danielsava/work/file-parser/ploinky/Agent/server/AgentServer.mjs) — error origin
- [ploinky/Agent/lib/wireVerify.mjs:179](/Users/danielsava/work/file-parser/ploinky/Agent/lib/wireVerify.mjs) — "unknown caller principal"
- [ploinky/Agent/lib/runtimeWire.mjs](/Users/danielsava/work/file-parser/ploinky/Agent/lib/runtimeWire.mjs) — `verifyDirectAgentRequest`

### Agent key registry

- [ploinky/cli/services/agentKeystore.js](/Users/danielsava/work/file-parser/ploinky/cli/services/agentKeystore.js) — key material on disk + in-memory registration
- [ploinky/cli/services/capabilityRegistry.js](/Users/danielsava/work/file-parser/ploinky/cli/services/capabilityRegistry.js) — persisted registry under `_config.capabilityAgentKeys`
- [ploinky/cli/services/workspace.js](/Users/danielsava/work/file-parser/ploinky/cli/services/workspace.js) — `getConfig` / `setConfig` reads `agents.json` on every call (no caching)

### bwrap runtime

- [ploinky/cli/services/bwrap/bwrapServiceManager.js](/Users/danielsava/work/file-parser/ploinky/cli/services/bwrap/bwrapServiceManager.js) — `buildBwrapArgs`, env injection at line 338
- [ploinky/cli/services/bwrap/bwrapFleet.js](/Users/danielsava/work/file-parser/ploinky/cli/services/bwrap/bwrapFleet.js) — PID file lifecycle
- [ploinky/cli/services/docker/common.js](/Users/danielsava/work/file-parser/ploinky/cli/services/docker/common.js) — `getRuntimeForAgent` (line 357), `computeEnvHash` (line 275), `containerRuntime` hard-exit (line 80)

### gitAgent device-flow path

- [AssistOSExplorer/gitAgent/tools/git_tool.mjs](/Users/danielsava/work/file-parser/AssistOSExplorer/gitAgent/tools/git_tool.mjs) — tool dispatcher
- [AssistOSExplorer/gitAgent/lib/github-auth.mjs:239,286](/Users/danielsava/work/file-parser/AssistOSExplorer/gitAgent/lib/github-auth.mjs) — `beginGithubDeviceFlow`, `pollGithubDeviceFlow`
- [AssistOSExplorer/gitAgent/lib/secret-store-client.mjs](/Users/danielsava/work/file-parser/AssistOSExplorer/gitAgent/lib/secret-store-client.mjs) — the gitAgent→router→dpuAgent JSON-RPC client (where the caller assertion is signed)
- "fetch failed" in the UI is Node's `TypeError: fetch failed`; it has no string literal in the codebase — grepping for it finds only heuristic matchers.

## 7. Useful Commands

### VM

```bash
# Health probe
multipass exec ubuntu -- bash -c 'curl -s http://127.0.0.1:8080/health'

# Registry view for any agent
multipass exec ubuntu -- podman exec ploinky_AssistOSExplorer_dpuAgent_testExplorer_bacaa68a \
  sh -c 'echo $PLOINKY_AGENT_PUBLIC_KEYS_JSON' \
  | node -e 'const r=require("fs").readFileSync(0,"utf8").trim(); console.log(Object.keys(JSON.parse(r)))'

# Full environment dump for a podman agent
multipass exec ubuntu -- podman inspect ploinky_AssistOSExplorer_gitAgent_testExplorer_bacaa68a \
  --format '{{range .Config.Env}}{{println .}}{{end}}'

# Disk-side agent-keys registry
multipass exec ubuntu -- node -e '
  const d = JSON.parse(require("fs").readFileSync("/home/ubuntu/testExplorer/.ploinky/agents.json","utf8"));
  console.log(Object.keys(d._config?.capabilityAgentKeys || {}));
'

# bwrap processes
multipass exec ubuntu -- bash -c 'ls /home/ubuntu/testExplorer/.ploinky/bwrap-pids/; ps axo pid,cmd | grep bwrap | grep -v grep'
```

### Mac

```bash
# Forwarder status
lsof -iTCP:9090 -sTCP:LISTEN -P

# Hit the router through the forwarder
curl -s -o /dev/null -w '%{http_code}\n' http://127.0.0.1:9090/health
```

### Source-tree sync from Mac to VM

```bash
multipass exec ubuntu -- bash -c '
  rsync -a --delete --exclude node_modules --exclude .git /home/ubuntu/work/ploinky/ /home/ubuntu/src/ploinky/
  rsync -a --delete --exclude node_modules --exclude .git /home/ubuntu/work/AssistOSExplorer/ /home/ubuntu/src/AssistOSExplorer/
  cd /home/ubuntu/src/ploinky && npm install --omit=dev >/dev/null
  cd /home/ubuntu/src/ploinky/globalDeps && npm install --omit=dev >/dev/null
'
```

Do not rsync the other direction — the Mac side is authoritative source.

## 8. What This Session Did Not Touch

- No git commits, no pushes, no remote deploys. The user's auto-memory feedback explicitly bars both.
- No edits to any source files under `/Users/danielsava/work/file-parser/` — all workarounds were VM-local.
- No edits to the Mac native testExplorer workspace at `/Users/danielsava/work/testExplorer/`.
- No changes to Chrome's Local Network permission (still not granted as of session end).
