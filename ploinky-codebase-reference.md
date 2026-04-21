# Ploinky Codebase Reference

Scope: this document analyzes the `ploinky/` codebase from code, config, JSON, shell scripts, tests, and workflows. Every `.md` file inside `ploinky/` was intentionally ignored. This file is outside `ploinky/` on purpose.

## 1. What Ploinky is

Ploinky is a local agent workspace/runtime that does five things at once:

1. It manages agent repositories under a workspace-local `.ploinky/repos/`.
2. It turns agent manifests into runnable services.
3. It runs those services through one of three backends: container runtime, `bwrap`, or macOS `seatbelt`.
4. It exposes them through a router with MCP aggregation plus web UIs (`/webtty`, `/webchat`, `/webmeet`, `/dashboard`, `/status`).
5. It provides an agent-side MCP runtime (`AgentServer.mjs`) for tool/resource/prompt execution.

The real control path is:

```text
bin/ploinky
  -> cli/index.js
    -> cli/commands/cli.js
      -> cli/services/workspaceUtil.js
        -> cli/services/docker|bwrap|seatbelt/*
          -> Agent/server/AgentServer.sh + AgentServer.mjs
      -> cli/server/Watchdog.js
        -> cli/server/RoutingServer.js
          -> routerHandlers + mcp-proxy + auth + web handlers
```

## 2. Top-level layout

| Path | Role | Notes |
| --- | --- | --- |
| `ploinky/bin/` | Shell launchers | `ploinky`, `p-cli`, `ploinky-shell`, `psh` |
| `ploinky/cli/` | Main product code | Interactive CLI, repo/agent management, runtimes, router server |
| `ploinky/Agent/` | Agent-side runtime | Default MCP HTTP server and agent client helper |
| `ploinky/.ploinky/` | Checked-in workspace state | Seeded repos, manifests, runtime-style layout |
| `ploinky/tests/` | Integration + unit tests | Shell suites, fixtures, manifest tests |
| `ploinky/.github/workflows/` | CI | Daily Docker and Podman test jobs |
| `ploinky/globalDeps/` | Shared dependency source | Global dependency package used to build agent workspaces |
| `ploinky/node_modules/`, `ploinky/globalDeps/node_modules/` | Vendored deps | Includes `achillesAgentLib`, `mcp-sdk`, `node-pty`, `flexsearch` |
| `ploinky/dashboard/` | Standalone static dashboard assets | I found no runtime references from `cli/` or `Agent/`; inference: legacy/prototype UI |
| `ploinky/docs/` | Static HTML docs/specs | I found no runtime references from `cli/` or `Agent/`; inference: bundled reference site, not live server code |
| `ploinky/webLibs/` | Client-side helper libs | Includes `qrLib` |

Two structural facts matter:

- The repo ships with a real `.ploinky/` workspace already inside the source tree.
- Source code and runtime state are mixed together by design.

## 3. Entry points and process model

### Shell wrappers

- `bin/ploinky`
  - sets `PLOINKY_ROOT`
  - routes `-shell`, `--shell`, or `sh` to `bin/ploinky-shell`
  - otherwise runs `node cli/index.js`
- `bin/p-cli`
  - alias to `bin/ploinky`
- `bin/ploinky-shell`
  - runs `node cli/shell.js`
- `bin/psh`
  - alias to `ploinky sh`

### CLI boot

`cli/index.js` is the real main entrypoint:

- initializes workspace directories and files via `initEnvironment()`
- bootstraps the default `basic` repo via `bootstrap()`
- starts interactive mode when no args are passed
- otherwise dispatches directly to `handleCommand()`

Interactive mode adds:

- command history in `.ploinky/ploinky_history`
- tab completion backed by `commandRegistry.js`, enabled repos, and agent manifests
- multiline navigation

### Separate “Ploinky Shell”

`cli/shell.js` is not the same as `shell <agent>`.

- `cli/shell.js` is an LLM-backed command recommendation shell.
- `shell <agent>` in `cli/commands/cli.js` opens an interactive shell inside a running agent runtime.

## 4. Workspace filesystem model

Workspace root is resolved by `cli/services/config.js` as the nearest ancestor containing `.ploinky`. That makes Ploinky behave like a per-workspace runtime rather than a machine-global service.

Important workspace paths:

| Path | Purpose |
| --- | --- |
| `.ploinky/agents.json` | Enabled agent registry plus `_config` workspace config |
| `.ploinky/enabled_repos.json` | Enabled repo list |
| `.ploinky/.secrets` | Workspace secret store and token storage |
| `.ploinky/profile` | Active profile name |
| `.ploinky/routing.json` | Router port, static agent, dynamic routes |
| `.ploinky/servers.json` | Web service token/port metadata |
| `.ploinky/repos/` | Installed agent repositories |
| `.ploinky/agents/<agent>/` | Per-agent writable work dir |
| `.ploinky/code/<agent>` | Symlink to agent code tree |
| `.ploinky/skills/<agent>` | Symlink to agent skills dir if present |
| `.ploinky/shared/` | Shared host directory mounted into runtimes |
| `.ploinky/logs/` | Router/watchdog/runtime logs |
| `.ploinky/running/` | PID files |
| `.ploinky/transcripts/` | Transcript storage for web surfaces |

`agents.json` is the central registry. It stores:

- enabled agents
- alias instances
- auth mode
- profile
- runtime
- bind mounts
- exposed env names
- port mappings
- `_config.static` for the chosen static agent and router port
- `_config.sso` for SSO/provider settings

## 5. Repo and agent discovery

### Repo management

`cli/services/repos.js` manages repository install/enable/update.

Predefined repos:

- `basic`
- `cloud`
- `vibe`
- `security`
- `extra`
- `AchillesIDE`
- `AchillesCLI`
- `demo`
- `proxies`

Default bootstrap behavior:

- `cli/services/ploinkyboot.js` ensures the `basic` repo exists under `.ploinky/repos/basic`
- if present, it auto-enables `basic`

### Agent discovery

Agents are discovered as:

```text
.ploinky/repos/<repo>/<agent>/manifest.json
```

`cli/services/utils.js::findAgent()` supports:

- `repo/agent`
- `repo:agent`
- unique short agent names

If a short name exists in multiple repos, it fails with an ambiguity error.

### Enabled agent modes

`cli/services/agents.js::enableAgent()` supports:

- `isolated` default
  - writable project path becomes `.ploinky/agents/<agent>/`
- `global`
  - project path becomes workspace root
- `devel <repoName>`
  - project path becomes `.ploinky/repos/<repoName>/`

It also supports:

- aliases via `as <alias>`
- auth mode override `--auth none|pwd|sso`
- local auth seed user via `--user` and `--password`

Alias rules are explicit and validated. The alias becomes both the route key and the container/service identity suffix.

## 6. Command surface

### Where commands actually come from

There are two command sources:

- `cli/commands/cli.js` is the real dispatcher.
- `cli/services/commandRegistry.js` is the completion/help registry.

Important implementation note:

- `commandRegistry.js` does not fully match `cli.js`.
- Actual dispatch supports commands that the registry omits, including `webchat`, `dashboard`, `sso`, and `client tool`.

### Primary commands

| Command | Purpose |
| --- | --- |
| `add repo` | Clone/install repo |
| `enable repo` | Enable repo for agent discovery |
| `disable repo` | Disable repo from active listings |
| `update`, `update repo`, `update all` | Pull repo changes |
| `enable agent` | Register agent instance in workspace |
| `disable agent` | Remove agent registration if runtime no longer exists |
| `start [staticAgent] [port]` | Resolve dependencies, start services, launch router watchdog |
| `restart [agent|router]` | Restart one agent, only router, or the whole workspace |
| `reinstall [agent]` | Force recreate a running agent runtime |
| `shell <agent>` | Interactive shell attached to agent runtime |
| `cli <agent> [args...]` | Run manifest CLI command interactively |
| `status` | Workspace + routing status |
| `list agents|repos|routes` | Discovery and routing inspection |
| `stop` | Stop router and configured runtimes |
| `shutdown` | Stop router and destroy configured workspace containers |
| `destroy`, `clean` | Remove all workspace containers |
| `logs tail`, `logs last` | Router log inspection |
| `var`, `vars`, `echo`, `expose` | Secret/env management |
| `webtty`, `webconsole`, `webchat`, `webmeet`, `dashboard` | Token rotation and access URL prep |
| `sso enable|disable|status` | SSO config management |
| `profile list|validate|show` | Profile inspection |
| `client tool|list|status|task-status` | Router/MCP client operations |
| `settings`, `/settings` | Model/key settings menu |

Fallback behavior:

- unknown commands first try local system command execution
- if still unresolved, they fall back to an LLM suggestion flow in `llmSystemCommands.js`

## 7. Manifest model

Agent manifests live at `manifest.json` beside each agent.

### Core top-level fields

| Field | Meaning |
| --- | --- |
| `container` / `image` | Base image for container runtime |
| `runtime` | Explicit backend, e.g. `bwrap` or `seatbelt` |
| `lite-sandbox: true` | Auto-select sandbox backend (`seatbelt` on macOS, `bwrap` otherwise, fallback to container) |
| `agent` or `commands.run` | Main agent command |
| `start` | Start command for service-style agents |
| `cli` or `commands.cli` | Interactive CLI command |
| `about` | Agent description used in listings |
| `update` | Legacy update/install metadata, still present in some manifests |
| `repos` | Repo bootstrap directives applied before start |
| `enable` | Dependency/sidecar enable directives |
| `volumes` | Extra host->runtime mounts |
| `expose` | Extra env values exported to runtime |
| `readiness.protocol` | `mcp` or `tcp` |
| `health` | Health probe config used by `containerMonitor` |
| `ploinky` | Ploinky directives such as `pwd enable` or `sso enable` |
| `pwd.users` | Local auth seed users |
| `profiles` | Required config block when profile-aware behavior is used |

### Command semantics

Ploinky distinguishes four execution modes:

| Manifest shape | Effective mode |
| --- | --- |
| neither `start` nor `agent` | implicit `AgentServer.sh` |
| `agent` only | foreground explicit agent command |
| `start` only | foreground start command |
| both `start` and `agent` | start+agent mode |

Readiness defaults:

- explicit `manifest.readiness.protocol` wins
- `start`-only manifests default to `tcp`
- all other modes default to `mcp`

### Profile model

Profiles are handled by `cli/services/profileService.js`.

Supported profile names:

- `default`
- `dev`
- `qa`
- `prod`

Rules:

- if `profiles` exists, `default` is required
- active profile defaults to `dev`
- `default` is merged with the active profile

Profile fields used by runtime managers:

| Field | Meaning |
| --- | --- |
| `env` | Env injection; object or array syntax |
| `ports` | Port mapping strings |
| `mounts.code` / `mounts.skills` | `rw` or `ro` override |
| `install` | Runtime install hook |
| `preinstall` | host hook before runtime creation |
| `hosthook_aftercreation` | host hook after runtime creation |
| `postinstall` | runtime/container postinstall |
| `hosthook_postinstall` | host hook after postinstall |
| `secrets` | required secret names |

Default mount policy:

- `dev`: code + skills are `rw`
- `qa` / `prod`: code + skills are `ro`

### Env specification formats

`env` supports both forms:

1. Object form

```json
{
  "KEY": "value",
  "INSIDE_NAME": { "varName": "OUTSIDE_NAME", "required": true, "default": "x" }
}
```

2. Array form

```json
[
  "KEY",
  "KEY=default",
  { "name": "INSIDE", "varName": "OUTSIDE", "required": true }
]
```

Wildcard support is implemented in `secretVars.js`:

- `LLM_MODEL_*`
- `ACHILLES_*`
- `OPENAI_*_URL`
- `*`

Important rule:

- wildcard `*` intentionally excludes variables whose names contain `API_KEY`

Resolution order for env values:

1. `.ploinky/.secrets`
2. `process.env`
3. workspace `.env`
4. manifest default

### Dependency directives

`enable` entries are parsed by `bootstrapManifest.js` and `workspaceDependencyGraph.js`.

Supported forms include:

- `depAgent`
- `repo/depAgent`
- `depAgent global`
- `depAgent devel someRepo`
- `depAgent as alias`
- `basic/keycloak`

Important dependency rule:

- `basic/keycloak` is only auto-enabled when the agent auth mode resolves to `sso`

### Extra runtime volumes

`volumes` maps host path to runtime path.

Behavior:

- relative host paths are resolved against workspace root
- paths are created if missing
- some service-specific paths get extra treatment, e.g. Keycloak data directories

### Separate `mcp-config.json`

Ploinky also has a second manifest-like file: `mcp-config.json`, read by `AgentServer.mjs`.

Lookup order:

1. `PLOINKY_AGENT_CONFIG`
2. `MCP_CONFIG_FILE`
3. `AGENT_CONFIG_FILE`
4. `PLOINKY_MCP_CONFIG_PATH`
5. `/tmp/ploinky/mcp-config.json`
6. `${PLOINKY_CODE_DIR or /code}/mcp-config.json`
7. `process.cwd()/mcp-config.json`

It can define:

- `tools[]`
- `resources[]`
- `prompts[]`
- `maxParallelTasks`
- `taskLogTailBytes`

Tool/resource commands are launched as external processes and communicate via JSON payloads on stdin/stdout.

## 8. Startup, dependency graph, and lifecycle

`cli/services/workspaceUtil.js::startWorkspace()` is the core orchestration path.

Sequence:

1. Optionally auto-enable the static agent.
2. Persist `_config.static.agent` and `_config.static.port`.
3. Mint or ensure tokens for `webtty`, `webchat`, `dashboard`, `webmeet`.
4. Run the static agent profile `preinstall` host hook before dependency startup.
5. Apply manifest directives:
   - clone/enable repos from `repos`
   - enable dependent agents from `enable`
6. Build a dependency graph via `resolveWorkspaceDependencyGraph()`.
7. Topologically group graph into waves.
8. For each wave:
   - ensure each runtime exists
   - update `.ploinky/routing.json`
   - wait for readiness (`mcp` or `tcp`)
9. Start extra enabled agents that were not part of the dependency graph.
10. Launch `cli/server/Watchdog.js` in the background.

Graph features:

- recursive dependency resolution
- alias-preserving nodes
- cycle detection
- invalid dependency entry logging instead of hard fail
- auth-aware gating for `basic/keycloak`

Lifecycle hooks are implemented in `cli/services/lifecycleHooks.js`.

Lifecycle order:

1. workspace structure init
2. symlink creation
3. profile `preinstall` host hook
4. runtime creation
5. `hosthook_aftercreation`
6. install work
7. `postinstall`
8. `hosthook_postinstall`

## 9. Runtime backends

Backend selection is centralized in `cli/services/docker/common.js::getRuntimeForAgent()`.

### Backend matrix

| Backend | How selected | Main implementation |
| --- | --- | --- |
| container runtime | default | `cli/services/docker/agentServiceManager.js` |
| `bwrap` | `runtime: "bwrap"` or `lite-sandbox` on Linux | `cli/services/bwrap/bwrapServiceManager.js` |
| `seatbelt` | `runtime: "seatbelt"` or `lite-sandbox` on macOS | `cli/services/seatbelt/seatbeltServiceManager.js` |

Container runtime selection:

- prefers `podman`
- falls back to `docker`

If sandbox startup fails, Ploinky falls back to the container runtime.

### Common mount model

Across backends, Ploinky tries to expose the same logical layout:

| Runtime path | Host source | Purpose |
| --- | --- | --- |
| `/Agent` | repo `Agent/` dir | Agent runtime library |
| `/code` | `.ploinky/code/<agent>` target | Agent source |
| `/code/node_modules` | `.ploinky/agents/<agent>/node_modules` | Writable deps |
| `/Agent/node_modules` | same node_modules dir | Lets `AgentServer.mjs` resolve modules |
| `/shared` | `.ploinky/shared` | Shared workspace data |
| `/code/skills` | `.ploinky/skills/<agent>` target | Optional skills mount |
| `<projectPath>` | selected project path | CWD passthrough for global/devel/isolated modes |
| extra volume targets | from manifest `volumes` | Agent-specific storage |

Additional behavior:

- if the writable work dir is not under the chosen CWD mount, it is mounted explicitly
- `dpuAgent` gets a dedicated `/dpu-data` mount backed by `DPU_DATA_ROOT`

### Container backend

Implemented in `docker/agentServiceManager.js`.

Notable behavior:

- computes env hash and recreates runtime when env changed
- mounts `/code` as `rw` in `dev`, `ro` in `qa`/`prod`
- if no profile ports are defined, it assigns a random host port to container port `7000`
- stores runtime metadata back into `agents.json`
- launches explicit sidecar agent command when both `start` and `agent` are defined

### `bwrap` backend

Implemented in `bwrap/bwrapServiceManager.js`.

Characteristics:

- creates a bind-mounted sandbox that preserves host networking
- uses detached processes rather than containers
- logs to `.ploinky/logs/<agent>-bwrap.log`
- stores PID in `.ploinky/bwrap-pids/`
- uses host port equal to the service’s listening port
- supports interactive attach sessions via a second short-lived sandbox

### `seatbelt` backend

Implemented in `seatbelt/seatbeltServiceManager.js`.

Characteristics:

- macOS-only `sandbox-exec` based isolation
- no Linux-style mount namespace, so it rewrites `/code` and `/Agent` references to real host paths
- writes generated seatbelt profiles under `.ploinky/seatbelt-profiles/`
- rewrites `mcp-config.json` into the work dir for real-path access

Implementation note:

- `seatbelt` uses a different entry-command builder than the container backend.
- Based on the code, its command resolution gives `start` precedence and does not mirror the container runtime’s explicit sidecar launch path in the same way. That is a code-path difference, not just documentation wording.

## 10. Dependency installation model

The dependency system is centered on `cli/services/dependencyInstaller.js`.

Core idea:

- every agent gets a writable work package under `.ploinky/agents/<agent>/package.json`
- that package is built by merging:
  - `globalDeps/package.json`
  - the agent’s own `package.json`, if present

`globalDeps/package.json` is treated as the single source of truth for shared runtime dependencies:

- `achillesAgentLib`
- `mcp-sdk`
- `flexsearch`
- `node-pty`

Install strategy:

- prepare merged package on the host before runtime start
- runtime entrypoint performs `npm install --no-package-lock --prefix "$WORKSPACE_PATH"` as needed
- helper logic can also run temp container installs when required

## 11. Router/server architecture

### Watchdog

`cli/server/Watchdog.js` is the long-lived supervisor for `RoutingServer.js`.

Responsibilities:

- spawn router process
- health-check `/health`
- restart with exponential backoff
- circuit-break after too many failures
- own a `containerMonitor`

### Routing server

`cli/server/RoutingServer.js` is the main HTTP server. It exposes:

- `/health`
- `/dashboard`
- `/webtty`
- `/webchat`
- `/webmeet`
- `/status`
- `/upload`
- `/blobs`
- `/mcp`
- `/mcps/<agent>/mcp`
- `/services/...` and `/public-services/...` HTTP passthrough routes

### MCP routing modes

There are two router MCP layers:

1. Aggregated router MCP at `/mcp`
   - implemented in `routerHandlers.js`
   - aggregates `tools/list`, `resources/list`, `tools/call`, `resources/read`, `ping`
   - annotates each tool/resource with `annotations.router.agent`

2. Per-agent MCP proxy at `/mcps/<agent>/mcp`
   - implemented in `server/mcp-proxy/index.js`
   - keeps MCP session IDs
   - forwards JSON-RPC to the chosen agent
   - injects auth metadata into tool calls

### Auth model

The router supports three auth paths:

- tokenized local web access for web surfaces
- local username/password auth per agent/workspace
- SSO/OIDC auth, with Keycloak-oriented defaults

Key files:

- `cli/server/authHandlers.js`
- `cli/server/auth/service.js`
- `cli/server/auth/localService.js`
- `cli/services/sso.js`

Notable behaviors:

- SSO config is stored in workspace `_config.sso`
- local auth users can come from manifest `pwd.users` or CLI seed flags
- agent-to-agent auth uses client credentials and `/auth/agent-token`

### Container monitor and health probes

`cli/server/containerMonitor.js` watches enabled agents from `agents.json`.

It:

- syncs monitor targets from workspace registry
- checks whether each runtime is alive
- runs health probes from manifest `health`
- restarts failed runtimes through `ensureAgentService()`
- understands both container and sandbox runtimes

## 12. Agent runtime architecture

### Default entrypoint

`Agent/server/AgentServer.sh` is the default agent wrapper.

Behavior:

- if a command is passed, it exports `CHILD_CMD`
- then it supervises `AgentServer.mjs` in an infinite restart loop

### `AgentServer.mjs`

This is Ploinky’s agent-side MCP HTTP server.

Endpoints:

- `GET /health`
- `GET /getTaskStatus?taskId=...`
- `POST /mcp`

Capabilities:

- dynamically load tools/resources/prompts from `mcp-config.json`
- validate input schemas with `zod` from `mcp-sdk`
- execute external commands
- support async tool execution through `TaskQueue`

### Task queue

`Agent/server/TaskQueue.mjs` provides:

- max concurrency
- disk persistence of queue state
- restart recovery
- per-task log tailing

Queue storage file:

- `.tasksQueue` in the agent process working directory

### Agent-to-agent client

`Agent/client/AgentMcpClient.mjs` lets an agent call other agents through the router.

It:

- discovers router URL from env
- gets bearer tokens from `/auth/agent-token`
- opens MCP client connections to `/mcps/<agent>/mcp`

## 13. Built-in manifest inventory

The checked-in `basic` repo currently contains these manifests:

### Shell/container utility agents

| Agent | Image | Notable manifest behavior |
| --- | --- | --- |
| `alpine-bash` | `alpine:latest` | `cli: bash` |
| `debian-bash` | `debian:latest` | legacy `run: bash` |
| `fedora-bash` | `fedora:latest` | simple shell environment |
| `rocky-bash` | `rockylinux` | simple shell environment |
| `ubuntu-bash` | `ubuntu:latest` | simple shell environment |
| `shell` | `node:20.19.5-alpine` | `cli: sh` |
| `node-dev` | `node:20-bullseye` | Node dev image with install hook |
| `curl-agent` | `curlimages/curl:latest` | curl-focused container |
| `docker-agent` | `docker:24-cli` | docker CLI image |
| `github-cli-agent` | `ghcr.io/cli/cli:latest` | GitHub CLI image |
| `gitlab-cli-agent` | `alpine:latest` | GitLab CLI-style utility |
| `postman-cli` | `postman/newman:alpine` | Newman/Postman runner |
| `puppeteer-agent` | `ghcr.io/puppeteer/puppeteer:latest` | browser automation base |
| `clamav-scanner` | `clamav/clamav:latest` | security scan container |

### Stateful/service agents

| Agent | Image | Notable manifest behavior |
| --- | --- | --- |
| `postgres` | `postgres:16-alpine` | `start: postgres`, volume `postgres/data`, env object |
| `keycloak` | `quay.io/keycloak/keycloak:24.0` | `start: keycloak start ...`, volume `keycloak/keycloak-data`, `default/dev/prod` profiles, rich env object |

### Test/fixture manifests that document features

| Manifest | What it demonstrates |
| --- | --- |
| `tests/testAgent/manifest.json` | `lite-sandbox`, combined `start` + `agent`, explicit `cli`, profile env, profile ports, install hook, dependency enable directives, extra volumes, TCP readiness |
| `tests/fixtures/coral-agent/manifest.json` | wildcard env expansion and MCP-oriented agent command |

## 14. Tests and CI

### Test layout

| Path | Purpose |
| --- | --- |
| `tests/unit/` | unit coverage for env wildcards, readiness, profiles, dependency graph, health probes, startup behavior |
| `tests/test-functions/` | end-to-end shell suites for CLI, aliases, web surfaces, mounts, SSO, logging, installs, volume mounts, readiness |
| `tests/testAgent/` | synthetic agent fixture with real manifest/server/start scripts |
| `tests/fixtures/` | manifest fixtures |
| `tests/run-all.sh`, `tests/test_all.sh` | main test runners |

### CI

GitHub Actions:

- `tests-docker.yml`
- `tests-podman.yml`

Both run the shell test suite daily and on manual dispatch, then upload logs.

## 15. Non-runtime and legacy-looking assets

Based on source references:

- `dashboard/` appears to be a standalone dashboard bundle not wired into `RoutingServer.js`.
- `docs/` appears to be static HTML reference/spec content, not part of the live server routing.
- `test-table-rendering.html` is an isolated utility/demo file.

That is an inference from the current code paths: I did not find runtime imports or request routing into those directories from `cli/` or `Agent/`.

## 16. Notable implementation details and mismatches

These are architecture-relevant, not style comments:

- The root `ploinky/package.json` still describes a different product shape: `name: "ploinky-cloud"`, `bin.p-cloud`, and `main: cloud/core/server.js`. The active implementation is actually `bin/ploinky` -> `cli/index.js`.
- `cli/services/commandRegistry.js` is not the full source of truth for supported commands; `cli/commands/cli.js` handles more commands than the registry advertises.
- The repo contains both source code and a checked-in workspace `.ploinky/`, which means some runtime data is part of the repository itself.
- Shared dependencies are managed through both vendored `node_modules/` and the separate `globalDeps/` package used to construct agent workspaces.

## 17. Short architecture summary

Ploinky is not just a CLI and not just a router. It is a workspace-scoped orchestration system built around checked-in agent manifests, a local registry in `.ploinky/`, pluggable runtime backends, and an MCP-first router.

The main architectural boundary lines are:

- `bin/` and `cli/` for control plane
- `.ploinky/` for workspace state and installed repos
- `docker/`, `bwrap/`, `seatbelt/` for runtime instantiation
- `Watchdog.js` and `RoutingServer.js` for service exposure
- `AgentServer.mjs` plus `mcp-config.json` for per-agent MCP behavior

If you want a single sentence description:

> Ploinky is a local agent workspace orchestrator that discovers agents from repo manifests, materializes them into container or sandbox runtimes, then exposes and aggregates them through a router and MCP/web frontends.
