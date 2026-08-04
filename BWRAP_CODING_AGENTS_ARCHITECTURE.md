# Bubblewrap Architecture for Coding Agents in Ploinky Box

Analysis date: 2026-08-04

Status: proposed target architecture; not yet implemented

## 1. Executive summary

`ploinky-box` remains the single outer Podman container and the deployment boundary for Ploinky. Inside that Box, Ploinky becomes a hybrid runtime:

| Workload | Runtime inside `ploinky-box` |
| --- | --- |
| `opencodeAgent`, `codexAgent`, `piAgent`, and equivalent coding agents | Bubblewrap (`bwrap`) |
| The provider process launched by a coding agent | nested `bwrap` |
| Router, Box supervisor, watchdog, and Ploinky control plane | trusted Box processes |
| Explorer and ordinary application agents | nested Podman unless migrated separately |
| OnlyOffice, LiveKit, STT, WebTTY, Soul Gateway, local LLM, Umami, and other image-dependent services | nested Podman |

The target does not add a generic `runtime.isolation` object. It reuses the existing manifest signal:

```json
{
  "startup": "manual",
  "lite-sandbox": true
}
```

Inside the Box, the contract is deliberately small:

| Manifest state | Runtime decision |
| --- | --- |
| `lite-sandbox: true` | `bwrap` is mandatory |
| missing or `lite-sandbox: false` | container runtime remains available |
| `bwrap` unavailable or its capability probe fails | fail closed; never fall back silently to Podman |

`startup` is independent from isolation. `startup: "manual"` prevents automatic revival during a general workspace start, but an explicit browser delegation or `ploinky cli <agent>` may still start the agent.

The target has two trust levels:

| Level | Role | Workspace access |
| --- | --- | --- |
| trusted outer coding AgentServer | MCP/OpenAI endpoints, task queue, validation, nested launch | complete workspace RW |
| actual provider CLI/task | OpenCode, Codex, PI, and their child commands | complete workspace RO, selected launch directory RW, private HOME RW |

The provider may be launched in any canonical directory below `/workspace`. Once launched, it can write only to that directory subtree and its own HOME. Other workspace content remains readable but not writable. Ploinky control-plane secrets and other agents' homes are hidden rather than merely mounted read-only.

This nested model is intentional:

```text
ploinky-box
├── bwrap: opencodeAgent AgentServer (trusted, workspace RW)
│   └── bwrap: OpenCode task (workspace RO, WORKDIR RW, HOME RW)
└── bwrap: interactive launcher
    └── bwrap: OpenCode TUI (workspace RO, WORKDIR RW, HOME RW)
```

OpenCode and PI already contain most of the task-local nested-bwrap mechanism. Codex must be brought under the same Ploinky boundary instead of relying only on its built-in `workspace-write` sandbox.

## 2. Scope and evidence labels

This document covers the current implementation in:

| Area | Repository or directory |
| --- | --- |
| Box lifecycle, runtime selection, bwrap, CLI, Router | `ploinky/` |
| Copilot and coding agents | `AchillesCLI/` |
| Explorer dependency graph | `AssistOSExplorer/explorer/` and its direct dependencies |
| Box image | `container-image-builds/` |
| Router, relay, and Soul integration where relevant | `proxies/` and Ploinky runtime code |

The terms below distinguish facts from design:

| Label | Meaning |
| --- | --- |
| Observed | read directly from source, manifests, tests, or image definitions |
| Inferred | follows from observed behavior and Linux namespace or mount semantics |
| Target | required architecture described by this document |
| Open | requires a product decision or native runtime test |

Existing dirty worktrees must be preserved. Implementation changes across affected repositories belong on the `ploinky-proxy` branch. Relevant existing work should be committed and pushed in coherent commits; unrelated or ambiguous changes must not be silently mixed into the migration.

## 3. Current architecture

### 3.1 Process boundaries

```mermaid
flowchart TB
    H["Host CLI or browser"]
    O["Outer Podman container: ploinky-box"]
    R["Ploinky Router, watchdog, supervisor"]
    E["Nested Podman: explorer"]
    A["Nested Podman: achilles-cli / Copilot"]
    C1["Nested Podman: opencodeAgent"]
    C2["Nested Podman: piAgent"]
    C3["Nested Podman: codexAgent"]
    T1["Task-local bwrap: OpenCode"]
    T2["Task-local bwrap: PI"]
    T3["Codex built-in workspace-write sandbox"]

    H --> O
    O --> R
    R --> E
    R --> A
    A -->|"MCP execute-task"| C1
    A -->|"MCP execute-task"| C2
    A -->|"MCP execute-task"| C3
    C1 --> T1
    C2 --> T2
    C3 --> T3
```

Observed: the `/etc/ploinky-box` marker currently forces the inner runtime to Podman before `lite-sandbox` is evaluated. `ploinky sandbox enable` is rejected in the Box. Consequently, coding AgentServers currently run as nested Podman containers even though their manifests contain `lite-sandbox: true`.

Observed: OpenCode and PI already launch each provider task in another bwrap sandbox. Those implementations probe nested bwrap, validate the project path, clear the environment, create a private PID boundary, and mount the selected project RW. Codex currently launches the Codex CLI directly and relies on `codex --sandbox workspace-write`.

### 3.2 Browser-to-Copilot flow

```mermaid
sequenceDiagram
    participant U as Browser user
    participant W as Explorer WebChat
    participant A as achilles-cli Copilot
    participant M as Marketplace/runtime
    participant C as Coding AgentServer
    participant P as Provider process

    U->>W: "Use opencodeAgent to implement X"
    W->>A: WebChat prompt
    A->>A: deterministic coding-agent selection
    A->>M: ensure requested agent is enabled and running
    M->>C: start agent on demand
    A->>C: MCP execute-task(prompt, projectDir)
    C->>P: launch provider task
    C-->>A: task handle/status
    A-->>W: task started; continue observing asynchronously
```

The current deterministic mapping is:

| Detected text | Copilot skill | Target agent |
| --- | --- | --- |
| `codex` or `codexAgent` | `launch-codex` | `AchillesCLI/codexAgent` |
| `opencode`, `open code`, or `opencodeAgent` | `launch-opencode` | `AchillesCLI/opencodeAgent` |
| `piAgent` or `pi coding agent` | `launch-pi` | `AchillesCLI/piAgent` |

The browser does not communicate directly with the provider process. The launcher starts the AgentServer through Marketplace and calls MCP `execute-task` asynchronously.

### 3.3 Current interactive flow

```mermaid
sequenceDiagram
    participant H as Host CLI
    participant B as ploinky-box wrapper
    participant L as ploinky-local
    participant S as Agent service manager
    participant I as Interactive runtime

    H->>B: ploinky cli opencodeAgent
    B->>L: podman exec with TTY, workdir /workspace
    L->>L: resolve or auto-enable agent globally
    L->>S: ensureAgentService and wait for readiness
    L->>I: execute manifest.cli in selected runtime
```

Observed: the CLI already has separate container and bwrap attachment paths. The bwrap path creates a new interactive bwrap sandbox; it does not enter the running AgentServer's namespace.

Observed: `manifest.cli` for OpenCode currently points directly to `"$HOME/.opencode/bin/opencode"`. Therefore, if only the outer service were migrated, the interactive provider would run with the broader outer mount plan and would bypass the narrower task sandbox.

Observed: the public Box wrapper currently executes `ploinky-local` with `/workspace` as its fixed working directory. Although `runCliWithDependencies` passes `PLOINKY_CWD`, the current bwrap attachment resolves the registered global project path and does not implement a complete arbitrary-subfolder contract.

### 3.4 Explorer dependency graph

```mermaid
flowchart LR
    X["AssistOSExplorer/explorer"]
    X --> G["gitAgent"]
    X --> D["dpuAgent"]
    X --> S["soplangAgent"]
    X --> T["tasksAgent"]
    X --> A["AchillesCLI/achilles-cli"]
    X --> WT["basic/webtty"]
    X --> LK["webmeetInfra/liveKitServerAgent"]
    X --> STT["webmeetStt"]
    X --> WM["webmeetAgent"]
    WM --> LK
    X --> MM["multimedia"]
    X --> OO["onlyOffice"]
    X --> SG["proxies/soul-gateway"]
    A --> SG
    SG --> LLM["default-local-llm"]
    X --> WA["webAssist"]
    X --> U["UmamiAgent/umamiAgent"]
```

| Agent or service | Relevant current property | Initial target |
| --- | --- | --- |
| `explorer` | generic Node image, currently has `lite-sandbox`, manages repository access | remain Podman; remove or migrate misleading flag |
| `gitAgent`, `dpuAgent`, `soplangAgent`, `tasksAgent`, `multimedia`, `webAssist` | mostly Node agents; several currently have `lite-sandbox` | remain Podman until evaluated separately |
| `achilles-cli` | Copilot and orchestrator | remain Podman in the first coding-agent migration |
| `webtty` | specialized image and complete workspace mount | remain Podman |
| `liveKitServerAgent` | Redis, LiveKit, Egress, host networking, UDP 7882 | Podman required |
| `webmeetStt` | Python image and persistent data | remain Podman |
| `webmeetAgent` | application agent with persistent `/data` | remain Podman |
| `onlyOffice` | specialized image and multiple persistent volumes | Podman required |
| `soul-gateway` | LLM gateway and persistent SQLite state | remain Podman |
| `default-local-llm` | model/runtime image | Podman required |
| `umamiAgent` | specialized PostgreSQL, Umami, and MCP image despite `lite-sandbox: true` | Podman required; remove the flag |
| `opencodeAgent`, `piAgent`, `codexAgent` | manual startup, interactive CLI, asynchronous tasks, persistent state | migrate to bwrap |

Coding agents are not automatic startup dependencies of `achilles-cli`. They are optional and start on demand. That behavior must remain unchanged.

## 4. The outer `ploinky-box`

### 4.1 Current mounts, ports, and devices

The outer Box currently accepts exactly four mounts:

| Host or engine source | Target in `ploinky-box` | Mode | Purpose |
| --- | --- | --- | --- |
| Ploinky source checkout | `/opt/ploinky` | bind RO | CLI, Router, Agent runtime, entrypoint |
| named `workspace` volume | `/workspace` | RW with ownership mapping | complete workspace, `.ploinky`, and `.data` |
| named `containers` volume | `/home/podman/.local/share/containers` | RW with ownership mapping | nested Podman storage |
| named `dependencies` volume | `/opt/ploinky/node_modules` | RW with ownership mapping | Ploinky runtime dependencies |

| Publication or security property | Current contract |
| --- | --- |
| Router TCP | `127.0.0.1:<hostPort>:8080/tcp` |
| LiveKit media | `0.0.0.0:7882:7882/udp` |
| devices | `/dev/fuse`, `/dev/net/tun` |
| security options | `unmask=ALL`; `label=disable` where required by Podman Machine |
| user | rootless `podman` |
| container-engine socket | not mounted |
| privileged mode | not part of the contract |

The migration must not expose a Docker or Podman socket to coding sandboxes.

### 4.2 Current Box image

`container-image-builds/images/ploinky-box/Dockerfile` is based on pinned `quay.io/podman/stable`. It copies Node 24 and npm from `node:24-bookworm-slim`, copies `cloudflared`, and installs Podman networking/storage utilities plus Git and base system packages.

Observed: the image does not currently install `bubblewrap`.

Observed: the image is not identical to `assistos/ploinky-node:24-bookworm-tools`. Once coding agents stop using that container image as their root filesystem, all required provider tooling must either exist in the Box or be mounted as immutable runtime content.

### 4.3 Required Box changes

| Change | Reason |
| --- | --- |
| install a pinned `bubblewrap` package | required runtime binary |
| retain Node 24 and npm under `/usr/local` | shared provider runtime |
| guarantee CA certificates, shell utilities, Git, SSH client, and curl | common coding-agent requirements |
| include Python/build tooling only where smoke tests prove it is needed | avoid an unnecessarily large ABI |
| add native nested-bwrap capability probes | fail before launching agents on unsupported kernels/runtime configurations |
| test native `linux/amd64`, `linux/arm64`, and Linux inside Podman Machine | nested namespaces depend on kernel and outer runtime behavior |

The outer Box must not be made privileged merely to make bwrap work. Required namespace, `/proc`, mount, and signal behavior must be proven with the production Box contract.

## 5. Workspace and `.ploinky` structure

Inside the Box, `PLOINKY_WORKSPACE_ROOT=/workspace`. Both `.ploinky` and `.data` live in the RW `workspace` named volume.

```text
/workspace/
├── <user projects and files>/
├── .ploinky/
│   ├── agents.json
│   ├── repo_sources.json
│   ├── repos/<repo>/...
│   ├── code/<agent> -> managed agent source
│   ├── skills/<agent> -> managed agent skills
│   ├── deps/
│   │   ├── global/<runtime-key>/
│   │   ├── agents/<repo>/<agent>/<runtime-key>/
│   │   └── bwrap-runtime/<agent-or-alias>/
│   ├── data/<persistent-storage-key>/
│   ├── shared/
│   ├── logs/
│   ├── running/
│   ├── run/
│   ├── bwrap-pids/
│   ├── routing.json
│   ├── servers.json
│   ├── profile
│   ├── .secrets
│   ├── passwords.enc
│   └── ploinky_subject_identity_ed25519_v1.enc
└── .data/
    └── <agent-or-alias>/
```

| Path | Role and sensitivity |
| --- | --- |
| `.ploinky/agents.json` | runtime, generation, routing, and agent registry |
| `.ploinky/repos` | managed source checkouts and installed manifests |
| `.ploinky/code`, `.ploinky/skills` | active-agent symlinks |
| `.ploinky/deps` | dependency cache and bwrap staging |
| `.ploinky/data/<key>` | declarative persistent runtime storage |
| `.data/<agent-or-alias>` | persistent private agent HOME backing directory |
| `.ploinky/shared` | global shared RW area; not granted to provider tasks by default |
| `.ploinky/logs`, `.ploinky/running`, `.ploinky/run`, `.ploinky/bwrap-pids` | logs, state, sockets, locks, and PID records |
| `.ploinky/routing.json`, `servers.json`, `profile`, `agents.json` | Ploinky control-plane data |
| `.ploinky/.secrets`, encrypted passwords, identity keys | sensitive material; never visible to provider processes |

The physical placement of an agent HOME under `/workspace/.data` must not make the full `.data` hierarchy readable through the provider's workspace mount. The task receives only its exact HOME at a separate logical path.

## 6. Existing bwrap implementation

### 6.1 Generic Ploinky runtime

Ploinky already has `bwrapServiceManager`, `bwrapFleet`, health probes, lifecycle records, readiness handling, and interactive attachment.

The current generic sandbox mounts:

| Resource | Current access |
| --- | --- |
| `/usr`, libraries, `/bin`, `/sbin`, certificates, DNS files | RO |
| `/proc`, `/dev`, `/tmp` | private or synthetic |
| the Node distribution used by Ploinky | RO at `/opt/ploinky-node` |
| Agent runtime | RO at `/Agent` |
| agent code | `/code`, RO or RW according to profile |
| prepared `node_modules` | RO at `/code/node_modules` and `/Agent/node_modules` |
| `.ploinky/shared` | RW at `/shared` |
| selected global/devel project | RW at its absolute path |
| `.data/<instance>` | RW at `/root` |
| environment | `--clearenv`, followed by explicit `--setenv` values |

The target reuses the lifecycle machinery but changes runtime selection, mount policy, HOME semantics, interactive execution, and Router credentials.

### 6.2 Node.js inside bwrap

Coding agents do not need an independent Node installation.

Observed current flow:

1. `ploinky-box` already contains Node 24 and npm under `/usr/local`.
2. Ploinky resolves the complete runtime prefix that contains `process.execPath`.
3. The prefix is mounted RO at `/opt/ploinky-node` inside bwrap.
4. `PATH` starts with `/opt/ploinky-node/bin`.
5. Codex and PI installers can call npm through `/opt/ploinky-node/lib/node_modules/npm/bin/npm-cli.js`.
6. Provider packages and mutable state are installed under the persistent agent HOME.

The same mechanism remains the target ABI. bwrap only changes the visible mount tree and process environment; it does not copy or virtualize Node by itself.

### 6.3 Current provider behavior

| Agent | Provider executable | Current task boundary |
| --- | --- | --- |
| OpenCode | `$HOME/.opencode/bin/opencode` | task-local nested bwrap |
| PI | `$HOME/.local/bin/pi` | task-local nested bwrap |
| Codex | `$HOME/.local/bin/codex` | Codex built-in `workspace-write`, no equivalent nested wrapper |

OpenCode currently writes configuration, cache, databases, and state below `.config`, `.cache`, `.local/share`, and `.local/state`. PI writes settings, extensions, and sessions below `.pi` and `.ploinky`. Codex writes authentication, configuration, history, and resumable session state below its HOME.

### 6.4 Blocking gaps

| Gap | Impact |
| --- | --- |
| Box marker forces Podman | `lite-sandbox` cannot select bwrap in the Box |
| coding manifests share `lite-sandbox` with unrelated agents | the flag inventory must be cleaned before its semantics become strict |
| current global bwrap service mounts the configured workspace RW | correct for the trusted AgentServer, too broad for the provider process |
| current interactive path executes `manifest.cli` directly | interactive providers bypass task-local policy |
| current public CLI starts at `/workspace` | arbitrary launch-directory selection is incomplete |
| current HOME is `/root` | conflicts with the preferred non-container bwrap HOME model |
| `RuntimeRelayManager` assumes Podman/Docker inspect and `podman exec` | bwrap ownership and relay require another path |
| bwrap currently strips generated-local Router credentials | AgentServer cannot yet participate fully in the Copilot MCP path |
| shared Box networking exposes Box loopback services | provider reachability is broader than filesystem policy alone suggests |

## 7. Target trust model and mount policy

### 7.1 Target boundaries

```mermaid
flowchart TB
    subgraph BOX["Outer Podman container: ploinky-box"]
        CP["Trusted Ploinky control plane"]
        CA["Nested Podman application agents"]
        AS["Outer bwrap: coding AgentServer"]
        IP["Inner bwrap: provider task or CLI"]

        CP --> AS
        CP --> CA
        AS -->|"validated nested launch"| IP
    end

    AS --> A1["/workspace RW"]
    AS --> A2["private persistent HOME RW"]
    IP --> P1["/workspace RO"]
    IP --> P2["selected WORKDIR RW overlay"]
    IP --> P3["same agent HOME RW"]
```

The outer AgentServer is part of the trusted computing base. It needs the complete workspace RW because an inner bwrap cannot upgrade an outer RO mount to RW. This is the principal limitation and justification for nested access.

The provider process is treated as untrusted. It receives a strictly narrower view constructed by the trusted adapter.

### 7.2 Outer coding AgentServer sandbox

| Source in Box | Target | Mode | Purpose |
| --- | --- | --- | --- |
| system runtime and required `/etc` files | same paths | RO | execution, TLS, DNS |
| Box Node distribution | `/opt/ploinky-node` | RO | Node/npm ABI |
| Agent runtime | `/Agent` | RO | AgentServer and MCP client |
| coding-agent source | `/code` | RO in normal profiles | adapters and endpoint handlers |
| prepared dependencies | `/code/node_modules`, `/Agent/node_modules` | RO | immutable dependencies |
| `/workspace` | `/workspace` | RW | validate and provide arbitrary future WORKDIR mounts |
| exact agent HOME backing directory | `/home/agent` | RW | provider installation, auth, sessions, continuation state |
| temporary storage | `/tmp` | tmpfs RW | ephemeral files |
| `/proc`, `/dev` | private/minimal | isolated | process boundary |

The AgentServer must not receive the Box master key or storage for nested Podman containers. Its Router identity must be limited to the exact agent instance and generation.

### 7.3 Inner provider sandbox

The provider mount order is a security property:

1. construct the system tree RO;
2. mount `/workspace` RO;
3. overlay the validated launch directory RW;
4. hide Ploinky control-plane and other-agent data paths;
5. mount the exact private agent HOME RW at `/home/agent`;
6. overlay immutable provider binaries RO if they are stored inside HOME;
7. create private `/tmp`, `/proc`, and minimal `/dev`;
8. clear and rebuild the environment;
9. `chdir` to the selected launch directory;
10. execute the provider.

| Resource | Provider access |
| --- | --- |
| complete user workspace | RO |
| selected launch directory and descendants | RW |
| private HOME for the same agent/alias | RW |
| provider executable | preferably RO |
| system, Node, CA, Git, SSH client | RO |
| `/tmp` | private tmpfs RW |
| Ploinky control plane | hidden |
| homes of other agents | hidden |
| Podman storage and engine socket | hidden or absent |
| global `.ploinky/shared` | absent by default |

This policy permits reading sibling user projects. It protects their integrity, not their confidentiality. A network-enabled provider can potentially exfiltrate readable content. If cross-project confidentiality becomes a product requirement, sibling projects must be hidden rather than mounted RO; that would be a policy change, not a manifest option.

### 7.4 Launch-directory validation

Any existing directory below `/workspace` is a valid launch target, subject to these rules:

| Rule | Requirement |
| --- | --- |
| canonical containment | `realpath(WORKDIR)` must equal `/workspace` or remain below it |
| traversal | reject explicit `..` traversal segments |
| symlinks | reject symlink components that can escape or change the target |
| type | every existing component and final target must be a directory |
| TOCTOU | revalidate immediately before spawn; prefer descriptor-based or `openat2` handling where practical |
| lifetime | the selected WORKDIR does not change for the lifetime of the provider process |
| root selection | selecting `/workspace` makes the whole user workspace RW and must be an explicit product decision |

Browser tasks supply `projectDir`. Interactive CLI must gain an unambiguous Ploinky-level workdir selector or correctly preserve an in-Box current directory. Ploinky options must not leak into provider arguments.

### 7.5 Paths hidden from provider processes

The exact implementation can use empty bind mounts, tmpfs masks, or a filesystem assembled without the sensitive source. The result must hide at least:

| Path or class | Reason |
| --- | --- |
| `/workspace/.ploinky/.secrets` and encrypted identity material | credentials and trust roots |
| `agents.json`, routing, server, authority, and profile state | control plane and topology |
| `.ploinky/run`, PID records, sockets, and locks | cross-instance control and confused-deputy risk |
| `.ploinky/deps` except exact immutable runtime mounts | dependency and staging internals |
| `/workspace/.data` as a hierarchy | homes of all agents |
| `/home/podman/.local/share/containers` | nested container storage |
| `/opt/ploinky` except staged exact runtime files | Ploinky control-plane implementation |
| `/dev/fuse`, `/dev/net/tun` | not needed by provider tasks |
| any Docker or Podman socket | container control |

If the selected coding project is itself under `.ploinky/repos`, Ploinky exposes only that exact repository subtree as the selected WORKDIR. It does not expose the rest of `.ploinky`.

## 8. HOME contract

### 8.1 Why HOME is RW

`bwrap` does not require a HOME variable or a writable home directory. Coding tools do.

HOME is the single provider-owned mutable area used for:

| State | Examples |
| --- | --- |
| authentication | provider login tokens and account selection |
| configuration | model, provider, extensions, preferences |
| sessions | resumable Codex threads, OpenCode databases, PI sessions |
| continuation state | asynchronous task handles and resumption metadata |
| caches | downloaded metadata and provider caches |
| CLI state | history and recently used models |
| current installation layout | OpenCode, Codex, and PI binaries/packages are installed below HOME today |

Without a persistent RW HOME, interactive login, session resume, model history, and the current install hooks fail or lose state on every launch.

### 8.2 Ownership and mapping

The target is one persistent HOME per agent instance or alias:

```text
Box backing path:
/workspace/.data/<agent-or-alias>

Sandbox path:
/home/agent

Environment:
HOME=/home/agent
```

`/root` is a container convention, not a bwrap requirement. `/home/agent` makes the non-container model explicit. Migration may temporarily retain `/root` if a provider has a hard compatibility dependency, but the reason must be documented and tested.

Different agents and aliases never share HOME. Concurrent tasks for the same alias require provider-specific concurrency testing because they may share databases and mutable configuration.

### 8.3 Persistent poisoning risk

An untrusted project can instruct a provider process to modify anything writable in its HOME. With the current layout, that includes binaries such as:

```text
$HOME/.opencode/bin/opencode
$HOME/.local/bin/codex
$HOME/.local/bin/pi
```

That allows one task to persist code that executes in future tasks for the same agent. The recommended mitigation is to keep HOME as the generic RW state area while making installed executables and package trees immutable in provider sandboxes. They can be provisioned by the trusted AgentServer, overlaid RO for tasks, or moved into a managed RO runtime path.

## 9. Environment, credentials, and network

### 9.1 Environment contract

Every bwrap boundary clears inherited variables and constructs the environment explicitly.

Typical provider values are:

```text
HOME=/home/agent
PATH=/home/agent/.local/bin:/home/agent/.opencode/bin:/opt/ploinky-node/bin:/usr/bin:/bin
XDG_CONFIG_HOME=/home/agent/.config
XDG_CACHE_HOME=/tmp/cache
XDG_DATA_HOME=/home/agent/.local/share
XDG_STATE_HOME=/home/agent/.local/state
TMPDIR=/tmp
```

Locale, terminal, color, and task-broker variables may be allowlisted. The provider must not inherit:

```text
PLOINKY_MASTER_KEY
PLOINKY_DERIVED_MASTER_KEY
credentials belonging to another agent
unrestricted Router credentials
unrelated provider API keys
```

Environment isolation is process-scoped. It is not a secret vault: descendants inherit allowed variables, and trusted Box processes may be able to inspect process state. Long-lived reusable secrets should use a narrower capability transport where possible.

### 9.2 AgentServer credentials

The outer AgentServer needs an identity capable of receiving authenticated MCP/Router traffic. The current bwrap runtime is principal-only and strips generated-local Router credentials, so this is a real migration blocker.

The target must provide exactly the current agent instance and generation with a narrowly scoped identity, without exposing the workspace master key. Acceptable implementation shapes include an exact read-only credential file or a Ploinky-owned Unix socket broker. The parent credential directory must not be mounted.

The inner provider never inherits the AgentServer credential. Managed model access should use a short-lived, task-scoped broker token similar to the scoped Soul broker already used by OpenCode and PI.

`RuntimeRelayManager` cannot be reused unchanged because it currently depends on container inspection, labels, a 64-character container ID, and `podman exec`. It must be generalized for an attested bwrap owner or bypassed by a purpose-built bwrap route.

### 9.3 Network contract

The architect's filesystem constraints do not settle networking.

OpenCode, Codex, and PI need outbound access to providers or the Soul gateway. Existing nested task bwrap uses shared networking. Shared Box networking is the smallest first migration, but it also exposes Box loopback services and does not provide network isolation between agents.

| Stage | Recommended policy |
| --- | --- |
| first migration | shared Box network only if Router/services are authenticated and the risk is accepted explicitly |
| hardening | private network namespace with controlled egress and explicit access to task-scoped brokers |

Network policy remains a runtime invariant. It is not represented by a new manifest field.

## 10. Target browser and interactive flows

### 10.1 Browser delegation

```mermaid
sequenceDiagram
    participant U as Browser user
    participant A as Copilot
    participant M as Marketplace/runtime
    participant S as AgentServer outer bwrap
    participant T as Provider nested bwrap

    U->>A: "Use opencodeAgent to implement X in projectDir"
    A->>M: ensure opencodeAgent is enabled and running
    M->>S: start bwrap service if needed
    A->>S: MCP execute-task(prompt, projectDir)
    S->>S: canonicalize and validate projectDir
    S->>T: launch nested bwrap
    Note over T: workspace RO<br/>projectDir RW<br/>HOME RW
    S-->>A: asynchronous task handle/status
```

Copilot selection and launch skills remain product-compatible. The runtime behind Marketplace changes from a nested Podman container to a bwrap AgentServer.

### 10.2 Interactive CLI

```mermaid
sequenceDiagram
    participant H as Host user
    participant B as ploinky-box
    participant L as ploinky-local
    participant S as AgentServer service bwrap
    participant I as Interactive outer bwrap
    participant P as Provider nested bwrap

    H->>B: ploinky cli opencodeAgent
    B->>L: enter existing Box with TTY
    L->>L: resolve or auto-enable agent
    L->>S: explicit start and readiness check
    L->>I: create interactive launcher with TTY
    I->>I: validate selected WORKDIR
    I->>P: launch manifest CLI through task policy
    Note over P: workspace RO<br/>WORKDIR RW<br/>HOME RW
    P-->>H: interactive TUI
```

The interactive provider must use the same effective policy builder as a browser task. It must not run `manifest.cli` directly in the broader AgentServer mount plan.

The interactive outer and inner processes use `--die-with-parent` and disappear when the session exits. The long-lived AgentServer may remain running for later browser calls.

### 10.3 `startup: "manual"`

`startup` controls automatic lifecycle only:

| Event | Manual agent behavior |
| --- | --- |
| general workspace start | do not start or revive automatically |
| explicit Marketplace/Copilot launch | start |
| `ploinky cli opencodeAgent` | start |
| readiness check for an explicit launch | run normally |
| later general restart without explicit demand | remain stopped |

It does not select Podman or bwrap, does not define interactivity, and does not control workspace access.

## 11. Manifest contract

The target coding-agent manifest needs no isolation class or policy matrix:

```json
{
  "startup": "manual",
  "lite-sandbox": true,
  "cli": "<provider command>"
}
```

| Property | Meaning |
| --- | --- |
| `lite-sandbox: true` | use mandatory bwrap runtime |
| `startup: "manual"` | on-demand lifecycle |
| `cli` | provider command exists and can be launched interactively |

The following are intentionally not manifest properties:

| Rejected property | Why it is unnecessary |
| --- | --- |
| `backend` | `lite-sandbox` already selects bwrap |
| `class` | Ploinky does not need a `coding-worker` taxonomy to enforce this invariant |
| `serviceWorkspace` | outer AgentServer policy is fixed by the runtime |
| `taskWorkspace` | selected-directory policy belongs to the task launcher |
| `network` | network is a runtime security decision |
| `interactive` | inferred from `manifest.cli` |

The existing `container` field must not be treated as the root filesystem for bwrap. Coding manifests should eventually remove it or mark it as deprecated compatibility metadata once dependency preparation no longer depends on it.

Before making `lite-sandbox` strict, audit every existing manifest. Remove the flag from image-dependent and non-target agents that must continue using Podman.

No workspace switch may silently override `lite-sandbox: true` to Podman. If bwrap cannot run, the operator receives an actionable error.

## 12. Lifecycle, status, and logging

The runtime registry must report the actual boundary and must not pretend that a bwrap process is a container.

| Field | Purpose |
| --- | --- |
| `runtime: "bwrap"` | actual backend |
| `instanceId`, `enableGeneration` | lifecycle identity |
| PID plus start time or equivalent ownership proof | PID reuse protection |
| service versus task plus `taskId` | ownership and cleanup |
| validated WORKDIR | auditability |
| mount-policy digest | drift detection |
| namespace identifiers where useful | native diagnostics and ownership |

Recommended runtime state:

```text
/workspace/.ploinky/
├── bwrap-pids/<runtime-key>.pid
├── running/bwrap/<instance-id>.json
├── run/bwrap/<instance-id>/
│   └── exact instance-scoped sockets or capabilities
└── logs/agents/<instance-id>/
    ├── service.log
    └── tasks/<task-id>.log
```

Logs are captured by the trusted launcher from stdout/stderr. Provider processes do not receive RW access to the global log directory.

| Operation | Required behavior |
| --- | --- |
| start | capability probe, prepare dependencies, launch AgentServer bwrap, wait for readiness |
| interactive attach | launch a new policy-constrained TTY session |
| task start | validate WORKDIR, create nested sandbox, return task handle |
| cancel/timeout | terminate the exact owned process tree |
| disable/re-enable | invalidate generation, credentials, tasks, and service |
| Box stop | terminate bwrap services and tasks before stopping the outer container |
| crash recovery | reject stale PID/generation records and clean orphaned processes |

No Podman container should appear in status or logs for a migrated coding agent. Non-coding agents remain visible as containers.

## 13. Key architecture decisions

| ID | Decision | Rationale |
| --- | --- | --- |
| D1 | retain one outer `ploinky-box` container | preserves distribution, volumes, ports, rootless Podman, and macOS support |
| D2 | keep a hybrid Podman plus bwrap runtime inside the Box | image-dependent services still need containers |
| D3 | repurpose `lite-sandbox: true` as the strict bwrap selector | avoids a new configuration hierarchy |
| D4 | never fall back from requested bwrap to Podman | the active security boundary must be truthful |
| D5 | keep coding AgentServers on demand with `startup: "manual"` | matches existing browser and CLI product behavior |
| D6 | trust the outer AgentServer and give it `/workspace` RW | required to create arbitrary narrower RW child mounts with nested bwrap |
| D7 | run every actual provider CLI/task in nested bwrap | one effective provider boundary for browser and interactive use |
| D8 | expose workspace RO and only selected WORKDIR RW to providers | protects workspace integrity outside the requested project |
| D9 | give each agent/alias one persistent private HOME RW | provider login, configuration, sessions, and continuation state |
| D10 | hide Ploinky control data and other agent homes | RO would still leak credentials and private state |
| D11 | reuse Node/npm from the Box through a RO mount | no duplicated Node installation per sandbox |
| D12 | bring Codex under the same bwrap policy as OpenCode and PI | provider-native sandboxing is not the Ploinky boundary |
| D13 | keep network policy outside manifests | network is a platform invariant and still requires a rollout decision |
| D14 | migrate only coding agents in the first rollout | limits blast radius and preserves specialized container workloads |

## 14. Implementation impact and sequencing

All affected repositories use the `ploinky-proxy` branch. Existing relevant uncommitted work must be reviewed, committed coherently, and pushed without overwriting unrelated work.

| Phase | Primary repositories | Change | Gate |
| --- | --- | --- | --- |
| 0. Inventory | all manifests and managed checkouts | classify every `lite-sandbox` use and align source versus managed manifests | no specialized-image agent will be selected for bwrap |
| 1. Box capability | `container-image-builds`, `ploinky` | install bwrap/tooling and add exact native nested probes | amd64, arm64, Podman Machine |
| 2. Runtime selection | `ploinky` | make `lite-sandbox` strict in Box; remove forced-Podman and fallback paths | unit tests prove fail-closed behavior |
| 3. Outer service | `ploinky` | adapt bwrap mount policy, HOME mapping, lifecycle, readiness, status, logs | dummy AgentServer starts and recovers without a container |
| 4. Router identity | `ploinky`, Agent runtime, possibly `proxies` | generation-scoped bwrap identity and route/relay support | authenticated MCP round-trip without master secret exposure |
| 5. Shared task policy | `AchillesCLI`, possibly promoted into `ploinky` shared code | canonical path validation, workspace RO plus WORKDIR RW, protected masks, HOME, env | adversarial mount/path tests |
| 6. Provider migration | `AchillesCLI` | OpenCode/PI alignment, Codex nested wrapper, immutable runtime handling | execute, continue, login, cancellation for all three |
| 7. Interactive CLI | `ploinky`, `AchillesCLI` | workdir selection, PTY, manifest CLI wrapper, cleanup | all three CLIs from arbitrary subfolders |
| 8. Copilot E2E | `AchillesCLI`, `AssistOSExplorer/explorer`, Ploinky tests | preserve deterministic browser delegation | browser prompts create expected files in selected projects |
| 9. Hardening | runtime and Box image | concurrent HOME behavior, private networking if adopted, rollback telemetry | security and recovery test matrix passes |

OpenCode and PI task-sandbox code can be retained for the first nested rollout. A later refactor may centralize their duplicated policy builder, but centralization is not a prerequisite for proving the architecture. The first goal is policy equivalence and removal of coding-agent Podman containers.

## 15. Acceptance tests

| Category | Required proof |
| --- | --- |
| runtime selection | `lite-sandbox: true` produces bwrap and never silently falls back |
| container absence | no Podman container exists for OpenCode, Codex, or PI AgentServers |
| coexistence | Explorer and specialized service containers still work |
| Box capability | nested user, mount, PID, IPC, and UTS namespaces work under the production Box contract |
| workdir | an arbitrary valid subfolder can be selected and is RW |
| workspace integrity | sibling user folders are readable but reject writes |
| protected data | Ploinky secrets, registry/control state, and other HOME directories cannot be read |
| root selection | `/workspace` behavior follows the explicit product decision |
| HOME | writable, persistent across sessions, isolated per agent/alias |
| runtime integrity | a provider cannot persistently replace its managed executable if immutable overlays are adopted |
| Node | `node` and npm work only through the Box-provided RO runtime |
| environment | master keys and unrelated credentials are absent from provider env/argv/mounts/logs |
| Router/MCP | browser task reaches bwrap AgentServer with generation-scoped identity |
| browser | explicit OpenCode, Codex, and PI prompts launch the intended agent asynchronously |
| CLI | all three interactive CLIs have TTY and the same effective provider mount policy |
| proc isolation | inner provider cannot inspect outer AgentServer env, root, cwd, or file descriptors |
| lifecycle | exit, cancel, timeout, crash, disable, Box stop, and restart clean exact owned processes |
| concurrency | parallel tasks do not corrupt shared provider HOME state |
| observability | registry, status, and logs identify bwrap service and task ownership accurately |
| engine isolation | no provider can access nested Podman storage or an engine socket |

## 16. Risks and open decisions

| Status | Item |
| --- | --- |
| Open | whether selecting `/workspace` as WORKDIR is allowed, warned, or rejected by default |
| Open | exact public CLI syntax for selecting a Box subfolder without passing Ploinky flags to the provider |
| Open | whether sibling user projects being readable is acceptable when the provider has network access |
| Open | shared Box network for the first rollout versus private egress from the start |
| Open | exact credential transport for bwrap AgentServer Router/MCP identity |
| Open | whether `/home/agent` can replace `/root` immediately for all providers |
| Open | concurrency semantics when multiple tasks share one persistent HOME |
| Native test required | nested bwrap and private `/proc` in the exact Box image on all target architectures |
| Native test required | actual minimum toolchain for supported OpenCode, Codex, and PI versions |
| Rollout risk | managed `.ploinky/repos` checkouts may differ from primary repository manifests |
| Security risk | workspace RO protects integrity but not confidentiality or exfiltration |
| Security risk | HOME RW permits persistence unless provider binaries are immutable |

## 17. Primary code references

| Topic | Files |
| --- | --- |
| forced Podman and runtime selection | `ploinky/cli/utils/runtime/sandboxRuntime.js`, `ploinky/cli/sandbox/docker/common.js` |
| bwrap service, mounts, env, and interactive attach | `ploinky/cli/sandbox/bwrap/bwrapServiceManager.js` |
| bwrap ownership and health | `ploinky/cli/sandbox/bwrap/bwrapFleet.js`, `bwrapHealthProbes.js` |
| agent CLI lifecycle | `ploinky/cli/commands/workspaceUtil.js`, `ploinky/cli/commands/cli.js` |
| outer Box CLI and fixed workdir | `ploinky/ploinky-box/bin/ploinky-box.mjs`, `ploinky/ploinky-box/command/execute.mjs` |
| Box mounts and lifecycle | `ploinky/ploinky-box/volumes.mjs`, `lifecycle/container.mjs`, `contract/container.mjs` |
| Box image | `container-image-builds/images/ploinky-box/Dockerfile` and publish workflow |
| Explorer graph | `AssistOSExplorer/explorer/manifest.json` and dependency manifests |
| Copilot selection and launch | `AchillesCLI/achilles-cli/src/lib/copilotCodingAgentRouting.mjs`, launch skills |
| coding agents | `AchillesCLI/opencodeAgent`, `codexAgent`, `piAgent` |
| existing nested task bwrap | `AchillesCLI/opencodeAgent/scripts/task-sandbox.mjs`, `AchillesCLI/piAgent/scripts/task-sandbox.mjs` |
| OpenCode provider mounts | `AchillesCLI/opencodeAgent/scripts/opencode-runner.mjs` |
| PI provider mounts | `AchillesCLI/piAgent/scripts/execute-task.mjs` |
| Codex provider launch | `AchillesCLI/codexAgent/scripts/codex-runner.mjs` |
| runtime relay and identity | `ploinky/cli/server/runtimeRelay`, agent identity and Router authority modules |

## 18. Conclusion

The clean migration is not a general replacement of every nested container. It is a strict bwrap path for coding agents inside the existing Box, selected by the already present `lite-sandbox: true` flag.

The long-lived coding AgentServer is trusted and receives the complete workspace RW so it can launch work in any requested directory. Every actual OpenCode, Codex, or PI process runs in nested bwrap with a narrower and consistent contract: workspace RO, exact launch directory RW, private persistent HOME RW, immutable runtime RO, and Ploinky control data hidden.

This preserves both user-facing entry points:

```text
Browser prompt -> Copilot -> coding AgentServer -> nested provider task
ploinky cli <coding-agent> -> interactive launcher -> nested provider CLI
```

It also keeps the manifest small, gives `startup` one clear lifecycle role, reuses the Box-provided Node runtime, removes coding-agent Podman containers, and leaves specialized application services on the container runtime they require.
