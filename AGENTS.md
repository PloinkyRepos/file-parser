# Session Handoff — ploinky + AssistOSExplorer

> **Audience:** a fresh Claude Code session picking up this work. Read this first, then `git log` for the latest commits before doing anything else.
>
> **Maintenance rule:** this file (and its twin `AGENTS.md` in the same directory — they carry identical content) MUST be updated in the same turn as any code change in `/Users/danielsava/work/file-parser/`. Do not let it go stale.

---

## What lives here

`/Users/danielsava/work/file-parser/` is a multi-repo workspace; the two repos that matter for this work are:

| Path | What it is |
|---|---|
| `ploinky/` | The Ploinky CLI + router (`bin/ploinky`). Manages workspaces under `.ploinky/`, enables agents from named repos, runs them under podman/docker (default) or bwrap/seatbelt (opt-in). Encrypted password store + secrets store live here. |
| `AssistOSExplorer/` | The "AchillesIDE" agent pack consumed by ploinky. Contains `explorer`, `gitAgent`, `webmeetAgent`, `dpuAgent`, `llmAssistant`, `multimedia`, `tasksAgent`, `webAdmin`, `webassist`, `soplangAgent`, etc. The `explorer` agent is the entry point and pulls the others in as dependencies. Repo URL when cloned via ploinky: `https://github.com/PloinkyRepos/AssistOSExplorer.git` (mapped from `AchillesIDE` in `ploinky/cli/services/repos.js:53`). |
| Other dirs (`AssistOS`, `basic`, `coralFlow`, `proxies`, `skill-manager-cli`, `globalDeps`, …) | Sibling projects, not in scope for this handoff. |

---

## Recent work (most recent first)

### 2026-05-04 - WebMeet asset routing/caching fix, update retry, and remote redeploy

**Slow/failing WebMeet plugin assets:** `skills.axiologic.dev` showed long stalls and failures for WebMeet ES module files such as `meeting-presence-controller.js`. The root router used broad `pathname.startsWith('/webmeet')` checks, so requests under `/webmeetAgent/IDE-plugins/...` were captured by the router-level `/webmeet` handler instead of the agent static-file server. Remote proof before the fix: local remote curl to `/webmeetAgent/IDE-plugins/webmeet-tool-button/webmeet-tool-button.js` returned a 302 auth response, while sibling `/gitAgent/...` and `/dpuAgent/...` plugin assets returned `200 application/javascript`.

**Fixes pushed:**
- `OutfinityResearch/ploinky@975847f` (`Fix static asset routing and caching`): added route-boundary matching via `isRouteMount()` so `/webmeet` does not shadow `/webmeetAgent`; added static asset cache headers, streaming file responses, font/webp MIME types, and MCP browser-client caching. Added `tests/unit/routeMounts.test.mjs`.
- `PloinkyRepos/AssistOSExplorer@47bb169` (`Avoid duplicate runtime plugin imports`): stopped fetching presenter JS before dynamic import and removed the `?cacheBust=Date.now()` module import, so runtime plugin JS is requested once at a stable URL.
- `OutfinityResearch/ploinky@8555534` (`Skip non-git repos during update`): `ploinky update` now skips stale non-git workspace repo directories during all-repo updates instead of failing the deployment.
- `PloinkyRepos/AssistOSExplorer@fe63869` (`Retry deploy update after Ploinky self-update`): deploy retries `ploinky update` once because the first invocation can self-update the CLI but still finish in the old Node process.

**Verification:** Ploinky unit suite passed (`241` tests). Explorer focused checks passed: `node --check explorer/services/runtime/componentRegistry.js` and `node --test explorer/tests/unit/pluginUtils.test.js explorer/tests/unit/idePluginsAggregation.test.js` (`16` tests). YAML parse check passed for `deploy-skills-explorer.yml`.

**Deploy history:** `Deploy Skills Explorer` runs `25312634357` and `25312815768` failed while exercising the updater edge cases above. `Deploy Skills Explorer` run `25312918690` succeeded. Post-deploy `Remote Skills Status` run `25312979435` succeeded. Read-only spot checks showed remote heads `ploinky=8555534`, `fileExplorer=fe63869`, `webmeetInfra=886a6db`, all Explorer/WebMeet containers up, and router listening on `*:8097`. Public checks for `/webmeetAgent/IDE-plugins/.../webmeet-tool-button.js` and `meeting-presence-controller.js` now return `HTTP/2 200`, JavaScript content type, and cache headers through Cloudflare.

**Remaining LiveKit/Cloudflare blocker:** `https://livekit.skills.axiologic.dev` still fails TLS handshake from local curl. The likely cause is Cloudflare certificate coverage: a normal wildcard for `*.axiologic.dev` does not cover the second-level name `livekit.skills.axiologic.dev`. Until Cloudflare has a cert for that exact hostname (or the deployment moves LiveKit to a first-level host such as `livekit.axiologic.dev` / `livekit-skills.axiologic.dev` and updates `WEBMEET_PUBLIC_LIVEKIT_URL`), WebMeet static assets can load correctly while browser LiveKit/WebRTC connection can still fail.

### 2026-05-04 - Skills Explorer workflow split and deploy simplification

Simplified `AssistOSExplorer/.github/workflows/deploy-skills-explorer.yml` so it no longer provisions OS packages, configures persistent PATH, accepts `ploinky_branch`, accepts `update_ploinky`, forwards direct provider/model variables (`OPENAI_*`, `OPENROUTER_*`, `LLM_MODELS`, etc.), or manually rewrites `.ploinky/agents.json` / `.ploinky/enabled_repos.json`. Deploy now assumes the host has already been provisioned, resolves the installed `ploinky` binary, stops the current workspace, ensures the `fileExplorer` and `webmeetInfra` repos are added/enabled through Ploinky commands, runs `ploinky update` to update Ploinky/workspace repos/`achillesAgentLib`, pins the requested Explorer branch with git, sets runtime vars through `ploinky var`, and starts `fileExplorer/explorer`.

Removed direct provider/model plumbing from the affected agents and docs. `gitAgent`, `llmAssistant`, and `webmeetAgent` manifests/start scripts no longer declare or fallback-export OpenAI/Anthropic/Gemini/Mistral/DeepSeek/OpenRouter/HuggingFace/XAI/Axiologic/OpenCode provider keys; LLM access should go through `SOUL_GATEWAY_API_KEY` and optional `SOUL_GATEWAY_BASE_URL`.

Deleted obsolete GitHub Actions configuration from `PloinkyRepos/AssistOSExplorer`: secrets `OPENAI_API_KEY`, `OPENROUTER_API_KEY`, `AXIOLOGIC_API_KEY`, `OPENAI_OPENCODE_KEY`; variables `OPENAI_AXIOLOGIC_KIRO_URL`, `OPENAI_AXIOLOGIC_KIRO_KEY_ENV`, `ANTHROPIC_AXIOLOGIC_ANTIGRAVITY_URL`, `ANTHROPIC_AXIOLOGIC_ANTIGRAVITY_KEY_ENV`, `OPENAI_OPENCODE_URL`, `OPENAI_OPENAI_RESPONSES_URL`, `OPENAI_OPENAI_RESPONSES_KEY_ENV`, and `LLM_MODELS`. Kept `PLOINKY_MASTER_KEY`, `SOUL_GATEWAY_API_KEY`, SSH, OnlyOffice, Explorer workspace/router/public URL variables.

Configured the GitHub repo for the `skills.axiologic.dev` production profile: `PLOINKY_PROFILE=prod`, `WEBMEET_PUBLIC_LIVEKIT_URL=wss://livekit.skills.axiologic.dev`, internal LiveKit/Egress URLs, `WEBMEET_LIVEKIT_USE_EXTERNAL_IP=true`, node/TURN external IP `193.180.209.191`, TURN realm/user, TURN UDP relay range `20000-20010`, plus generated `WEBMEET_LIVEKIT_API_SECRET` and `WEBMEET_TURN_PASSWORD` secrets.

Added `AssistOSExplorer/.github/workflows/provision-skills-explorer-host.yml` for one-time host setup: OS packages, Podman, Node.js, `loginctl enable-linger`, initial Ploinky clone, `npm install --ignore-scripts`, `achillesAgentLib` clone/update, `~/.local/bin` symlinks, and `.bashrc` PATH setup. Use provision only when bootstrapping or repairing the remote host. For a fresh app deployment, run `Destroy Explorer (Remote Wipe)` first, then `Deploy Skills Explorer`; deploy itself is the update path.

### 2026-05-04 - WebMeet infrastructure architecture document

Created `AssistOSExplorer/docs/webmeet-infra-architecture.md`, a detailed architecture note for the current Explorer WebMeet flow. It maps Ploinky startup/routing, the Explorer plugin discovery path, `webmeetAgent` MCP/API/worker internals, every `webmeetInfra` agent (`stack`, Redis, Coturn, LiveKit server, LiveKit egress), storage/encryption, auth/secure-wire behavior, public deployment considerations, and Mermaid diagrams for the dependency graph, runtime topology, plugin discovery, join flow, chat/AI flow, recording flow, and invocation auth flow.

### 2026-04-30 — GitHub device auth `fetch failed` root cause, fix, push, and fresh remote redeploy

**Symptom:** on `https://skills.axiologic.dev`, the GitHub device authentication flow reached the point where GitHub authorization succeeded, then the app surfaced `TypeError: fetch failed` while the `gitAgent` tried to call another agent through the router. Remote inspection showed `gitAgent` had `PLOINKY_ROUTER_URL=http://host.containers.internal:8080`, but the skills deployment router listens on port `8097`.

**Proof:** from inside the remote `gitAgent` container, posting to the current `PLOINKY_ROUTER_URL` failed with connection refused. Posting to the same route on `http://host.containers.internal:8097` reached the router and returned `401`, proving the container networking path was fine and only the injected router port was wrong.

**Root cause:** `ploinky start explorer 8097` set `cfg.port = 8097` in memory, but the first dependency wave was started before `.ploinky/routing.json` was written with that port. `agentServiceManager` read the routing file while building `PLOINKY_ROUTER_URL`; when the file was absent or stale it defaulted to `8080`. That is why wave-1 agents such as `gitAgent`, `dpuAgent`, and `llmAssistant` got `8080` while later waves got `8097`. The deployment workflows also persisted `PLOINKY_ROUTER_URL` via `ploinky var`, which made runtime topology a workspace secret and could preserve stale values across updates.

**Fixes pushed:**
- `OutfinityResearch/ploinky@afdd1c5` (`Fix router env for startup containers`): `workspaceUtil.startWorkspace` now seeds `.ploinky/routing.json` before dependency startup and passes the static router port into `ensureAgentService`. `agentServiceManager` now builds runtime-owned `PLOINKY_ROUTER_PORT`, `PLOINKY_ROUTER_HOST`, and `PLOINKY_ROUTER_URL`, appends them after manifest/profile/secrets env so they win, and includes them in the env hash so existing containers are recreated when the router URL changes. Added unit coverage in `tests/unit/containerRuntime.test.mjs`.
- `PloinkyRepos/AssistOSExplorer@ed86b78` (`Stop persisting runtime router URL`): removed `PLOINKY_ROUTER_URL` from `deploy-skills-explorer.yml`, `deploy-explorer.yml`, and the deprecated `update-explorer.yml`.

**Verification:** full Ploinky unit suite passed (`239` tests). Pushed both commits. Ran a scratch remote redeploy through GitHub Actions only:
1. `Destroy Explorer (Remote Wipe)` run `25168964136` — success.
2. Post-destroy `Remote Skills Status` run `25169011359` — success; workspace removed and port `8097` closed.
3. `Deploy Skills Explorer` run `25169068642` with `branch=main`, `workspace_name=explorerWorkspace`, `router_port=8097`, `public_url=https://skills.axiologic.dev` — success.
4. Post-deploy `Remote Skills Status` run `25169266941` — success; all 16 Explorer/WebMeet containers up, router listening on `*:8097`.
5. Read-only remote spot-checks: deployed heads are `ploinky=afdd1c5` and `fileExplorer=ed86b78`; every Explorer/WebMeet container reports `PLOINKY_ROUTER_URL=http://host.containers.internal:8097`; the `gitAgent` probe to `${PLOINKY_ROUTER_URL}/mcps/dpuAgent/mcp` returns `status=401` instead of `fetch failed`; public `curl -I https://skills.axiologic.dev/dashboard` returns `HTTP/2 401` via Cloudflare, which confirms the public tunnel reaches the router.

### 2026-04-30 — webmeet `loadMeetingDetails` race fix (atomic JSON writes)

**Symptom:** clicking a room (e.g. "General") in the WebMeet dashboard surfaced `ToolError: MCP error -32603: Unexpected end of JSON input` from `WebMeetDashboardModal.loadMeetingDetails` (`Promise.all` of `webmeet_chat_list` + `webmeet_transcript_list` + `webmeet_artifact_list` + `webmeet_agent_list`). The 4 parallel webmeet tools each spawn a separate `webmeet_tool.mjs` node subprocess. Each one calls `cleanupMeetingPresence` first thing, which mutates the same `meeting_<id>.json` record via `mutateMeeting → saveMeetingRecord → writeJsonFile`.

`writeJsonFile` was using `fs.writeFileSync(filePath, …)` — non-atomic, in-place truncate-then-write. Concurrent readers occasionally hit the file mid-write, got empty content, and `JSON.parse('')` threw "Unexpected end of JSON input". The exception bubbled to the `webmeet_tool.mjs` `main().catch` (line 212) which writes the message to stderr and exits 1 — empty stdout means the MCP server can't parse the tool's response and returns JSON-RPC -32603 to the client.

**Reproduction (32 calls):** 3 random failures across different tools (artifact_list, transcript_list ×2). After the fix (120 calls): 0 failures.

**Fix:** `AssistOSExplorer/webmeetAgent/lib/webmeetStore.mjs` — `writeJsonFile` now writes to `<file>.<pid>.<ts>.tmp` then `fs.renameSync` over the target. Mirrored to the deployed clone at `~/work/testExplorerFresh/.ploinky/repos/AchillesIDE/webmeetAgent/lib/webmeetStore.mjs`. No container restart needed because the tool subprocess reloads the JS file from disk on every spawn.

If you see this error pattern again on **any** tool (gitAgent, dpuAgent, etc.) where multiple parallel calls hit the same JSON file, the fix template is the same: temp + rename. The pattern is implemented in ploinky's own crypto stores (`encryptedPasswordStore.js`, `encryptedSecretsFile.js`) and `transcriptStore.js`.

### 2026-04-30 — Watchdog/RoutingServer env propagation fix

**Problem found by user:** A fresh `ploinky start` left the host-side `Watchdog.js` and `RoutingServer.js` processes without `SOUL_GATEWAY_API_KEY`, `SOUL_GATEWAY_BASE_URL`, or `PLOINKY_MASTER_KEY` in their env, even though `~/work/.env` had those values and the agent containers received them correctly via `buildEnvFlags`. Verified via `ps -E -ww` on PIDs 64549/64550. The container-side env injection chain (`secretInjector` → `buildEnvFlags` → `-e` flags) was always merging `.secrets` + walked-up `.env`, but the Watchdog-spawn path only inherited the operator's shell `process.env`.

**Fix:** `ploinky/cli/services/workspaceUtil.js`
- Imported `loadEnvFile` (from `secretInjector`) and `readSecretsFile` (from `encryptedSecretsFile`).
- Added `buildRouterEnv()` helper that merges walked-up `.env` → `.ploinky/.secrets` → `process.env` in that order (mirrors `secretInjector.getSecret` precedence: operator-exported wins, `.secrets` next, `.env` lowest).
- Changed `spawnWatchdog()` to use `buildRouterEnv()` instead of `...process.env`.

The Watchdog already inherits from its own `process.env` when respawning the RoutingServer (`Watchdog.js:357`), so once the Watchdog has the right env, restart-resilience is automatic — the user's stated invariant.

**Verified:**
1. Restarted Watchdog/Router from `~/work/testExplorerFresh`. New PIDs 80395 (Watchdog) and 80396 (RoutingServer) both have `SOUL_GATEWAY_API_KEY`, `SOUL_GATEWAY_BASE_URL`, `PLOINKY_MASTER_KEY`, `ASSISTOS_FS_ROOT` in their env (`ps -p <pid> -E -ww` confirmed).
2. **Restart-resilience proof:** killed RoutingServer (PID 80396) directly. Watchdog respawned it as PID 80613 within ~4 seconds; new PID has `SOUL_GATEWAY_*` and `PLOINKY_MASTER_KEY` intact.
3. All 237 unit tests still pass (`find tests/unit -maxdepth 1 -type f \( -name '*.test.mjs' -o -name '*.test.js' \) | xargs node --test`).

**Operator-precedence kept:** if you `export SOUL_GATEWAY_API_KEY=...` in the shell that runs `ploinky start`, your value still wins over what's in `.secrets`/`.env` — the merge order ends with `...process.env`.

### 2026-04-30 — Session: encryption format simplification + sandbox-disabled-by-default + first fresh deploy

**Encryption format** (the on-disk envelope for `.ploinky/.secrets` and `.ploinky/passwords.enc`):
- Was: pretty-printed JSON envelope `{ version, alg, iv, tag, ciphertext }`.
- Now: a single base64 line + newline. Decoded layout: `[12 bytes IV][16 bytes GCM tag][N bytes ciphertext]`. **No version byte. No JSON. No legacy fallbacks (no JSON-envelope path, no kv-text plaintext migration, no raw-master-key fallback).** The user explicitly opted out of backward-compat for stored data.

**Master key derivation** (`ploinky/cli/services/masterKey.js`):
- Was: 64-hex strings decoded as raw bytes; otherwise SHA-256(seed).
- Now: every non-empty value is `SHA-256(raw, 'utf8')`. The 64-hex special case is removed. The env var lookup order is unchanged: `process.env.PLOINKY_MASTER_KEY` first, then walk-upward `.env` from `process.cwd()`.

**Sandbox default flipped** (`ploinky/cli/services/sandboxRuntime.js`):
- Was: `disableHostRuntimes` defaulted to `false` → `lite-sandbox: true` manifests auto-routed to bwrap (Linux) or seatbelt (macOS).
- Now: defaults to `true` → `lite-sandbox: true` manifests go to podman/docker by default. To opt back into host sandboxes, run `ploinky sandbox enable` per workspace, or set workspace config `sandbox.disableHostRuntimes: false`.
- Env override `PLOINKY_DISABLE_HOST_SANDBOX=1` still force-disables regardless of workspace config.
- The `getSandboxStatus().source` field now distinguishes `'default'` (no workspace setting) from `'workspace'` (explicit boolean) from `'environment'` (env override).

**Files touched this session** (paths are relative to `/Users/danielsava/work/file-parser/`):
- `ploinky/cli/services/masterKey.js` — removed 64-hex branch.
- `ploinky/cli/services/encryptedPasswordStore.js` — full rewrite: packed format, no version byte, no JSON branch, no raw-master fallback.
- `ploinky/cli/services/encryptedSecretsFile.js` — same simplifications + dropped kv-text plaintext migration. Removed `isEncryptedSecretsEnvelope` from exports.
- `ploinky/cli/services/sandboxRuntime.js` — flipped default, refactored status reporting.
- `ploinky/cli/services/help.js` — sandbox notes mention new default.
- `ploinky/docs/specs/DS004-runtime-execution-and-isolation.md` — documented opt-in.
- `ploinky/docs/specs/DS011-security-model.md` — same; also updated the master-key paragraph (line 32) to say SHA-256(seed) is the only path.
- `ploinky/tests/unit/masterKey.test.mjs` — replaced hex-byte assertions with SHA-256-digest assertions; deleted the "reads 64-hex values as raw key bytes" test.
- `ploinky/tests/unit/encryptedPasswordStore.test.mjs` — assertion now checks for packed-base64 line, not JSON.
- `ploinky/tests/unit/encryptedSecretsFile.test.mjs` — same; removed kv-text bootstrap; renamed test ("migrates plaintext" dropped).
- `ploinky/tests/unit/profileSystem.test.mjs` — 5 tests rewritten to seed `.secrets` via `setSecretValue` + `clearSecretsFile()` between tests; the "strips quotes" test became a "round-trips via setSecretValue" test.
- `ploinky/tests/unit/runtimeResourcePlanner.test.mjs` — replaced plaintext-`.secrets` pre-seed with `setSecretValue`.
- `ploinky/tests/unit/sandboxRuntime.test.mjs` — added new test "host sandbox is disabled by default and routes lite-sandbox to containers"; updated the "lite-sandbox fails with guidance when host sandbox runtime is unavailable" test to call `setHostSandboxDisabled(false)` first.
- `ploinky/tests/unit/encryptedStoresMigration.test.mjs` — **deleted** (legacy migration window closed).
- `AssistOSExplorer/explorer/scripts/hooks/encrypted-secrets.mjs` — full rewrite to match ploinky: SHA-256 master key, packed format, no JSON/kv/version-byte/fallback paths.
- `AssistOSExplorer/explorer/utils/server/onlyoffice/workspace-secrets.mjs` — same; HKDF-derived storage key (was using raw master without HKDF — broken even before this session).

**Test status:** all 237 ploinky unit tests pass (`find tests/unit -maxdepth 1 -type f \( -name '*.test.mjs' -o -name '*.test.js' \) | xargs node --test`). One AssistOSExplorer unit test (`onlyofficeWorkspaceSecrets.test.js`) also passes.

**Committed in prior work.** No uncommitted changes from that session remain in `ploinky/` or `AssistOSExplorer/` as of the router URL fix above. Per memory rule, still do not commit future changes without explicit user approval.

---

## Local fresh-deploy (testing changes before they ship)

> This section is for local testing only. **The production deploy to `skills.axiologic.dev` is a different procedure — see the "Remote deployment" section below. Never run `ploinky start` or rsync changes over a remote workspace.**

The user uses `~/work/testExplorerFresh/` as the canonical fresh-deploy test workspace. Master key comes from `~/work/.env` (which has `PLOINKY_MASTER_KEY=<64-hex value>`). The walk-upward `.env` lookup picks it up automatically because `~/work/testExplorerFresh/` is a child of `~/work/`.

### 1. Cleanup any prior deploy

```bash
# Kill any lingering ploinky/agent host processes.
pkill -9 -f testExplorerFresh

# Remove podman containers tied to this workspace.
podman ps -a --filter 'name=testExplorerFresh' -q | xargs -r podman rm -f

# Wipe the workspace and recreate it.
rm -rf ~/work/testExplorerFresh && mkdir -p ~/work/testExplorerFresh
```

If `rm -rf` fails with "Directory not empty", look for stale agent processes via `lsof +D ~/work/testExplorerFresh` and `ps aux | grep testExplorerFresh`. The previous session can leave seatbelt/host agent processes (sh + node trees) and the ploinky Watchdog/RoutingServer alive after the user closes the terminal. `pkill -9 -f testExplorerFresh` is the blunt fix.

### 2. Deploy

```bash
cd ~/work/testExplorerFresh
PLOINKY=/Users/danielsava/work/file-parser/ploinky/bin/ploinky

# Clone the AchillesIDE repo from GitHub into .ploinky/repos/AchillesIDE/.
$PLOINKY enable repo AchillesIDE

# Override the clone with the local working copy so unstaged changes are tested.
rsync -a --delete --exclude='.git' --exclude='node_modules' \
  /Users/danielsava/work/file-parser/AssistOSExplorer/ \
  ~/work/testExplorerFresh/.ploinky/repos/AchillesIDE/

# Enable the explorer agent in global mode (workspace folder is mounted into the container).
$PLOINKY enable agent AchillesIDE/explorer global

# Start the router on port 8080. Long-running. Run in background or in another terminal.
$PLOINKY start explorer 8080
```

`ploinky start explorer 8080` runs in 6 dependency waves. Expect to see `Dependency wave N/6:` messages followed by `agent: ready after Ns.` lines. The full first-time start can take several minutes because container images get pulled and `apk add` runs inside fresh alpine containers for many of the agents.

**Known transient flake — `soplangAgent`:** during a cold-network start, `soplangAgent`'s in-container `npm install` runs a postinstall that does `git clone https://github.com/OpenDSU/Persisto.git`. On a freshly-booted podman VM this can fail with `fatal: unable to access ... Failed to connect to github.com port 443: Connection refused`, which aborts the whole start (`start (workspace) failed: 1 agent(s) failed to start: soplangAgent`). It is not related to anything in this repo. **Fix: just rerun `ploinky start explorer 8080`** — ploinky is idempotent and will retry only the failed agent and continue from there. Confirmed working on 2026-04-30: first attempt failed with this exact error, second attempt completed waves 1–6 cleanly with all 16 containers up.

### 3. What "deployed" looks like

After the start completes, the following 16 podman containers should be `Up` (names confirmed in fresh deploy on 2026-04-30):

```
ploinky_onlyoffice_testExplorerFresh
ploinky_AchillesIDE_explorer_testExplorerFresh_d8f88a10
ploinky_AchillesIDE_dpuAgent_testExplorerFresh_d8f88a10
ploinky_AchillesIDE_gitAgent_testExplorerFresh_d8f88a10
ploinky_AchillesIDE_llmAssistant_testExplorerFresh_d8f88a10
ploinky_AchillesIDE_multimedia_testExplorerFresh_d8f88a10
ploinky_AchillesIDE_soplangAgent_testExplorerFresh_d8f88a10
ploinky_AchillesIDE_tasksAgent_testExplorerFresh_d8f88a10
ploinky_AchillesIDE_webAdmin_testExplorerFresh_d8f88a10
ploinky_AchillesIDE_webAssist_testExplorerFresh_d8f88a10
ploinky_AchillesIDE_webmeetAgent_testExplorerFresh_d8f88a10
ploinky_webmeetInfra_webmeetCoturn_testExplorerFresh_d8f88a10
ploinky_webmeetInfra_webmeetRedis_testExplorerFresh_d8f88a10
ploinky_webmeetInfra_webmeetLivekitServer_testExplorerFresh_d8f88a10
ploinky_webmeetInfra_webmeetLivekitEgress_testExplorerFresh_d8f88a10
ploinky_webmeetInfra_stack_testExplorerFresh_d8f88a10
```

Plus the host-side `Watchdog.js` and its child `RoutingServer.js`. The router listens on port 8080. The Explorer UI is at `http://localhost:8080/` (responds `HTTP 302` redirect to login).

To smoke-check the workspace env propagation fix landed on this deploy:
```bash
ROUTER_PID=$(pgrep -f "RoutingServer.js" | head -1)
ps -p "$ROUTER_PID" -E -ww | tr ' ' '\n' | grep -E "^(SOUL_GATEWAY|PLOINKY_MASTER_KEY|ASSISTOS_FS_ROOT)"
```
Both Watchdog and RoutingServer should show `SOUL_GATEWAY_API_KEY`, `SOUL_GATEWAY_BASE_URL`, `PLOINKY_MASTER_KEY`, `ASSISTOS_FS_ROOT`. If they don't, the `spawnWatchdog`/`buildRouterEnv` change in `cli/services/workspaceUtil.js` regressed.

After the sandbox-default flip, every agent runs in podman by default. To opt back into bwrap/seatbelt: `ploinky sandbox enable` from the workspace, then restart.

---

## Remote deployment to skills.axiologic.dev

> **Hard rule from the user, do not violate:** Deploy **only** when the user explicitly tells you to. Never trigger a workflow run on your own initiative. Never SSH directly to deploy or modify the remote — SSH is for **status checks only**. All deploy/update/destroy actions go through `gh workflow run`.

**Remote target:**

| Field | Value |
|---|---|
| SSH user @ host | `admin@193.180.209.191` (overridable via `vars.SSH_USER` / `vars.SSH_HOST`) |
| Public URL | `https://skills.axiologic.dev` |
| Default workspace dir on remote | `~/explorerWorkspace` |
| Default router port | `8097` |

**Workflows** (under `AssistOSExplorer/.github/workflows/`):

| File | Workflow `name:` | Purpose |
|---|---|---|
| `provision-skills-explorer-host.yml` | `Provision Skills Explorer Host` | One-time/rare host provisioning: OS packages, Podman, Node.js, initial Ploinky install, `achillesAgentLib`, PATH symlinks. Run before first deploy or when the host prerequisites drift. |
| `deploy-skills-explorer.yml` | `Deploy Skills Explorer` | Deploy/update path for `skills.axiologic.dev`. Inputs: `branch`, `workspace_name`, `router_port`, `public_url`, `profile`. Assumes provisioned host, runs `ploinky update`, uses Ploinky commands for repo/agent state, and does not hand-edit `.ploinky/*.json`. |
| `deploy-explorer.yml` | `Deploy Explorer (Fresh Install)` | Generic fresh-install variant (without the skills.axiologic.dev branding). |
| `update-explorer.yml` | `Update Explorer` | **DEPRECATED — has a bug.** Was supposed to update an existing remote deployment without a destroy. Its "Restart services" step opens a fresh SSH bash with no `PLOINKY_MASTER_KEY` in the env, then runs `ploinky stop` + `ploinky start`; every agent fails decryption (`Unable to decrypt .ploinky/.secrets: PLOINKY_MASTER_KEY is required`). Confirmed broken on 2026-04-30 (run 25163272435). **Use `Deploy Skills Explorer` for updates.** For a fresh deployment, run `Destroy Explorer (Remote Wipe)` first, then deploy. |
| `destroy-explorer.yml` | `Destroy Explorer (Remote Wipe)` | Stops/removes all `_<workspace>_` containers, OnlyOffice container, and (by default) `rm -rf`'s the workspace dir. |
| `remote-skills-status.yml` | `Remote Skills Status` | Read-only diagnostic: git status of repos, `ploinky status`, `podman ps`, log tail, HTTP checks. Use this to confirm a deploy succeeded. |

### Clean redeploy procedure

When the user asks for a clean redeploy of skills.axiologic.dev:

```bash
# 1. Wipe the remote workspace and containers.
gh workflow run "Destroy Explorer (Remote Wipe)" \
  -R PloinkyRepos/AssistOSExplorer \
  -f workspace_name=explorerWorkspace \
  -f remove_workspace_dir=true

# 2. Watch it finish, capture the run id.
gh run list -R PloinkyRepos/AssistOSExplorer --workflow "Destroy Explorer (Remote Wipe)" --limit 1
gh run watch <run-id> -R PloinkyRepos/AssistOSExplorer

# 3. Fresh deploy. The host must already be provisioned.
gh workflow run "Deploy Skills Explorer" \
  -R PloinkyRepos/AssistOSExplorer \
  -f branch=main \
  -f workspace_name=explorerWorkspace \
  -f router_port=8097 \
  -f public_url=https://skills.axiologic.dev

# 4. Watch the deploy.
gh run list -R PloinkyRepos/AssistOSExplorer --workflow "Deploy Skills Explorer" --limit 1
gh run watch <run-id> -R PloinkyRepos/AssistOSExplorer
```

(Adjust `-R <owner/repo>` if the upstream repo location differs — confirm by reading the remote URL on a fresh `gh repo view`. The workflows are checked into `AssistOSExplorer/.github/workflows/`, so the owner/repo is whatever the AssistOSExplorer remote points at.)

### After every gh workflow run — verify on the remote

The user requires a status check after each action. Two complementary ways:

1. **Run the status workflow** (preferred — uses GitHub's SSH key, hands back structured output):
   ```bash
   gh workflow run "Remote Skills Status" -R PloinkyRepos/AssistOSExplorer
   gh run watch <run-id> -R PloinkyRepos/AssistOSExplorer
   ```
   This dumps `ploinky status`, `podman ps`, log tail, and HTTP checks for `https://skills.axiologic.dev`.

2. **Direct SSH for a quick spot-check** (read-only — DO NOT modify state). The private key for `admin@193.180.209.191` is at `~/demo_private_key.pem` (mode 0600, RSA, ~1.6 KB). Always pass it with `-i ~/demo_private_key.pem`; the user's default ssh key does **not** authenticate to this host (test with `ssh ... whoami` returns `Permission denied (publickey,...)`). The remote `ploinky` binary is `/home/admin/.local/bin/ploinky` (not `/usr/local/bin/ploinky` — that path doesn't exist; `which ploinky` confirms).
   ```bash
   ssh -i ~/demo_private_key.pem admin@193.180.209.191 'podman ps --format "table {{.Names}}\t{{.Status}}"'
   ssh -i ~/demo_private_key.pem admin@193.180.209.191 'cd ~/explorerWorkspace && ploinky status'
   ssh -i ~/demo_private_key.pem admin@193.180.209.191 'tail -100 ~/explorerWorkspace/logs/skills-explorer-start.log'
   # Inspect host-process env (Watchdog / RoutingServer) — useful to confirm
   # SOUL_GATEWAY_API_KEY etc. propagated from gh secrets through buildRouterEnv:
   ssh -i ~/demo_private_key.pem admin@193.180.209.191 \
     'pid=$(pgrep -f Watchdog.js | head -1); sudo tr "\0" "\n" </proc/$pid/environ | grep -E "^(SOUL_GATEWAY|PLOINKY_MASTER_KEY|ASSISTOS_FS_ROOT)" | sed "s/=.*/=<set>/"'
   ```
   Stay strictly read-only. No `ploinky start`, no `podman rm`, no file edits over SSH. When grepping env vars from `/proc/<pid>/environ`, use prefix patterns like `^SOUL_GATEWAY` (not exact-name `^SOUL_GATEWAY=`) since the actual variables are `SOUL_GATEWAY_API_KEY`, `SOUL_GATEWAY_BASE_URL`, etc.

### Resolved: routerSettings.js incident (2026-04-30)

Commit `da7bdbf` on `OutfinityResearch/ploinky:master` ("Update admin UI and settings functionality") added an import for `readRouterSettings`/`updateRouterSettings` from `../services/routerSettings.js` into `cli/server/authHandlers.js` but did not include the `routerSettings.js` file. The remote router crash-looped with `ERR_MODULE_NOT_FOUND`, the Watchdog circuit-breaker tripped, and `Deploy Skills Explorer` runs timed out after 13 minutes at "Waiting for local router...". Workaround at the time was to pin Ploinky to a temporary branch `deploy-stable` pointing at `afb4918`.

**Resolved** in commit `d59622f` ("Add missing cli/services/routerSettings.js") on master. The temporary `deploy-stable` branch was deleted via `git push origin --delete deploy-stable`. The skills deploy workflow no longer accepts a Ploinky branch input; it uses the provisioned Ploinky install and `ploinky update`. Kept this note as a record of the failure mode in case a similar import-without-file ever lands again — the symptom is `ERR_MODULE_NOT_FOUND` in `~/explorerWorkspace/.ploinky/logs/router.log` looping until the Watchdog gives up.

### Repo naming caveat on the remote

The remote status workflow checks `.ploinky/repos/fileExplorer` (not `AchillesIDE`). The remote deployment seems to use a different repo alias for the same content. When debugging the remote, look under `~/explorerWorkspace/.ploinky/repos/fileExplorer/`, not `AchillesIDE/`. If you're confused about repo identity vs the local fresh-deploy (which uses `AchillesIDE`), this is why.

### Watching a workflow run via gh

Useful invocations:

```bash
# Latest 5 runs across all workflows in the repo
gh run list -R PloinkyRepos/AssistOSExplorer --limit 5

# Live-watch a specific run
gh run watch <run-id> -R PloinkyRepos/AssistOSExplorer

# Pull logs after the run finishes
gh run view <run-id> -R PloinkyRepos/AssistOSExplorer --log

# Re-run a failed run
gh run rerun <run-id> -R PloinkyRepos/AssistOSExplorer --failed
```

---

## How to run the test suite

```bash
cd /Users/danielsava/work/file-parser/ploinky
find tests/unit -maxdepth 1 -type f \( -name '*.test.mjs' -o -name '*.test.js' \) | xargs node --test
```

The repo's `npm test` runs the heavy E2E orchestrator (`./tests/run-all.sh`), which spins up real podman containers and is much slower. Stick to the unit suite for quick iteration.

---

## Key files and what they do

### Crypto / secrets

- `ploinky/cli/services/masterKey.js` — `resolveMasterKey()` returns `SHA-256(seed)`; `deriveSubkey(purpose)` HKDF's it under `ploinky/<purpose>/v1`. Per-purpose subkeys: `storage/passwords`, `storage/secrets`, `session`, `invocation`.
- `ploinky/cli/services/encryptedPasswordStore.js` — manages `.ploinky/passwords.enc`. Used by local-auth users storage.
- `ploinky/cli/services/encryptedSecretsFile.js` — manages `.ploinky/.secrets`. The on-disk envelope is the single source of truth; `secretInjector.js` and others read/write through `readSecretsFile`/`setSecretValue` from this module.
- `ploinky/cli/services/secretInjector.js` — `loadSecretsFile`, `getSecret`, `getSecrets`, `validateSecrets`, `buildSecretEnvFlags`. Wraps the encrypted store with env-var precedence and `.env` fallback.
- `AssistOSExplorer/explorer/scripts/hooks/encrypted-secrets.mjs` — CLI invoked from `preinstall.sh` (the explorer agent's host hook). Uses the same packed format and HKDF derivation as ploinky, so files are mutually readable. Subcommands: `get | resolve | set | delete`.
- `AssistOSExplorer/explorer/utils/server/onlyoffice/workspace-secrets.mjs` — runtime-side reader of `.ploinky/.secrets`, used by the explorer's HTTP routes for OnlyOffice config. Same derivation.

### Sandbox / runtime selection

- `ploinky/cli/services/sandboxRuntime.js` — config + status; key knob is `cfg.sandbox.disableHostRuntimes`. Default is now disabled (`true`).
- `ploinky/cli/services/docker/common.js` — `getRuntimeForAgent(manifest)` is the dispatch: throws on legacy `runtime:` strings, else honors `lite-sandbox: true` only when sandbox isn't disabled, else falls through to container runtime.
- `ploinky/cli/services/docker/agentServiceManager.js` — the actual podman/docker launcher (`PLOINKY_WIRE_SECRET` injected near the env setup). Also owns runtime router env injection (`PLOINKY_ROUTER_PORT`, `PLOINKY_ROUTER_HOST`, `PLOINKY_ROUTER_URL`) and must append those after manifest/profile/secrets env so stale workspace vars cannot override the live router port.
- `ploinky/cli/services/bwrap/bwrapServiceManager.js` — Linux host-sandbox path (`PLOINKY_WIRE_SECRET = deriveSubkey('invocation').toString('hex')` at line 385).
- `ploinky/cli/services/seatbelt/seatbeltServiceManager.js` — macOS host-sandbox path.

### Wire protocol (router ↔ agent JWTs)

- `ploinky/Agent/lib/invocationAuth.mjs` — agent-side verifier. Reads `PLOINKY_WIRE_SECRET` (hex) which the router injects.
- `ploinky/cli/server/utils/transcriptCrypto.js` — separate envelope used inside `.ploinky/transcripts/`. Uses `PLOINKY_TRANSCRIPTS_MASTER_KEY` (different env var). NOT updated this session — still has its own DEK-wrap pattern.

---

## Spec docs to read for context

All under `ploinky/docs/specs/`. Most relevant for current work:

- `DS004-runtime-execution-and-isolation.md` — runtime selection, host sandbox opt-in, mount policies. Updated this session.
- `DS006-auth-capabilities-and-secure-wire.md` — secure-wire JWT flow.
- `DS007-dependency-caches-and-startup-readiness.md` — how `node_modules` caches are prepared per runtime family.
- `DS011-security-model.md` — system-level security contract; section "Workspace Key and Encrypted Storage" (line ~32) and "Runtime Isolation and Mount Policy" (line ~109) updated this session.

For AssistOSExplorer:

- `AssistOSExplorer/README.md` — canonical deploy sequence (the source of the `enable repo / enable agent / start` recipe above).
- `AssistOSExplorer/docs/EXPLORER_AGENT_DOCS.md` — explorer-specific notes on `global` vs `devel` mode, port pinning, dependency readiness.
- `AssistOSExplorer/docs/analysis-explorer-agents.md` — secret/env wiring for OnlyOffice, dpu, etc.

---

## What to look for when something breaks

| Symptom | Likely cause |
|---|---|
| `Unable to decrypt .ploinky/.secrets` | Wrong `PLOINKY_MASTER_KEY` (or different key was used to write the file). With backward-compat removed, there is no fallback. Wipe `.ploinky/.secrets` and rebuild via `ploinky var <NAME> <value>` or rerun preinstall. |
| `PLOINKY_MASTER_KEY is required` | No env var, and no `.env` walked up from `cwd` had it. Check `~/work/.env`. |
| `Encrypted .secrets envelope is incomplete` | The file is shorter than `IV(12) + tag(16) + 1` byte. Probably a partial write or someone hand-edited it. Wipe and rebuild. |
| `start (workspace) failed: 1 agent(s) failed to start: soplangAgent` with `Failed to connect to github.com port 443: Connection refused` in the log | Transient cold-network flake on the podman VM during `soplangAgent`'s in-container `npm install` (postinstall does `git clone https://github.com/OpenDSU/Persisto.git`). Not related to repo code. **Just rerun `ploinky start explorer 8080`** — ploinky retries only the failed agent and continues. Confirmed harmless on 2026-04-30. |
| `lite-sandbox: true requested ... bwrap/seatbelt not found` | Sandbox is enabled but the host runtime isn't installed. Either install it or run `ploinky sandbox disable` (or rely on the new default — disabled). |
| Watchdog or RoutingServer is missing `SOUL_GATEWAY_API_KEY` (or other workspace env) | The `spawnWatchdog`/`buildRouterEnv` path in `ploinky/cli/services/workspaceUtil.js` regressed. The Watchdog must merge `loadEnvFile()` + `readSecretsFile()` + `process.env` at spawn time so RoutingServer inherits the workspace env across crash-respawn cycles. Verify with `ps -p <pid> -E -ww`. |
| GitHub device auth or agent-to-agent calls fail with `TypeError: fetch failed` on `skills.axiologic.dev` | Check the calling agent container's `PLOINKY_ROUTER_URL`. It must be `http://host.containers.internal:8097` on the remote skills deployment. If it shows `8080`, the startup routing-file seed or runtime-router-env override in `ploinky/cli/services/workspaceUtil.js` / `ploinky/cli/services/docker/agentServiceManager.js` regressed. |
| `/webmeetAgent/IDE-plugins/...` static assets return 302/login HTML, stall, or fail while other agent plugin assets work | Check router route-boundary matching. Broad `pathname.startsWith('/webmeet')` or similar root service checks can shadow agent names such as `webmeetAgent`. Use `isRouteMount(pathname, '/webmeet')` semantics: exact `/webmeet` or `/webmeet/...` only. |
| LiveKit/WebMeet room connection fails in browsers while static plugin assets load | Check the public LiveKit URL and TLS first. As of 2026-05-04, `livekit.skills.axiologic.dev` still fails TLS handshake through Cloudflare; a `*.axiologic.dev` wildcard does not cover that nested hostname. |
| `MCP error -32603: Unexpected end of JSON input` from any agent tool, especially under `Promise.all` parallel calls | Race condition: multiple subprocesses reading and writing the same JSON record file with non-atomic `fs.writeFileSync`. Fix is temp + rename (see `webmeetAgent/lib/webmeetStore.mjs:writeJsonFile`). Reproduce by spawning 4–8 parallel tool calls against the same record. |
| Agents won't start, `Directory not empty` on workspace cleanup | Stale ploinky processes still alive. `pkill -9 -f testExplorerFresh` then retry. |
| `restart: unless-stopped` containers come back after `podman rm -f` | The previous start's preinstall hook (e.g. `ensure_onlyoffice_service` in `explorer/scripts/hooks/preinstall.sh`) launches them with that policy. They're recreated by host supervisors only if those supervisors are alive — kill the ploinky processes first, then podman rm. |

---

## Open items / next session

- **LiveKit public TLS still needs Cloudflare work.** `skills.axiologic.dev` and WebMeet plugin static assets are fixed and redeployed, but `livekit.skills.axiologic.dev` still fails TLS handshake. Fix Cloudflare certificate/hostname coverage, then redeploy with the matching `WEBMEET_PUBLIC_LIVEKIT_URL` if the hostname changes.
- **No commit pending for the 2026-05-04 WebMeet static asset/update retry fix.** Ploinky commits `975847f` and `8555534`, and AssistOSExplorer commits `47bb169` and `fe63869`, were pushed and deployed to `skills.axiologic.dev` on 2026-05-04. Local untracked directories still existed after the fix (`ploinky/node_modules/` and unrelated `AssistOSExplorer/webassist/` / `webmeetInfra/` files); do not stage them unless the user explicitly asks.
- **No commit pending for the router URL fix.** `ploinky@afdd1c5` and `AssistOSExplorer@ed86b78` were pushed and deployed to `skills.axiologic.dev` on 2026-04-30. Local untracked directories still existed after the fix (`ploinky/node_modules/` and unrelated `AssistOSExplorer/webassist/` files); do not stage them unless the user explicitly asks.
- **`transcriptCrypto.js` not updated.** It still uses the JSON envelope shape internally for per-message records inside transcript files. If the goal is to make the entire codebase use the packed format, this is the remaining file. Discussed earlier in session, deferred.
- **Other AssistOSExplorer agents** (`webmeetAgent/lib/webmeetCrypto.mjs`, `dpuAgent/lib/dpu-store-internal/storage.mjs`) have their own AES stacks but encrypt their own private files — they don't share `.ploinky/.secrets` with ploinky, so they were left alone. Audit if a future change requires it.
- **No E2E test run.** Only unit tests were exercised. Running `./tests/run-all.sh` would catch deeper regressions but takes time and pulls images.
- **No real-browser GitHub device-auth smoke test after redeploy.** The fix was verified at the container/network level (`gitAgent` now reaches the router and gets `401` instead of `fetch failed`) plus public HTTP. If the user wants end-to-end UX confirmation, use the in-app browser and try the GitHub login flow on `https://skills.axiologic.dev`.
