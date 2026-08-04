# Bubblewrap Coding-Agent Migration: Implementation Plan

Status: implementation-ready planning document; no migration code is included.

Authority: `BWRAP_CODING_AGENTS_ARCHITECTURE.md` is the target architecture. Where this plan records an open decision, the architecture and an architect's explicit decision take precedence.

Evidence labels used below:

| Label | Meaning |
| --- | --- |
| **Observed** | Verified in the current primary source checkouts or their tests. |
| **Target** | Required by the authoritative architecture. |
| **Inferred** | Consequence of observed code and the target, but not yet proven in a native Box. |
| **Open** | Product or security decision that source code does not settle. |

## 1. Executive summary

The migration is a hybrid runtime change, not a removal of nested containers. `ploinky-box` remains the single outer Podman container. Image-dependent application agents continue as nested Podman containers. Only the OpenCode, Codex, and PI coding AgentServers move to Ploinky-managed Bubblewrap services, selected strictly by their existing `"lite-sandbox": true` manifests.

The trusted coding AgentServer receives the complete `/workspace` read-write and its exact persistent HOME. It never receives the Box master key or nested Podman storage. Every provider process—including browser tasks, continuation, model/login helpers that execute provider code, and interactive CLI—runs in a second, narrower bwrap namespace. That provider namespace sees a sanitized workspace read-only, one canonical selected WORKDIR read-write, the exact provider HOME read-write, immutable runtime and executable mounts, private `/proc`, minimal `/dev`, private `/tmp`, and a `--clearenv` environment. Ploinky control state, all other homes, engine storage, and engine sockets are absent.

The critical implementation order is: remove misleading `lite-sandbox` flags; prove bwrap in the production Box; make runtime selection strict; build the trusted service mount/HOME/identity path; add a bwrap-aware Router/relay path; converge all provider invocations on one policy; then enable browser and interactive flows and run native security/E2E gates. Runtime selection must not land before the manifest cleanup and Box capability gate.

The highest-risk work is not the bwrap argument list. It is generation-bound AgentServer credentials, the currently container-only RuntimeRelay, consistent nested policy across every provider subprocess, workdir TOCTOU defense, and exact process-tree cleanup. Section 24 identifies the decisions that must be confirmed before those phases can be released.

## 2. Scope and affected repositories

### 2.1 Definite implementation repositories

| Repository | Required branch | Planned responsibility |
| --- | --- | --- |
| `file-parser` | `ploinky-proxy` | Architecture record and this plan only; no migration implementation belongs in the aggregate root. |
| `ploinky` | `ploinky-proxy` | Strict runtime selection, trusted AgentServer bwrap policy, provider policy library, identity/relay, workdir/PTY propagation, lifecycle, status, logs, Box contract tests. |
| `container-image-builds` | `ploinky-proxy` | Install pinned Bubblewrap and required tools in `ploinky-box`; native amd64/arm64 capability and behavior gates. |
| `AchillesCLI` | `ploinky-proxy` | Three coding manifests and all OpenCode/PI/Codex provider adapters; remove GPTResearcher's selector; browser launcher contract tests. |
| `AssistOSExplorer` | `ploinky-proxy` | Remove seven non-target selectors and verify the Explorer dependency graph stays container-backed. |
| `copilot-agents` | `ploinky-proxy` | Remove four non-target selectors and update manifest assertions; provider/browser topology remains container-backed. |
| `UmamiAgent` | `ploinky-proxy` | Remove the specialized Umami agent's selector and retain its Podman stack. |

### 2.2 Inspected dependencies with no baseline source change

| Repository or runtime copy | Finding | Treatment |
| --- | --- | --- |
| `ploinky/node_modules/achillesAgentLib` | **Observed:** coding delegation uses Ploinky's `/Agent/client/AgentMcpClient.mjs`; bwrap lifecycle, Router identity, and provider wrappers are not owned here. | No planned source change. Re-test as an immutable mounted dependency. Change only if generated-local transport fails the new credential descriptor contract. |
| `proxies` | **Observed:** Soul already accepts signed agent provenance; OpenCode/PI implement task-scoped loopback brokers. No primary manifest uses `lite-sandbox`. | No baseline source change. Validate the existing contract through Ploinky/Achilles integration tests. A proxy change requires a separately justified credential API delta. |
| `basic` | Its bwrap-runner capability/policy and native test are useful precedents; no primary selector needs migration. | Reference implementation only unless the shared probe is deliberately extracted. |
| `webmeetInfra` | Its image/network services remain Podman dependencies in the Explorer graph. | Acceptance coverage only. |
| `.ploinky/repos/*` | **Observed:** runtime-managed checkouts differ in branch, commit, and manifest content from primary checkouts. | Never edit or commit these as source. Refresh them from the merged `ploinky-proxy` source branches during rollout and assert resulting commit identities. |

### 2.3 Explicitly out of scope

| Excluded work | Reason |
| --- | --- |
| Replacing Podman for all agents | Contradicts the hybrid target and specialized-image requirements. |
| Adding `runtime.isolation`, isolation classes, or per-agent mount/network policy properties | Rejected by the architecture. `lite-sandbox` is the runtime selector; platform code owns the policy. |
| Redesigning `startup: "manual"` | Current lifecycle semantics already meet the target. |
| Editing generated `.ploinky` runtime state as source | Runtime state is refreshed/reconciled, not versioned implementation. |
| Making the outer Box privileged or mounting an engine socket | Violates the Box and provider trust boundaries. |

## 3. Verified current architecture

### 3.1 Runtime selection

| Evidence | Verified behavior |
| --- | --- |
| `ploinky/cli/utils/runtime/sandboxRuntime.js` | **Observed:** `/etc/ploinky-box` forces host sandbox disabled, rejects enabling it with `PLOINKY_BOX_SANDBOX_FORCED`, and reports Podman as effective. |
| `ploinky/cli/sandbox/docker/common.js:getRuntimeForAgent` | **Observed:** the Box branch returns Podman before inspecting `lite-sandbox`; outside Box, a disabled sandbox redirects `lite-sandbox` to a container, while enabled Linux/macOS selects bwrap/seatbelt. Missing bwrap fails, and a bwrap startup error has no implicit fallback. |
| `ploinky/tests/unit/sandboxRuntime.test.mjs` | **Observed:** tests currently encode forced Podman in Box and host-disable fallback outside it. |
| `container-image-builds/images/ploinky-box/Dockerfile:74` | **Observed:** the Box image additionally bakes `PLOINKY_DISABLE_HOST_SANDBOX=1` into `ENV`. `isHostSandboxDisabled()` (`sandboxRuntime.js:45-51`) checks that variable *before* the workspace config, so Podman is forced in the Box by **three** independent mechanisms — the `getRuntimeForAgent` marker short-circuit, this image env var, and the marker-driven `isForcedBoxSandboxPolicy()`. Phase 3 is not effective unless all three change together, and `container-image-builds/tests/image-definitions.test.mjs:448,472` pins both the marker line and this env var. |
| `ploinky/ploinky-box/lib/boxMarker.mjs:27-41` vs `sandboxRuntime.js:74-80` | **Observed:** two different Box detectors sit on the same decision path. `isInsideBox` (used by `getRuntimeForAgent`) rejects symlinks, requires `nlink === 1`, validates exact marker bytes, and **throws** on a malformed marker; `isForcedBoxSandboxPolicy` follows symlinks, ignores content, and swallows errors. They disagree on a corrupt/symlinked marker. Reconcile them in phase 3 rather than adding a third detector. |

### 3.2 Generic Ploinky bwrap service

| Area | Verified behavior |
| --- | --- |
| Mounts | `bwrapServiceManager.js` mounts system/Node/Agent/dependencies read-only, `/shared` read-write, the selected project/workspace broadly, and the exact agent home at `/root`. Its selected `.ploinky` overlays do not hide the full control plane or `.data` hierarchy. |
| Node | The real prefix containing `process.execPath` is mounted read-only at `/opt/ploinky-node`; the bwrap PATH prefers its `bin`. |
| Environment | `buildFullEnvMap` builds an explicit service environment but uses `HOME=/root`; it strips generated Router credentials and supplies only principal/generation identity. |
| Launch/readiness | `startBwrapProcess` writes `.ploinky/logs/<agent>-bwrap.log`, spawns a detached bwrap, checks only immediate survival, records ownership, and then higher layers perform manifest TCP/MCP/script readiness. |
| Ownership | `bwrapFleet.js` stores schema-v2 PID plus process-start identity under `.ploinky/bwrap-pids` and uses generation-bound TERM-to-KILL cleanup with PID-reuse protection. |
| Interactive | `attachBwrapInteractive` creates a new bwrap process with `--die-with-parent`. It ignores its `workdir` argument, uses the registered project path, and wraps with `script -qfec` only for a real TTY. |
| Status defect (**confirmed**) | **Observed:** the key mismatch is real, not a candidate. `startBwrapProcess` writes the PID record under the container key — `saveBwrapPid(containerName, child.pid, runtimeIdentity)` (`bwrapServiceManager.js:824`), where `containerName = options.containerName \|\| getAgentContainerName(agentName, repoName)` (`:653`) — and `ensureBwrapService`/`stopBwrapProcess` use that same key (`:914`, `:984`, `:1006`). But `agentRuntimeState.js:51-52` looks the record up with the bare agent name: `sandboxRunning(record.agentName)` / `sandboxPid(record.agentName)`. A running bwrap service is therefore reported stopped with PID 0 in status. Fix in phase 4 and add a regression test to `agentRuntimeState.test.mjs`; this is a prerequisite for the §25 observability gate, because a "no coding container" proof is worthless if the bwrap service is invisible to status. |

### 3.3 CLI and manual lifecycle

| Path | Verified behavior |
| --- | --- |
| `workspaceUtil.js:runCliWithDependencies` | Explicit CLI starts an absent manual agent, waits for service readiness, and attaches, so manual startup is not a blocker. |
| `ploinky-box/command/execute.mjs` | Outer `container exec` always starts in `/workspace`; it supplies `-it` only when requested and both ends are TTYs. Host subfolder context is lost. |
| `manifestStartup.js` and graph tests | Manual additional agents remain stopped unless already active, while explicit dependencies and explicit Copilot/CLI starts are still admitted. |

### 3.4 Browser/Copilot and task lifecycle

| Path | Verified behavior |
| --- | --- |
| `achilles-cli/src/lib/copilotCodingAgentRouting.mjs` and `src/index.mjs` | A task-intent verb plus a named Codex/OpenCode/PI target selects the fixed launch skill before generic prompt execution. |
| `src/skills/launch-{opencode,codex,pi}/src/index.mjs` | Each launcher ensures the manual agent globally, passes `mainAgent.startDir`/`process.cwd()` as `projectDir`, invokes async `execute-task`, and returns without waiting. |
| `webchatBackgroundTasks.mjs` | Polls detached state, maps terminal status, starts the agent for continuation, and forwards cancellation. |
| Ploinky `AgentServer.mjs`/`TaskQueue.mjs` | MCP task wrappers run in detached process groups; cancellation uses SIGTERM then SIGKILL and persists task state/continuation metadata. |

### 3.5 Provider differences

| Provider | Verified task boundary | Verified gaps |
| --- | --- | --- |
| OpenCode | `task-sandbox.mjs` validates containment/symlinks, probes nested bwrap, clears env, unshares user/PID/IPC/UTS, shares network, mounts selected project RW, uses scoped Soul broker, and runs task/session recovery inside bwrap. | It does not expose siblings RO; it can create missing project dirs; `/workspace` becomes wholly RW; login/control/model-list and direct manifest CLI invoke provider code outside the narrow policy. |
| PI | Its `task-sandbox.mjs` is currently byte-identical to OpenCode; task/continue uses it and a scoped Soul broker. | Same workspace/root/HOME gaps; login and imported model runtime execute provider code in the trusted service; direct manifest CLI bypasses the provider boundary. |
| Codex | `codex-runner.mjs` enables Codex's own `workspace-write`/never-approve policy. | It directly spawns with inherited service env and `/root`, validates only `path.resolve`, uses reusable Router credentials, and has no nested bwrap, readiness probe, or scoped broker. Model app-server, login, and direct CLI are also unsandboxed at the provider layer. |

### 3.6 Box, HOME, relay, and managed checkout state

| Area | Verified behavior |
| --- | --- |
| Box image | `container-image-builds/images/ploinky-box/Dockerfile` copies Node 24/npm into `/usr/local` but does not explicitly install Bubblewrap. The publish workflow builds native amd64/arm64 digests but currently asserts no behavioral gate. |
| HOME | `workspaceStructure.js` already creates `<workspace>/.data/<sanitized-instance>` per instance/alias; generic bwrap maps it to `/root`. The broad workspace mount also reveals `.data` unless hidden. |
| RuntimeRelay | `runtimeRelay/confinement.js`, `RuntimeRelayManager.js`, `edgeRoutePlan.js`, and `agentReadiness.js` require Docker/Podman, a 64-hex container ID, inspect labels, and `runtime exec`. They cannot route a bwrap owner unchanged. |
| Identity | `agentIdentityEnv.js` separates principal from post-attestation credentials. AgentServer inbound/outbound assertions require its exact agent secret; current bwrap deliberately omits that secret. |
| Managed drift | Managed AchillesCLI is `master` at `dd82c35...`, not primary `ploinky-proxy`; all five inspected manifests differ and managed `achilles-cli` incorrectly adds `lite-sandbox`. `AchillesIDE`, `basic`, and `copilot-agents` managed shadows also differ from primaries. |

## 4. Current-to-target gap matrix

| Concern | Current | Target | Required owner/gate |
| --- | --- | --- | --- |
| Box selector | Marker forces Podman before manifest evaluation. | In Box, true means mandatory bwrap; false/missing means Podman. | `ploinky`; runtime unit gate. |
| Fallback | Disabled host sandbox can turn true into a container. | No true-to-container fallback in Box; actionable fail-closed error. | `ploinky`; missing/unusable binary tests. |
| Selector inventory | Sixteen production manifests use true; only three are target coding agents. | Keep true only on OpenCode/Codex/PI. | Four manifest repos must merge before selector deployment. |
| Box capability | Bubblewrap absent from explicit image ABI. | Pinned bwrap and native namespace/proc/signal proof. | `container-image-builds` before runtime enablement. |
| Outer service | Broad generic mounts, `/root`, principal-only identity. | Trusted coding profile: workspace RW, exact `/home/agent`, immutable runtime, exact generation identity. | `ploinky`; authenticated MCP readiness gate. |
| Relay | Container inspect + exec only. | Attested bwrap owner and bwrap-capable route. | `ploinky`; relay/lease/failure tests. |
| Provider workspace | OpenCode/PI see only project; Codex relies on native policy. | Workspace RO, exact WORKDIR RW, protected paths hidden for all. | Shared Ploinky policy + Achilles adapters. |
| Provider HOME | `/root`; writable state and executable trees intermixed. | Exact per-alias `/home/agent`; executable/package roots re-bound RO. | Ploinky/Achilles; persistence/poisoning tests. |
| Environment | OpenCode/PI task paths clear env; other paths and Codex inherit broader env. | Every actual provider path uses `--clearenv` and a role-specific allowlist. | Achilles enumeration test. |
| Interactive | Direct `manifest.cli` runs under broad outer attach; workdir ignored. | Provider wrapper applies the same inner policy and exact workdir. | Ploinky CLI + three manifests/adapters. |
| Browser | Workdir forwarded, provider enforcement inconsistent. | Same validation/policy as interactive; manual agent starts explicitly. | Achilles launch/E2E tests. |
| Proc/network | Provider task shares network; current private-proc probe has guarded inherited fallback. | Production Box must prove private proc; first-rollout network decision explicit. | Image/native security gate. |
| Status/logs | Registry can record bwrap but runtime key may be queried incorrectly; tasks are not distinguished fully. | Real service/task runtime, PID/generation/workdir, separate sanitized logs. | `ploinky`; observability acceptance. |
| Lifecycle | Service ownership is strong; outer stop relies on local stop; provider descendants need proof. | Exact service and task trees die on cancel/crash/disable/restart/Box stop. | Ploinky/Achilles native failure injection. |

## 5. Final target architecture

```text
host
└── Podman: ploinky-box (rootless, non-privileged; only outer container)
    ├── trusted Ploinky Router/control plane
    ├── Podman: specialized non-coding services
    ├── bwrap: trusted OpenCode AgentServer
    │   └── bwrap: untrusted OpenCode provider task/login/models/TUI
    ├── bwrap: trusted Codex AgentServer
    │   └── bwrap: untrusted Codex provider task/login/models/TUI
    └── bwrap: trusted PI AgentServer
        └── bwrap: untrusted PI provider task/login/models/TUI
```

| Invariant | Final contract |
| --- | --- |
| Outer engine | Podman creates only `ploinky-box`; no engine socket is mounted. |
| Container services | Missing/false `lite-sandbox` remains nested Podman and retains image semantics. |
| Coding service | True selects bwrap or fails; service is trusted but generation-bound. |
| Provider | All executable provider entrypoints use the canonical nested bwrap adapter. Provider-native security remains defense in depth. |
| Filesystem | Service workspace RW; provider sanitized workspace RO plus one WORKDIR RW and one private HOME RW. |
| Identity | Service gets only exact instance/generation capability; provider gets only short-lived task-scoped broker capability. |
| Runtime | Box Node/npm and staged Agent/code/dependencies are immutable in provider namespaces. |
| Lifecycle | Registry and PID records identify actual runtime and exact process tree. |

## 6. Trust boundaries and threat model

| Actor/resource | Trust | Capability | Explicit non-capability |
| --- | --- | --- | --- |
| Box Router/control plane | Trusted | Runtime admission, identity minting, registry, routing, cleanup. | Must not delegate master authority to agents. |
| Coding AgentServer | Trusted platform adapter | Full workspace RW, own HOME RW, install/update provider, launch nested bwrap, own task brokers. | No Box master key, other HOME bind, engine socket/storage, or unrelated credentials. |
| Provider and descendants | Untrusted | Read user workspace, write exact project and own state, invoke scoped model broker, outbound network per rollout decision. | No control plane, other homes, engine, service credential, sibling writes, executable persistence. |
| Project content | Adversarial input | Can instruct provider and influence files inside selected project. | Must not alter policy builder, bwrap binary, provider executable, or future task bootstrap. |
| Network peer | Untrusted unless authenticated | Only authenticated Router/Soul endpoints should act on requests. | Loopback location alone is not authentication. |

Threats covered by release tests are symlink/traversal/TOCTOU escape, workspace sibling modification, control-plane disclosure, cross-agent HOME disclosure, provider executable poisoning, environment/argv/fd/log secret leakage, `/proc` inspection of the trusted server, stale PID/generation takeover, relay confused deputy, cancellation escape, and engine access. Workspace confidentiality is not provided by the initial RO-workspace policy: an online provider can read and potentially exfiltrate sibling project content. That residual risk needs explicit acceptance in section 24.

## 7. Exact filesystem mount tables

### 7.1 Outer `ploinky-box`

This table is unchanged except that the image gains bwrap. No fifth host mount is needed.

| Engine/host source | Box target | Mode | Provider reachability |
| --- | --- | --- | --- |
| Ploinky source checkout | `/opt/ploinky` | Bind RO | Not mounted wholesale into provider. |
| Named workspace volume | `/workspace` | RW with ownership mapping | Reconstructed RO/sanitized for provider. |
| Named container-storage volume | `/home/podman/.local/share/containers` | RW with ownership mapping | Absent from coding service/provider. |
| Named dependencies volume | `/opt/ploinky/node_modules` | RW with ownership mapping | Only exact staged dependencies mounted RO. |
| `/dev/fuse`, `/dev/net/tun` | Same | Device access for Box/nested containers | Absent from provider minimal `/dev`. |

The outer contract remains rootless user `podman`, `init=true`, non-privileged, no engine socket, Router TCP on host loopback, and required LiveKit UDP publication.

### 7.2 Trusted coding AgentServer bwrap

| Box source | Sandbox target | Mode | Construction rule |
| --- | --- | --- | --- |
| `/usr`, `/bin`, `/lib*`, required `/etc` files | Same | RO | Minimal required system set; do not bind `/home/podman`. |
| Real Box Node prefix | `/opt/ploinky-node` | RO | Pinned realpath containing `process.execPath`; PATH first. |
| Staged Ploinky Agent runtime | `/Agent` | RO | Exact generation content. |
| Coding agent source | `/code` | RO | Normal profile only; any development RW profile is non-production. |
| Prepared `/code/node_modules` | `/code/node_modules` | RO | Exact dependency source. |
| Prepared `/Agent/node_modules` | `/Agent/node_modules` | RO | Exact Agent runtime dependency source. |
| `/workspace` | `/workspace` | RW | Required so trusted adapter can validate and re-bind arbitrary project subtrees. |
| `<workspace>/.data/<runtime-key>` | `/home/agent` | RW | Exact instance/alias only; create mode 0700 and verify owner. |
| Exact generation credential capability | Decision-specific path under `/run/ploinky-agent` | RO file or connected socket | Parent credential directory absent; never bind workspace master material. |
| New tmpfs | `/tmp`, `/run` except exact capability | RW ephemeral | No persistent control state. |
| New proc/dev | `/proc`, `/dev` | Private/minimal | Private PID namespace; no fuse/tun. |

Do not mount `.ploinky/shared` into coding AgentServers unless a verified current dependency requires it. The architecture says providers do not receive it; avoiding it at the service layer reduces accidental delegation.

### 7.3 Nested provider CLI/task bwrap

Mount order is mandatory because later mounts intentionally narrow or overlay earlier ones.

| Order | Source | Provider target | Mode/result |
| --- | --- | --- | --- |
| 1 | Minimal system tree and exact CA/DNS files | Same | RO |
| 2 | `/opt/ploinky-node` | `/opt/ploinky-node` | RO |
| 3 | Exact provider adapter/runtime files | Exact command paths | RO |
| 4 | `/workspace` | `/workspace` | Recursive RO |
| 5 | Empty tmpfs/masks | `/workspace/.ploinky`, `/workspace/.data` | Hidden; no source content visible |
| 6 | If allowed, exact selected repo below `.ploinky/repos` | Recreated parent path and exact WORKDIR | RW; no sibling `.ploinky` content |
| 7 | Otherwise exact canonical existing WORKDIR | Same absolute path | RW overlay; descendants writable |
| 8 | Exact `<workspace>/.data/<runtime-key>` | `/home/agent` | RW |
| 9 | Exact provider binaries/package trees inside HOME | Same logical paths | RO overlay after HOME bind |
| 10 | New tmpfs | `/tmp`, `/tmp/cache`, `/run` | Private RW ephemeral |
| 11 | New proc/minimal dev | `/proc`, `/dev` | Private process view and minimal devices |

Absent paths include `/home/podman`, `/opt/ploinky`, `.ploinky/shared`, engine sockets, fuse/tun, all other agent homes, and all Ploinky credential/registry/run/log/PID data. The selected WORKDIR may not be `.data`, `.ploinky` generally, or a protected ancestor. The sole exceptional protected subtree is an exact selected repository below `.ploinky/repos`, reconstructed without exposing its parents' content.

## 8. HOME ownership, persistence, concurrency, and executable-integrity policy

| Property | Required policy |
| --- | --- |
| Identity | One physical `<workspace>/.data/<sanitized effective runtime key>` per agent instance/alias; no name-only sharing across aliases. |
| Logical path | Mount the same backing directory at `/home/agent`; set HOME and XDG paths consistently. |
| Creation | Trusted Ploinky code creates with 0700, validates canonical containment/owner/type, rejects symlinked home roots, and records effective key/generation. |
| Persistence | Preserve across service/task restart, disable/re-enable, Box restart, and image upgrade unless the user explicitly removes data. |
| Migration | Reuse the existing physical `.data/<key>` rather than copying. Add a version marker and migrate only known absolute `/root` references atomically; keep rollback compatibility by allowing the old release to mount the same backing at `/root`. |
| Concurrency recommendation | First rollout takes one exclusive per-HOME lease across provider tasks, login, update, model helpers that write state, and interactive CLI. Queue or fail with a clear busy owner; never race. Relax only after provider-specific tests prove safe shared modes. |
| Executable integrity | Trusted service installs/updates. Provider namespace binds HOME RW, then re-binds OpenCode binary/package roots, Codex binary/npm package roots, and PI binary/package roots RO. Resolve without symlinks, pin inode/device/mtime/size or digest for launch, and reject a change between validation and exec. |
| State separation | Keep auth/config/session/database paths RW. Do not make all of `.local` RO if it also contains required state; bind exact executable/package subtrees instead. |

Expected fail-closed behavior: invalid ownership, symlinked HOME, missing immutable runtime, executable identity drift, or unavailable HOME lease prevents the provider from starting and produces a sanitized error. The trusted service may run an explicit installer/update operation only while holding the same exclusive lease.

## 9. Node.js, npm, provider installation, and toolchain model

| Layer | Model |
| --- | --- |
| Box | Node 24/npm/npx remain copied to `/usr/local` by the image. The production image additionally installs pinned bwrap, CA certificates, Git, SSH client, curl, shell/core utilities, `script`, and namespace/process tools proven by tests. Python/compiler additions require a failing representative provider task; they are not assumed. |
| Coding service | Ploinky resolves the real Node prefix and mounts it RO at `/opt/ploinky-node`. `node`, npm's CLI JS, and npx execute from that prefix; `/usr/local` is not assumed inside the namespace. |
| Installation | `install-opencode.sh`, `install-codex.sh`, and `install-pi.sh` run only in the trusted service under the exclusive HOME lease, use Box Node/npm or vendor installer as currently required, and write exact provider roots in `/home/agent`. They must not apt-install bwrap. |
| Provider task | PATH may name `/home/agent` executable directories, but those directories are RO overlays. Node/npm is `/opt/ploinky-node/bin` and package content is RO. Self-update attempts fail clearly and direct the user to the trusted install/update flow. |
| Verification | Readiness uses a dedicated safe probe directory below `/workspace`, never implicit writable `/workspace`; it verifies bwrap capability, Node/npm versions, provider executable identity, and a harmless provider `--version`/help operation. |

The related AchillesCLI commit `1fe668f` adds a guarded inherited-`/proc` fallback and provider version probes. It is preparatory, not the final Box contract: production Box acceptance must pass private `/proc`; inherited `/proc` remains a non-production fallback only if retained.

## 10. Environment allowlist and secret handling

### 10.1 Trusted service environment

| Admit | Source/control |
| --- | --- |
| `HOME=/home/agent`, XDG paths, `PATH`, locale, terminal, `TMPDIR` | Platform constants. |
| `PLOINKY_WORKSPACE_ROOT=/workspace`, exact runtime/instance/generation principal | Ploinky registry/admission. |
| Exact AgentServer credential descriptor locator | Non-secret path/socket locator only. |
| Manifest-declared provider credentials needed to create task brokers/login | Existing trusted manifest/profile secret resolution, scoped to this agent. |

Reject manifest/profile attempts to set reserved identity, Router, master-key, runtime, HOME, PATH, or credential-descriptor names. The service never receives `PLOINKY_MASTER_KEY`, `PLOINKY_DERIVED_MASTER_KEY`, another agent's secret, or broad credential directories.

### 10.2 Provider environment

Every provider launch uses bwrap `--clearenv`, then sets only:

| Category | Values |
| --- | --- |
| Filesystem/runtime | `HOME=/home/agent`, fixed XDG paths, `PATH`, `TMPDIR=/tmp`, exact WORKDIR/PWD if needed. |
| UX | Bounded locale, `TERM`, `COLORTERM`, `NO_COLOR`/color values, terminal dimensions. |
| Task | Provider-specific non-secret model/session/task identifiers. |
| Model capability | Random short-lived loopback broker URL/token, audience/task/generation bound, minimum routes and TTL. |

Forbidden in provider env, argv, mounts, logs, and inherited file descriptors are the AgentServer credential, master/derived keys, reusable Router API keys, unrelated provider keys, another agent's state, and raw credential-store paths. Before spawn, close all non-stdio/non-explicit descriptors; pass task broker data through env only if short-lived and redact exact values from errors/logs. Tests must inspect `/proc/self/environ`, `/proc/self/cmdline`, `/proc/self/fd`, mountinfo, task/service logs, and descendant environments with canary secrets.

## 11. Router, MCP, relay, and scoped credential design

### 11.1 Current blocker

The bwrap service currently receives principal-only identity, but AgentServer request verification and outgoing MCP assertions require the exact instance secret/private generation capability. RuntimeRelay also requires a container ID and launches its helper with `podman|docker exec`. Therefore a coding service can start as bwrap today but cannot safely participate in the authenticated private Router path.

### 11.2 Recommended first-rollout design

This recommendation remains architect-confirmed work, not an already decided requirement.

| Component | Recommended design |
| --- | --- |
| Service credential | Ploinky creates one atomic mode-0600 generation descriptor containing only exact instance/generation credentials, binds that exact file RO into the trusted bwrap, and omits its parent directory. AgentServer loads it at bootstrap, validates owner/mode/instance/generation, closes the descriptor, and never forwards its locator or values to provider launchers. Delete/rotate the source on disable/generation change. |
| Attestation | Bind descriptor creation to the same admitted manifest bytes, effective instance ID, generation, and bwrap PID/start identity recorded by `bwrapFleet`. A stale record or mismatch aborts readiness and removes the candidate. |
| Router ownership | Extend edge planning with a distinct bwrap owner descriptor: runtime key, effective instance, generation, PID, process-start identity, loopback port, and generation digest. Never overload `containerId`. |
| Transport | Add a bwrap-specific direct/stdio route that verifies the owner record immediately before opening the exact loopback port. Do not call container inspect/exec. Preserve route lease, deny-set, TTL, concurrency, request hash, cancel, and stale-generation checks from RuntimeRelay. |
| Provider model access | Standardize Codex on the OpenCode/PI scoped-broker pattern. Provider receives a random per-task token and minimum model/chat routes; the broker authenticates upstream with service identity and terminates with the task. |

If the architect chooses a Unix socket credential broker instead, replace only the descriptor/bootstrap rows; mount and provider-denial invariants remain identical. Implementation must not solve the blocker by adding long-lived service secrets to a provider-visible ambient environment.

### 11.3 Concrete Ploinky modules

| File/module | Change |
| --- | --- |
| `cli/utils/security/agentIdentityEnv.js` | Define the non-secret descriptor locator and exact generated credential serialization validation; retain reserved-name enforcement. |
| New `cli/sandbox/bwrap/bwrapAgentCredential.js` | Atomic generation descriptor creation/rotation/removal, mode/owner checks, generation binding, cleanup receipt. |
| `Agent/server/AgentServer.mjs` plus new `Agent/lib/agentCredentialDescriptor.mjs` | Load and validate the exact descriptor before listening; keep secret use in trusted server code. |
| `cli/server/edgeRoutePlan.js` | Emit a typed bwrap owner/transport plan instead of container relay fields. |
| `cli/server/runtimeRelay/confinement.js` | Keep container verification intact and add a separate typed bwrap verifier; never weaken 64-hex checks for container kinds. |
| `cli/server/runtimeRelay/RuntimeRelayManager.js` | Dispatch container owners to existing exec channel and bwrap owners to the new direct/stdio channel while preserving lease/auth protocol. |
| `cli/server/utils/agentReadiness.js` | Exercise the same bwrap-aware route; fail closed instead of silently retaining a nonfunctional route. |
| `tests/unit/{relayRequestAuth,agentPortTransport,edgeRoutePlanInterface,agentReadiness}.test.mjs` | Exact owner/generation/start-time, stale PID, port substitution, descriptor leakage, cancel, and route readiness assertions. |

## 12. Network design for the first rollout and later hardening

| Stage | Policy | Trade-off/gate |
| --- | --- | --- |
| First rollout recommendation | Retain `--share-net` for coding service and provider. Allocate exact loopback service ports through the registry and require authentication on every Router/Soul/control listener. Provider outbound access remains available. | Smallest kernel/image delta, but providers can scan Box loopback and exfiltrate readable workspace data. Release requires explicit architect acceptance and a loopback service authentication scan. |
| Later hardening | Private provider network namespace with controlled egress proxy and explicit connection to task broker; optionally private service networking with Router-owned transport. | Stronger isolation, but DNS/TLS/streaming/provider compatibility and Podman Machine support require a separate design and native matrix. |

Network policy is a platform invariant, not a manifest property. No `network` or isolation object is added to coding manifests. Even in the shared-network rollout, tests must prove that unauthenticated access to Router, other AgentServers, Soul management routes, nested Podman APIs, and metadata endpoints fails.

## 13. Runtime-selection semantics for `lite-sandbox`

| Context | `lite-sandbox: true` | Missing/false |
| --- | --- | --- |
| Inside `ploinky-box` | Select Linux bwrap after capability/admission check; any missing binary, namespace/proc failure, or policy build failure is a named fatal error. Never try Podman. | Select Box Podman as today. |
| Linux outside Box with sandbox enabled | Select bwrap and fail closed if unavailable. | Container runtime. |
| macOS outside Box with sandbox enabled | Existing seatbelt behavior may remain for generic agents; this migration's native nested target is Linux Box. | Container runtime. |
| Host sandbox explicitly disabled outside Box | Preserve existing compatibility only for non-Box use, but emit a deprecation warning when true is redirected; plan a later strict global semantic. | Container runtime. |

In Box, the marker no longer means “disable all host sandboxing.” It means “hybrid appliance”: Podman is available for container manifests and bwrap is mandatory for true manifests. `ploinky sandbox status` must report Box hybrid capability, bwrap probe result/version, Podman availability, and per-agent selected runtime. `setHostSandboxDisabled(false)` should no longer be the path that enables coding bwrap; selection is manifest-driven. Any legacy `runtime` string remains rejected rather than becoming a back door.

## 14. Migration of existing non-coding `lite-sandbox` manifests

This cleanup must merge before strict selection is deployed.

| Repository | Files | Required migration and proof |
| --- | --- | --- |
| `AchillesCLI` | `GPTResearcher/manifest.json` | Remove true; retain `assistos/bwrap-runner:node24-python-bookworm` image/startup. Test that nested Podman and its image-specific Python/browser tooling still work. |
| `AssistOSExplorer` | `dpuAgent`, `explorer`, `gitAgent`, `multimedia`, `soplangAgent`, `tasksAgent`, `webAssist` `manifest.json` | Remove all seven. Preserve volumes, images, dependency/no-wait edges, and Explorer's managed-repositories behavior. Start the Explorer graph and assert these registry entries are containers. |
| `UmamiAgent` | `umamiAgent/manifest.json` | Remove true; prove PostgreSQL/Umami/MCP image startup, generated DB secrets, persistence, and routing. |
| `copilot-agents` | `browserUseAgent`, `copilotProviderRelay`, `research-agents`, `webSearchAgent` `manifest.json` | Remove all four; update unit assertions and prove browser/provider relay image topology. |
| `ploinky` test fixtures | `tests/testAgent/manifest.json`, dynamic fixtures in `tests/doPrepare.sh` and `workspace_dependency_startup_tests.sh` | Split explicit bwrap and container fixtures. Do not let one fixture accidentally change meaning. |

Keep true on exactly `AchillesCLI/opencodeAgent/manifest.json`, `codexAgent/manifest.json`, and `piAgent/manifest.json`. Keep `startup: "manual"` on all three.

Managed shadows are reconciled only after primary branches merge: run the normal Ploinky managed-repo refresh pinned to `ploinky-proxy`, verify exact origin/branch/HEAD, compare all relevant manifests, and reject rollout if managed `achilles-cli` still carries true or if any removed primary selector reappears.

## 15. Browser/Copilot execution flow

```text
browser prompt naming provider
→ fixed Achilles launcher
→ ensure exact manual AgentServer globally
→ authenticated MCP execute-task(projectDir, prompt)
→ AgentServer canonicalizes existing projectDir
→ exclusive HOME lease + scoped broker
→ nested provider bwrap
→ detached task status/cancel/continue
```

| Module | Required behavior |
| --- | --- |
| `achilles-cli/src/lib/copilotCodingAgentRouting.mjs` | Preserve fixed named selection and generic fallback ordering. |
| `src/skills/launch-{opencode,codex,pi}/src/index.mjs` | Preserve `mainAgent.startDir` forwarding and manual `ensureAgentRunning`; surface structured workdir/policy errors without command/env leakage. |
| `webchatBackgroundTasks.mjs` | Preserve detached polling/cancel/continue; distinguish policy rejection from provider failure and stale generation. |
| Provider `execute-task`/`continue-task` | Call the canonical nested policy with exact existing `projectDir`; never create it, widen to workspace root, or fall back to direct spawn. |
| Login/model controls | Any operation that executes provider code uses an inner policy mode with the same HOME/env/proc/executable constraints. A pure trusted parser/catalog operation may remain in-process only after a documented audit proves it cannot execute provider-controlled code or network with provider credentials. |

Acceptance covers all three providers, manual cold start, repeated warm start, continuation, cancellation, login, model listing, policy error rendering, and verification that `podman ps` gains no coding-agent container.

## 16. Interactive `ploinky cli <agent>` execution flow

The current direct manifest commands are replaced with provider-owned interactive launcher scripts, not raw provider binaries.

| Provider manifest | New command responsibility |
| --- | --- |
| OpenCode | `node /code/scripts/interactive-cli.mjs` validates Ploinky-supplied workdir, acquires HOME lease, creates scoped broker if needed, and executes OpenCode in nested bwrap. |
| Codex | Same wrapper shape; retains Codex native sandbox flags as defense in depth inside Ploinky bwrap. |
| PI | Same wrapper shape; uses the canonical policy and PI state mounts. |

`ploinky/cli/commands/workspaceUtil.js` must parse and consume Ploinky workdir metadata before appending provider args, then call a coding-provider attach path. `bwrapServiceManager.attachBwrapInteractive` must honor the validated workdir rather than the registry project. The outer service attach is only a trusted adapter launch; that adapter must create the inner provider sandbox before executing provider code.

PTY rules remain exact: request `podman exec -it` only with TTY stdin/stdout; preserve terminal size and signals; use `script -qfec` only when required and available; non-TTY mode uses inherited pipes and must not fabricate a PTY. Ctrl-C, terminal close, Box stop, and adapter crash must terminate the provider process group and release its HOME lease/broker.

## 17. Arbitrary WORKDIR selection and path-validation contract

### 17.1 Recommended public syntax

Pending confirmation, use:

```text
ploinky cli <agent> --workdir <workspace-relative-or-/workspace-absolute-path> -- <provider-args>
```

Ploinky consumes `--workdir` only before the separator; arguments after `--` are byte-for-byte provider arguments. Omission preserves an already valid in-Box cwd outside `/workspace` only after mapping it into the Box; because outer Box execution currently fixes cwd to `/workspace`, the Box CLI should otherwise require the option or apply an explicitly documented default. Do not infer a host path by string substitution.

### 17.2 Validation algorithm

| Step | Required check/failure |
| --- | --- |
| Parse | Reject empty/NUL, repeated selector, unknown selector form, explicit `..` segments, and provider-option ambiguity. |
| Root | Open canonical `/workspace` directory and verify expected device/type/ownership. |
| Resolve | Require the final directory already exists. Walk components without following symlinks; prefer `openat2(RESOLVE_BENEATH|RESOLVE_NO_MAGICLINKS)` when available, otherwise use fd-based `openat` plus `lstat`/realpath checks. |
| Containment | Canonical target must equal root or remain beneath root. Reject `.data`, protected `.ploinky`, and any masked ancestor; allow only the explicit `.ploinky/repos/<repo>/...` exception. |
| Root decision | Apply the architect's allow/warn/reject answer for exact `/workspace`; never let an omitted value silently become whole-workspace RW. |
| Pre-spawn | Revalidate identity immediately before constructing bwrap; retain directory fd where practical and compare device/inode. |
| Mount | Bind workspace RO, apply masks, then bind exact resolved directory RW and `--chdir` to it. |
| Lifetime | Do not change workdir for a running provider; a continuation validates its stored project identity again. |

All path failures are named policy errors and happen before HOME mutation, broker creation, or provider spawn. Tests include lexical traversal, absolute escape, symlink in every component, symlink swap between validation/spawn, renamed directory, mountpoint change, file target, missing target, protected path, Unicode/space paths, exact root, and valid managed-repo target.

## 18. Lifecycle, readiness, cancellation, recovery, status, and logging

| Event | Required behavior |
| --- | --- |
| Service start | Admit exact manifest/generation; verify bwrap capability; prepare mounts/HOME/credential; spawn; record PID/start identity; complete authenticated MCP readiness before publishing route. |
| Task start | Validate workdir; acquire HOME lease; mint scoped broker; spawn nested bwrap with `--die-with-parent`; record task PID/start identity, provider, workdir, service generation, log path, and broker owner. |
| Readiness | A dedicated safe directory tests private proc, Node/npm, immutable provider executable, and harmless provider readiness. Immediate survival alone is insufficient. |
| Cancel | TaskQueue cancellation reaches adapter; adapter TERM then KILLs exact provider process group, closes broker, releases lease, and records `cancelled`. No descendant remains. |
| Crash | Parent death plus `--die-with-parent` kills provider; startup recovery validates PID/start identity and cleans only matching orphans. Stale/reused PID is never signalled. |
| Disable/re-enable | Invalidate route/credential/generation, cancel all tasks, stop exact service, remove PID/credential records, preserve HOME, then start a new generation only on explicit use. |
| Restart | Drain/cancel old generation, rotate identity, verify no old route/task, then publish new authenticated readiness. |
| Box stop | `ploinky-local stop` stops bwrap tasks/services before containers; supervisor verifies no owned bwrap records/processes before outer Podman stop. Timeout reports exact survivors and still lets outer stop contain them. |
| Destroy | Removing the outer container terminates all namespaces; retained workspace/HOME volumes remain unless explicitly deleted. On next start, stale records are rejected by start identity/generation. |

Status must label `runtime=bwrap`, role (`service` or `provider-task`), effective instance/alias, generation, running/stopped/failed, PID identity, validated workdir, HOME key (not secret path content), readiness, and sanitized log path. Fix the runtime-key mismatch in `agentRuntimeState.js`. Logs separate service (`<runtime-key>-bwrap.log`) from task (`tasks/<task-id>-provider.log`), redact broker/identity canaries, never dump env/argv, and retain the existing task result/status contract. `ploinky logs` and Box status must not pretend bwrap tasks are containers.

## 19. Exact repository and file-level change map

### 19.1 `ploinky`

| Files/modules | Current responsibility | Add/remove/change | Tests |
| --- | --- | --- | --- |
| `cli/utils/runtime/sandboxRuntime.js`, `cli/sandbox/docker/common.js` | Box marker and backend selection. | Hybrid Box state; strict true→bwrap; false/missing→Podman; no Box fallback; actionable capability codes. | `sandboxRuntime.test.mjs`, `enableAgentStartup.test.mjs`. |
| `cli/sandbox/bwrap/bwrapServiceManager.js` | Generic mounts/env/start/interactive. | Add explicit trusted coding service profile selected internally by true; `/home/agent`; workspace RW; no Podman/shared/control mounts; credential capability; honor workdir; correct readiness/config record. | `bwrapArgs.test.mjs`, `agentEnvInjection.test.mjs`, `startupReadiness.test.mjs`. |
| `cli/sandbox/bwrap/bwrapFleet.js`, `bwrapHealthProbes.js`, `cli/sandbox/agentRuntimeState.js` | PID ownership, probes, backend-neutral status. | Track service/task ownership and start identity; private-proc capability; fix runtime-key lookup; exact descendant cleanup/status. | `sandboxProcessOwnership.test.mjs`, `agentRuntimeState.test.mjs`. |
| New `Agent/lib/providerSandbox.mjs` | No canonical cross-provider policy exists. | Capability pin/probe, fd-aware workdir validation, sanitized mount builder, env allowlist, executable RO overlays, HOME lease hooks, nested spawn contract. | New `providerSandbox.test.mjs`; Achilles integration consumes public API. |
| `cli/utils/workspaceStructure.js`, `cli/utils/config.js` | `.data` home and workspace paths. | `/home/agent` ABI/version marker, 0700/canonical ownership validation, known `/root` migration metadata. | New/updated workspace structure tests. |
| `cli/utils/security/agentIdentityEnv.js`, new `cli/sandbox/bwrap/bwrapAgentCredential.js`, `Agent/lib/agentCredentialDescriptor.mjs`, `Agent/server/AgentServer.mjs` | Two-phase identity and server auth. | Exact generation credential transport/validation/cleanup; no master key; no provider propagation. | `agentEnvInjection`, generated-local/session/auth tests, canary leakage tests. |
| `cli/server/edgeRoutePlan.js`, `cli/server/runtimeRelay/{confinement,RuntimeRelayManager}.js`, `cli/server/utils/agentReadiness.js` | Container-only private route and readiness. | Typed bwrap owner, PID/start/generation attestation, direct/stdio bwrap route, unchanged container path. | `edgeRoutePlanInterface`, `agentPortTransport`, `relayRequestAuth`, `agentReadiness`. |
| `cli/commands/workspaceUtil.js`, `cli/commands/cli.js` | CLI enable/readiness/attach. | Parse workdir boundary, preserve manual explicit start, dispatch interactive adapter, task/service logs/status. | CLI unit/integration tests. |
| `ploinky-box/command/{parse,route,execute}.mjs`, `bin/ploinky-box.mjs` | Outer argument routing and fixed `/workspace` exec. | Consume/transport exact workdir selection, preserve provider separator/PTY, no raw host-path inference. | `ploinkyBoxArguments`, `ploinkyBoxCli`, native CLI tests. |
| `ploinky-box/contract/{image,container}.mjs`, `entrypoint/*`, `supervisor.mjs`, `smoke/graph.mjs` | Image ABI, Box boot, stop, smoke graph. | Require/probe bwrap without privilege; hybrid status; verify bwrap cleanup before stop. Keep exact four outer mounts. | Box image/entrypoint/supervisor/smoke/native tests. |
| `tests/testAgent/manifest.json`, `tests/doPrepare.sh`, `tests/test-functions/workspace_dependency_startup_tests.sh` | Runtime fixtures. | Split strict bwrap versus Podman fixtures and expected registry runtime. | Existing shell/unit suites. |

### 19.2 `container-image-builds`

| Files/modules | Current responsibility | Change | Tests/gate |
| --- | --- | --- | --- |
| `images/ploinky-box/Dockerfile` | Pinned Podman base (`quay.io/podman/stable` digest, Podman 5.8.2); Node 24 + npm/npx copied to `/usr/local`; cloudflared; `dnf install git iproute libcap fuse-overlayfs netavark aardvark-dns passt slirp4netns util-linux-core` (line 19). | Install pinned distro Bubblewrap and only proven toolchain packages; retain rootless/non-privileged user and Node ABI. **Also remove `PLOINKY_DISABLE_HOST_SANDBOX=1` from the `ENV` block (line 74)** — leaving it makes the phase-3 selector a no-op inside the Box. **Concrete toolchain delta to close:** coding agents currently inherit `bash bubblewrap ca-certificates curl ffmpeg git g++ make openssh-client python3` from `assistos/ploinky-node:24-bookworm-tools` (`images/ploinky-node/Dockerfile:6-18`); the Box today has only `git` from that list (Fedora-base provision of `curl`/`ca-certificates` is **unverified — check the base image before sizing the delta**). Add what a representative provider task actually needs, proven by the phase-2 native smoke, not by assumption. | `tests/image-definitions.test.mjs` (update the line-472 env assertion in the same change). |
| `.github/workflows/publish-ploinky-box-image.yml` | Native digest build/merge without behavioral gates. | Add per-arch pre-promotion native bwrap capability/policy/provider smoke; upload diagnostics; merge/promote only after gates. | Workflow structural assertions plus live amd64/arm64 run. |
| New `tests/native/ploinky-box-bwrap.mjs` or source-owned smoke script copied into image | No Box-native bwrap test. | Prove nested user/mount/PID/IPC/UTS, private proc, RO/RW overlays, clearenv, Node/npm, signals, no privilege/engine access. | Mandatory on Linux amd64/arm64 and Podman Machine lane. |

### 19.3 `AchillesCLI`

| Files/modules | Current responsibility | Change | Tests |
| --- | --- | --- | --- |
| `opencodeAgent`, `codexAgent`, `piAgent` `manifest.json` | Manual coding services and direct CLI entries. | Keep manual/true; replace raw CLI with interactive adapters; add uniform readiness including Codex; update logical HOME paths. | Install/manifest/provider-policy tests. |
| `GPTResearcher/manifest.json` | Specialized Python/browser bwrap-runner container. | Remove true only; retain image/start semantics. | GPTResearcher/container smoke. |
| OpenCode/PI `scripts/task-sandbox.mjs`, `check-task-sandbox.mjs`, `ensure-bubblewrap.sh` | Duplicated nested policy/probe. | Convert to thin provider adapters around `/Agent/lib/providerSandbox.mjs`; production Box requires private proc; remove directory creation and direct-policy drift. | `tests/taskSandbox.test.mjs`. |
| OpenCode `opencode-runner.mjs`, `execute-task.mjs`, `continue-task.mjs`, model/control/login files | Task/session and several direct provider spawns. | Route task, resume, session recovery, models, control/login provider execution through canonical policy and exclusive HOME lease; preserve scoped broker. | OpenCode API/auth/install/cancel tests. |
| PI `execute-task.mjs`, `continue-task.mjs`, `pi-model-runtime.mjs`, model/login/session files | Nested tasks but trusted in-process/direct login/model code. | Classify pure trusted operations; sandbox every provider-code/network execution; preserve scoped broker and sessions. | PI execute/install/login/concurrency tests. |
| Codex `codex-runner.mjs`, `execute-task.mjs`, `continue-task.mjs`, model/login/session files | Direct Codex spawn with native sandbox and reusable credential. | Add nested Ploinky policy, strict path validation, scoped Soul broker, clearenv, cancellation parity; retain Codex native flags as defense in depth. | Codex bwrap/path/leakage/cancel/continue tests. |
| All three `install-*.sh`, stores, readiness scripts | Provider install and `/root` state. | `/home/agent`, Box Node/npm, known absolute-path migration, trusted-update lease, immutable executable roots. | Existing install tests plus persistence/rollback. |
| New all-three `scripts/interactive-cli.mjs` (or one shared source copied at package time) | No narrow interactive wrapper. | Same provider policy, workdir, PTY/signal, HOME/broker/executable rules. | Native TTY and non-TTY matrix. |
| `achilles-cli/src/lib/copilotCodingAgentRouting.mjs`, three launch skills, `webchatBackgroundTasks.mjs` | Browser selection/start/status. | Preserve selection; surface structured policy errors; verify same policy for all targets. | Router/launcher/background task tests. |

### 19.4 Manifest-cleanup repositories

| Repository/files | Change | Tests/completion |
| --- | --- | --- |
| `AssistOSExplorer/{dpuAgent,explorer,gitAgent,multimedia,soplangAgent,tasksAgent,webAssist}/manifest.json` | Remove true; no other semantic change. | Manifest inventory zero for these paths; full Explorer graph starts them as Podman; volumes/no-wait/routes unchanged. |
| `copilot-agents/{browserUseAgent,copilotProviderRelay,research-agents,webSearchAgent}/manifest.json` | Remove true. | Update `browser-use-provider`, GPTResearcher/OpenCode/PI/provider manifest assertions; browser delegation topology works. |
| `UmamiAgent/umamiAgent/manifest.json` | Remove true. | Stateful stack/image/persistence/routing smoke. |

## 20. Ordered implementation phases and cross-repository dependencies

Every phase uses `ploinky-proxy`. A phase is complete only after its named tests pass and related source changes are committed/pushed without unrelated work.

| Phase | Repository/files | Concrete work | Dependency/migration | Failure behavior and completion criterion |
| --- | --- | --- | --- | --- |
| 0. Decision and inventory freeze | All definite repos; section 24 | Record architect answers, freeze 16-manifest inventory and managed drift report, define error codes/telemetry. | None. | No implementation of decision-dependent paths until answers recorded; exact scope signed off. |
| 1. Selector cleanup | AchillesCLI GPTResearcher; seven Assist manifests; four copilot manifests; Umami manifest; Ploinky fixtures | Remove thirteen production flags and split fixtures; preserve all other manifest bytes/semantics where possible. | Must precede phase 3 deployment. | Inventory CI fails if true appears outside three allowlisted coding manifests/explicit test fixture; specialized smoke passes. |
| 2. Box capability | `container-image-builds` Dockerfile/workflow/native test; Ploinky image/entrypoint contract | Add pinned bwrap/tools and native private-proc/namespace/mount/signal tests on both architectures and Podman Machine. | Phase 1 may run in parallel; image digest needed by phase 3 native work. | Image promotion stops on any capability failure; no privilege/capability/extra mount is added. |
| 3. Strict runtime selector | Ploinky selector/status/fixtures | Evaluate true before Box Podman return, enforce bwrap, preserve false/missing container; hybrid status/error codes. | Phases 1 and 2 merged/deployable. | Missing/unusable bwrap fails coding agent only, never creates a container; unit matrix green. |
| 4. Trusted service policy and HOME | Ploinky bwrap manager/fleet/workspace structure/provider library | Coding service mounts, `/home/agent`, immutable runtime, service/task ownership, canonical policy primitives. | Phase 3; HOME decision. | Invalid mount/HOME/runtime fails before service route; dummy trusted AgentServer starts without coding Podman container. |
| 5. Identity and bwrap route | Ploinky identity descriptor, AgentServer bootstrap, edge plan/relay/readiness | Implement confirmed credential transport and typed bwrap owner route with stale generation/PID defenses. | Phase 4; credential/relay decision. | No authenticated readiness means no route; stale/mismatched owner fails closed; full MCP round trip passes. |
| 6. Shared provider policy | Ploinky `providerSandbox`; Achilles OpenCode/PI adapters/tests | Workspace RO + masks + exact WORKDIR RW, HOME/executable overlays, clearenv, private proc, HOME lease. | Phases 2, 4; root/sibling/network/concurrency decisions. | Any validation/capability drift prevents spawn; adversarial policy suite green for OpenCode/PI. |
| 7. Codex and residual provider paths | Achilles all provider runners/models/login/control/install/readiness/interactive | Bring Codex to parity/scoped broker; enumerate and wrap every direct provider invocation; migrate HOME paths. | Phases 5–6. | Static/test enumeration rejects unapproved direct provider spawn/import; all three task/login/model/continue flows green. |
| 8. Browser and interactive integration | Achilles launch/background modules; Ploinky Box/CLI parser/attach; three manifests | Public workdir selector, separator/PTY/signals, manual cold start, structured errors, same nested policy. | Phase 7; CLI/root decision. | Valid subfolders work; invalid paths fail before provider; no coding container; TTY/non-TTY and browser matrix green. |
| 9. Lifecycle/observability | Ploinky fleet/status/logs/supervisor; Achilles TaskQueue adapters | Exact task/service registry, cancellation/crash/restart/disable/Box stop cleanup, sanitized logs/status. | Phases 5–8. | Failure injection leaves no owned process/broker/route; status/log assertions green. |
| 10. Native/E2E rollout | Ploinky native suites, image workflow, all runtime repos | Refresh managed checkouts from `ploinky-proxy`; run hybrid Explorer plus all coding flows; canary release and rollback drill. | All earlier phases. | Definition of done in section 25, exact digests/commits captured, no stale managed manifest. |
| 11. Later hardening | Ploinky/image/Achilles as separately approved | Private egress, potential safe read-only concurrency, provider-specific toolchain minimization. | Production evidence; not initial migration gate unless architect rejects shared network. | Separate architecture/security review. |

## 21. Unit, integration, native Box, and end-to-end test plan

### 21.1 Unit and contract tests

| Suite | Required assertions |
| --- | --- |
| `ploinky/tests/unit/sandboxRuntime.test.mjs` | Full Box/outside matrix; true strict bwrap; false/missing Podman; missing/probe/start failure no fallback; startup independence. |
| `bwrapArgs.test.mjs`, new `providerSandbox.test.mjs` | Exact mount order/modes, protected masks, `/home/agent`, Node RO, executable overlays, no engine/shared/control mounts, clearenv, private proc args. |
| `agentEnvInjection.test.mjs` and identity tests | Reserved injection rejected; exact service credential only; provider allowlist and canary absence. |
| `sandboxProcessOwnership.test.mjs`, `agentRuntimeState.test.mjs` | Runtime-key consistency, PID reuse, generation mismatch, service/task roles, TERM/KILL exactness. |
| Relay/readiness suites | Container behavior unchanged; bwrap owner exact; stale lease/PID/start/generation/port rejected; authenticated MCP readiness. |
| Box parser/CLI suites | Workdir syntax/separator, no provider leakage, fixed mappings, TTY/non-TTY and signal behavior. |
| Achilles `tests/taskSandbox.test.mjs` and new Codex parity tests | Valid/malformed paths, siblings RO, selected RW, masks inaccessible, HOME only, immutable binaries, private proc, clearenv, no fallback. |
| Provider install/execute/control suites | Node/npm source, HOME migration/persistence, scoped broker, cancel/continue/login/models, direct-provider invocation allowlist. |
| Manifest repository tests | Exact three-production-selector allowlist and specialized agent container expectations. |

### 21.2 Integration and native Box tests

| Layer | Scenario |
| --- | --- |
| Ploinky process integration | Start dummy true AgentServer, authenticated MCP request, CLI attach, task spawn/status/cancel, restart/disable; assert registry runtime/PIDs/logs. |
| Production Box contract | Build exact image; run non-privileged rootless Podman with exact four mounts/devices/security options; nested bwrap unshares user/mount/PID/IPC/UTS and private proc on amd64/arm64/Podman Machine. |
| Hybrid graph | Start Explorer dependency graph; confirm specialized/non-target agents are nested Podman and coding agents absent until explicit use. |
| Coding E2E | Browser and CLI for OpenCode, Codex, PI in paths with spaces; create/modify selected file, read sibling, fail sibling write, continue, login/model operation, cancel. |
| Absence proof | Snapshot `podman ps --all`, engine events, and registry before/after each coding start; no coding AgentServer/task container or image pull. |
| Persistence | Restart provider/service/Box and verify exact alias HOME sessions/auth remain; second alias cannot read first. |
| Rollback | Stop all tasks, deploy prior Ploinky/image, mount same physical HOME at old `/root`, refresh managed repos back, prove containers can resume without data loss. |

## 22. Security tests and failure injection

| Attack/failure | Injection | Pass condition |
| --- | --- | --- |
| Traversal/symlink | `..`, absolute escape, symlink chain, rename/swap between validation and spawn, managed-repo parent escape. | No provider/broker/HOME mutation; named policy error. |
| Workspace policy | Attempt selected write, sibling read/write, root selection, protected path read, `.data` enumeration. | Selected write succeeds; sibling read follows confirmed policy; sibling write and protected/other-home reads fail. |
| Executable poisoning | Provider writes/replaces/symlinks its executable/package; race trusted update. | Provider namespace cannot persist replacement; identity drift aborts; trusted update requires exclusive lease. |
| Proc isolation | Read `/proc`, enumerate PIDs, open AgentServer environ/cmdline/fd/root. | Provider sees only inner namespace and cannot inspect outer AgentServer. |
| Secret leakage | Canary master/service/other-provider values in parent env/files/fds; induce spawn/readiness/provider errors. | Canary absent from provider env/argv/mountinfo/fds/stdout/stderr/service/task logs/status. |
| Relay confused deputy | Reuse old descriptor/token, mutate PID/start/generation/port/owner, replay request, cancel during mint. | Route refuses before socket open; exact error and audit event. |
| Engine access | Probe sockets, `/home/podman/.local/share/containers`, `podman`, `/dev/fuse`, `/dev/net/tun`; attempt nested container. | Storage/socket/devices absent; no engine control even if a client binary exists. |
| Missing bwrap | Remove/non-executable/wrong binary, unsupported userns, private proc failure, changed binary after probe. | Clear fatal bwrap error; zero coding containers/direct provider processes. |
| Lifecycle | Kill provider, adapter, service, Router, outer exec; SIGSTOP; PID reuse; corrupt/stale records; Box stop timeout. | Exact owned trees/brokers/routes cleaned; unrelated PID untouched; restart recovers or fails closed. |
| HOME concurrency | Parallel task/task, task/login, task/TUI, two aliases; crash lock owner. | First rollout serializes same HOME, recovers stale lock safely, and permits distinct aliases without cross-read. |
| Network | Scan Box loopback; call Router/Soul/other service without token; try broker token outside task/audience/TTL. | All sensitive endpoints authenticate; scoped token cannot escape route/task/generation. Residual outbound exfiltration is documented, not claimed solved. |

## 23. Rollout, compatibility, and rollback strategy

| Stage | Action and gate |
| --- | --- |
| Pre-merge | Land selector cleanup first. Add CI allowlist that blocks any new production true outside the three coding manifests. |
| Image canary | Publish immutable Box candidate after native gates; do not retag stable. Capture bwrap/Node/npm versions and both architecture digests. |
| Runtime dark launch | Ship Ploinky ability behind release selection while managed coding manifests remain unrefreshed; exercise dummy bwrap service only. Do not add a manifest policy flag. |
| Managed refresh | Update managed checkouts from exact `ploinky-proxy` commits; compare manifests/source hashes with primaries. Refuse mixed source/runtime generations. |
| Coding canary | One isolated workspace/alias per provider, then browser and CLI, then concurrency/lifecycle/hybrid graph. Monitor runtime selection, readiness, route failures, leaked-redaction counters, orphan checks. |
| General rollout | Promote only when section 25 is green on both architectures and rollback drill succeeds. |

Compatibility rules: `startup: "manual"` remains unchanged; false/missing manifests continue Podman; provider task/continuation result schemas stay compatible; physical HOME backing is reused; Codex native sandbox remains enabled; container relay behavior remains a separate unchanged descriptor kind.

Rollback is release-level, never a silent per-launch fallback. Stop and verify all bwrap tasks/services, invalidate bwrap credentials/routes, restore the previous Ploinky/image and source commits, refresh managed repos to the previous manifest set, and restart coding agents as their previous Podman containers. The same physical `.data/<key>` is mounted at `/root` by the old release. Never automatically fall back from a failed true launch because that changes the security boundary without operator consent.

## 24. Open decisions requiring architect confirmation

| Decision | Current-code implication | Recommended default and trade-off | Can work proceed? | Dependent phases |
| --- | --- | --- | --- | --- |
| Exact `/workspace` as writable WORKDIR | Current OpenCode/PI allow it; Box CLI loses subfolder and commonly yields root; it makes all user workspace RW. | Reject by default. If product needs it, require an explicit root-acknowledgement operation, never omission/default. Safest integrity, but existing root-launched UX must choose/create a project subfolder. | Policy primitives/tests can proceed; browser/CLI release cannot. | 6, 8, 10 |
| Public CLI syntax | Current `ploinky cli` passes regular args to provider and outer exec fixes cwd. | `ploinky cli <agent> --workdir <path> -- <provider-args>`; Ploinky consumes only pre-separator selector. Clear but may reserve a provider option in that position. | Parser can be prototyped only; public contract needs confirmation. | 8, 10 |
| Readable siblings with network | Target RO workspace permits exfiltration; current OpenCode/PI hide siblings. | Accept explicitly for first rollout to meet architecture's RO-workspace model, with strong scoped credentials and warning/docs. If confidentiality is required, hide siblings instead; that is a target policy change. | Mount builder can support either; release cannot claim approved threat model. | 6, 10, 11 |
| Shared Box network | Current nested bwrap uses `--share-net`; required providers need egress; loopback services become reachable. | Shared network for first rollout only after authenticated-loopback scan; private controlled egress as later hardening. Lowest compatibility risk, highest lateral visibility. | Capability/provider work proceeds; production rollout needs acceptance. | 2, 6, 10, 11 |
| AgentServer credential transport | Current bwrap is principal-only; AgentServer/MCP needs exact secret; relay assumes container attestation. | Exact generation-bound mode-0600 RO descriptor file, parent absent, loaded by trusted bootstrap and never passed inward. Simpler than socket broker but leaves a bound capability readable by the trusted service for its lifetime. | Non-credential mounts/runtime proceed; authenticated service/relay cannot. | 4, 5, 10 |
| `/root` to `/home/agent` | Physical HOME already exists, but scripts/configs contain `/root`. | Reuse physical backing, new logical mount, version marker, atomic known-path migration, no broad symlink. Preserves rollback but requires provider compatibility audit. | Tests/audit proceed; migration behavior needs confirmation before rollout. | 4, 6, 7, 10 |
| Concurrent tasks sharing one HOME | TaskQueue may overlap tasks; provider DB/config/session safety unproven. | Exclusive per-HOME lease for all provider execution/update/login/TUI in first rollout. Safe but reduces concurrency and can queue browser tasks. | Lock implementation/tests proceed; product behavior needs confirmation. | 6–10 |
| Bwrap relay transport | Source only supports container inspect/exec. | Typed bwrap owner plus Router-owned direct/stdio loopback transport, preserving leases/tokens/deny sets; do not fake a container ID. Smaller than entering namespaces, but depends on shared network and exact dynamic-port ownership. | Design tests proceed; implementation must align with credential/network decisions. | 5, 10 |

Architect confirmation should be recorded in the architecture decision log or a dated addendum before phase 5 and before any public rollout. No manifest property should be invented to defer these platform decisions per agent.

## 25. Definition of done

| Gate | Required evidence |
| --- | --- |
| Selector | Exactly OpenCode/Codex/PI production manifests contain true; startup remains manual; Box true is mandatory bwrap with no fallback. |
| Hybrid runtime | No Podman container/event/image pull for three coding agents; all specialized non-coding agents pass their container smoke. |
| Box | Production non-privileged contract passes native bwrap namespaces/private proc/mount/signals on amd64, arm64, and Podman Machine. |
| Filesystem | Selected WORKDIR writable; confirmed sibling policy enforced; protected Ploinky state/other homes/engine storage unreadable; system/Node/deps/provider executable immutable. |
| HOME | Exact alias persistence across sessions/Box restart; cross-alias denial; confirmed concurrency policy passes crash/recovery tests. |
| Provider parity | Browser, task, continuation, models, login, and interactive flows for all three execute inside the canonical provider boundary; Codex retains native defense in depth. |
| Credentials/network | No canary leakage through env/argv/mounts/logs/fds/proc; exact authenticated MCP/relay works; task broker is scoped; loopback auth scan and approved network policy pass. |
| Workdir | Arbitrary valid existing subfolders and managed-repo exception work; traversal/symlink/TOCTOU/root policy tests pass. |
| Lifecycle | Cancel, crash, disable, restart, stale PID/generation, Router loss, and Box stop clean exact trees/routes/brokers without touching unrelated processes. |
| Observability | Registry/status/logs report real bwrap service/task runtime, generation, PID identity, workdir, readiness, and sanitized failures. |
| Toolchain | Box Node/npm and provider versions work from immutable mounts; no agent depends on its old image filesystem. |
| Rollout | Managed checkouts match approved source commits; canary and rollback drill pass; branch/commit/digest evidence archived. |

## 26. Git branch, status, commit, and push report

Snapshot taken 2026-08-04 before creating this plan. All definite source repositories were already on `ploinky-proxy`; no branch switch or force-push was performed.

| Repository | Branch / upstream | Origin | HEAD at snapshot | Worktree disposition |
| --- | --- | --- | --- | --- |
| `file-parser` | `ploinky-proxy` / none at snapshot | `https://github.com/PloinkyRepos/file-parser.git` | `c4bf79fb37b20346cc3e78619b70a6fe2cb3d78b` at snapshot | Very large unrelated staged/modified QA, Playwright, evidence, and document set preserved untouched — see the completed-actions note below. |
| `ploinky` | `ploinky-proxy` / `origin/ploinky-proxy` | `https://github.com/assistos-ai/ploinky` | `25e4c66153612ca75112345dfadf8ae443943c6e` | Clean. |
| `AchillesCLI` | `ploinky-proxy` / `origin/ploinky-proxy` | `https://github.com/OutfinityResearch/AchillesCLI.git` | `1fe668f733256fd429444a07224ed25e65e40ce7` | Related tracked bwrap `/proc` and readiness work reviewed; 42 tests passed; committed as `1fe668f Harden nested Bubblewrap proc fallback` and pushed. Six unrelated untracked GPTResearcher `__pycache__` files remain untouched. GitHub reported the repository has moved; the configured remote accepted the push and was not rewritten. |
| `container-image-builds` | `ploinky-proxy` / `origin/ploinky-proxy` | `https://github.com/AssistOS-AI/container-image-builds.git` | `18867613004527d188c56281e82dd1a8a1f9900e` | Clean. |
| `AssistOSExplorer` | `ploinky-proxy` / `origin/ploinky-proxy` | `https://github.com/PloinkyRepos/AssistOSExplorer.git` | `a780fe098de4e199f3772d5b149324aa9dd9278d` | Clean. |
| `copilot-agents` | `ploinky-proxy` / `origin/ploinky-proxy` | `https://github.com/AssistOS-AI/copilot-agents.git` | `e6837b01b97066d1a08567292ae30ff780372659` | Clean. |
| `UmamiAgent` | `ploinky-proxy` / `origin/ploinky-proxy` | `https://github.com/AssistOS-AI/UmamiAgent.git` | `4f136fba997f4748efe1ef396c2f35f1f0452a82` | Clean. |

Completed actions in `file-parser` (status report, not intent):

| Commit | Contents | Verification |
| --- | --- | --- |
| `092db1c` "Document Bubblewrap coding-agent migration" | exactly two files — `BWRAP_CODING_AGENTS_ARCHITECTURE.md` (833 lines) and `BWRAP_CODING_AGENTS_IMPLEMENTATION_PLAN.md` (613 lines) | `git show --stat 092db1c` confirms two files, 1446 insertions, and **no** QA/Playwright/evidence artifacts. |
| follow-up verification commit | this file only, adding §27 and the inline corrections to §3.1, §3.2, and §19.2 | Committed with an explicit pathspec (`git commit <path> -m …`, which implies `--only`) so the ~7,900 pre-existing staged artifact entries stay in the index, uncommitted, exactly as found. |

Both commits are path-scoped to the two migration documents. The pre-existing staged artifact set was never added, removed, reset, or stashed; `git status --porcelain` still reports 7,934 entries, unchanged.

Push outcome: `ploinky-proxy` did not exist on `origin` at the initial snapshot (`git ls-remote origin` then returned only `main`, `ploinky-box`, `ploinky-box-v2`, `profile_implementation`, and two `feature/*` refs), but it was created remotely by the session that authored `092db1c`. The verification push was therefore a **fast-forward** update, `092db1c..829ec55`, which also set the local upstream to `origin/ploinky-proxy`. `origin/ploinky-proxy` is now `829ec55`. The remote reports that `PloinkyRepos/file-parser` has moved to `AssistOS-AI/file-parser`; the configured remote accepted the push and was deliberately **not** rewritten. No force-push was used in any repository.

Inspected, baseline-unchanged repositories:

| Repository | Branch / upstream / HEAD | Status and reason not committed |
| --- | --- | --- |
| `ploinky/node_modules/achillesAgentLib` | `ploinky-proxy` / `origin/ploinky-proxy` / `975e7a318e1c8c8d1792ec96fe7b820fc465d1f5` | Clean; no verified source-change ownership. |
| `proxies` | `ploinky-proxy` / `origin/ploinky-proxy` / `a98fc20660ac88e7380e47d86824b1c27e51f2cb` | Eight tracked documentation/instruction edits pre-exist. They replace absolute workspace paths and revise older plans/handoffs; they are unrelated or ambiguous for this migration and remain untouched. |
| `basic` | `ploinky-proxy` / `origin/ploinky-proxy` / `08bf75ffa2f234cdfa8916a98b4e69bc8ce20fdb` | Clean; reference implementation only. |
| `webmeetInfra` | `ploinky-proxy` / `origin/ploinky-proxy` / `0348d6fe0d598dfc962d7aae7b9c10e798cf1bfd` | Clean; acceptance dependency only. |

Managed runtime copies are deliberately not branch-normalized or committed as source: `.ploinky/repos/AchillesCLI` is `master` at `dd82c35d354cd10988ebf5e36c50712f481a558f`; `AchillesIDE`, `basic`, and `copilot-agents` shadows are on their managed main branches and differ from primaries. Phase 10 replaces/reconciles them through the normal managed-repository refresh from exact approved `ploinky-proxy` commits. Editing those generated/runtime checkouts directly would violate the preservation and generated-state rules.

No migration implementation was written during this planning task.

## 27. Independent verification addendum (2026-08-04)

A second, independent read-only verification pass re-derived the current-state claims of sections 3 and 4 from source. It **confirmed** the plan's architecture, phase order, and gap matrix. The corrections already applied inline above are: the third Podman-forcing mechanism and the divergent Box-marker detectors (§3.1), the confirmed `agentRuntimeState.js` key mismatch (§3.2), and the concrete Box image toolchain delta plus the `ENV` removal (§19.2). This section records the remaining verified facts that change implementation work, so a later session does not re-derive them.

### 27.1 Selector inventory — verified counts

A complete sweep of all 56 `manifest.json` files (excluding `.ploinky/`, `node_modules/`, `.git/`) found **17** files with `lite-sandbox: true`: the 16 production manifests §14 enumerates, plus `ploinky/tests/testAgent/manifest.json`. No manifest sets it `false`. `startup: "manual"` appears in exactly **5** manifests: the three coding agents, `AchillesCLI/GPTResearcher`, and `proxies/searchAgent`. Two further observations worth acting on during phase 1:

| Observation | Implication |
| --- | --- |
| Nothing in the resolver cross-checks `lite-sandbox` against `container`. `getRuntimeForAgent`'s only manifest read is `manifest?.['lite-sandbox'] === true`. | The CI allowlist of §23 is the *only* thing that will catch a specialized-image agent re-acquiring the flag. Make it a hard gate, not a warning. |
| `AssistOSExplorer/webmeetAgent` is a generic-node agent that does **not** set the flag, while six sibling generic-node agents do. | The flag's current distribution is inconsistent rather than intentional. This supports removing all 13 rather than trying to preserve intent. |

### 27.2 Every `lite-sandbox` flag is currently inert

Because the host sandbox is disabled by default outside the Box (`sandboxRuntime.js:19-25`, `disableHostRuntimes: sandbox.disableHostRuntimes !== false`) and forced disabled inside it, **no agent in this workspace currently runs under bwrap or seatbelt**. The 17 flags express declared intent only. Two consequences for planning:

1. Phase 1's manifest cleanup cannot regress runtime behavior — it removes flags that select nothing today. It is a low-risk change whose value is making phase 3's strict semantics safe.
2. Any local validation performed on macOS exercises the **seatbelt** branch (`common.js:765-772`), never bwrap. The bwrap path requires a Linux host or the Box. Do not accept a macOS run as evidence for a bwrap gate.

### 27.3 Provider sandbox — current mount reality

The plan's §7.3 target is correct, but the delta from today is larger than "add masks". **Observed:** the committed task sandbox (`task-sandbox.mjs:449-509`, byte-identical between `opencodeAgent` and `piAgent`) mounts the system tree, `/opt/ploinky-node`, caller-supplied RO/RW paths, and the resolved project directory — **it never mounts `/workspace` at all**. It validates `projectDir` against `PLOINKY_WORKSPACE_ROOT` but does not expose the workspace. Therefore:

| Target property | Current state | Work implied |
| --- | --- | --- |
| workspace RO | not mounted | **new mount**, not a mode change |
| sibling projects readable | not visible | this is a *widening* of provider visibility — §24's "readable siblings" decision therefore grants access that does not exist today, rather than preserving it. Weigh accordingly. |
| control-plane masks | unnecessary today (nothing to mask) | become load-bearing the moment `/workspace` is mounted |
| `/workspace` as WORKDIR | **accepted today** — `inspectProjectPath` permits `relative === ''` (`task-sandbox.mjs:364-371`) | §24's root decision must actively *restrict* current behavior |

Also verified: the RW binds are emitted before `--remount-ro /` (`:490-499`). bwrap applies options in order, so acceptance tests must assert the effective writability matrix by attempting real writes, not by inspecting argv.

### 27.4 Codex is the widest gap

**Observed** (`codex-runner.mjs:186-194`): Codex is spawned directly with `cwd: projectDir` and the **entire unfiltered `process.env`** plus `HOME:'/root'`, with no bwrap wrapper, no `--clearenv`, no readiness script, and no scoped broker. Its managed-Soul mode passes the **raw** `PLOINKY_AGENT_API_KEY` to the provider via `--config model_providers.<p>.env_key=PLOINKY_AGENT_API_KEY` (`:142`) and sets `shell_environment_policy.ignore_default_excludes=false` (`:145`). OpenCode and PI, by contrast, expose only an ephemeral loopback `PLOINKY_TASK_BROKER_URL`/`_KEY` pair. Phase 7 is therefore not "parity work" — for Codex it is the introduction of the entire boundary, and it is the single change with the largest security delta in the migration. Sequence it with its own review, and keep `--sandbox workspace-write` as defense in depth per §5.

### 27.5 Credential coupling that blocks phases 6-8

**Observed:** the scoped Soul broker starts **only** when `PLOINKY_AGENT_API_KEY`, `PLOINKY_ROUTER_URL`, and `PLOINKY_ROUTER_REQUEST_AUTHORITY` all carry `PLOINKY_ENV_SOURCE_* = generated` provenance (`scoped-soul-broker.mjs:12-24`); otherwise `startScopedSoulBroker` returns `null`. The bwrap env builder injects none of those (`bwrapServiceManager.js:560-574`, pinned by `agentEnvInjection.test.mjs:52-61`). Independently, the launch skills throw without `PLOINKY_AGENT_SECRET` (`launch-opencode/src/index.mjs:13-15`).

The practical consequence: **phase 5 (identity) is a hard blocker for phases 6, 7, and 8, for all three providers** — not merely for the authenticated MCP route. Without it a migrated AgentServer cannot mint the assertions the browser flow needs, and every provider silently loses managed model routing and falls back to whatever direct provider credentials happen to be in env. Do not attempt a "filesystem-only" partial rollout that skips phase 5.

Two further verified facts for phase 5's design: `RuntimeRelay` is container-gated at three independent layers (`confinement.js:3-17` runtime allowlist + 64-hex id; inspect-label attestation at `:41-49`; `podman exec` at `RuntimeRelayManager.js:326-330`), and `edgeRoutePlan.js:118-121` independently gates agent-port plans on the same pair, returning `503 AGENT_RUNTIME_INACTIVE`. However, the agent **root** surface is a direct loopback dial that needs no relay (`routerHandlers.js:145-162`). A first rollout can therefore work on the root/`/mcp` surface alone; the agent-port convention (`/base-agent-additional-server/<agent>/<port>/`) can stay unsupported-by-policy for coding agents if none of them declares such a service — verify that before committing to the larger relay work.

### 27.6 `/root` occurrences to migrate (§24 O6 scope)

`HOME=/root` is not a single constant. **Observed** occurrences that a `/home/agent` migration must cover: `FIXED_TASK_ENV.HOME` and the `/root/.local/bin`,`/root/.opencode/bin` PATH entries (`task-sandbox.mjs:24-29`); explicit `HOME:'/root'` in `opencode-runner.mjs:54`, `codex-runner.mjs:191`, `piAgent/scripts/execute-task.mjs:258`, and both `check-task-sandbox.mjs`; `DEFAULT_*_HOME = '/root'` fallbacks in all three runners; continuation/session store roots under `/root/.ploinky/` (all three stores, each with a different record shape — OpenCode `sessionId`, PI `sessionId`+`sessionDir`, Codex `threadId`); and the ploinky-side bind `--bind homeDir /root` plus `env.HOME='/root'` (`bwrapServiceManager.js:423,557`). Manifest `cli` fields and both `readiness.sh` scripts already use `$HOME` and need no change. Continuation records persist **absolute** paths, so the migration needs a tolerant reader that accepts `/root/...` records and rewrites on next write — otherwise every in-flight task handle breaks at cutover.

### 27.7 Verification performed

| Check | Result |
| --- | --- |
| `node --test tests/taskSandbox.test.mjs` (AchillesCLI) | 18/18 pass |
| `node --test opencodeAgent/test/openai-api.test.mjs` | 13/13 pass |
| `node --test piAgent/test/execute-task.test.mjs` | 11/11 pass |
| Citation spot-checks | `sandboxRuntime.js`, `docker/common.js`, `bwrapServiceManager.js`, `bwrapFleet.js`, `agentRuntimeState.js`, `execute.mjs`, `task-sandbox.mjs`, `codex-runner.mjs`, `confinement.js`, `edgeRoutePlan.js`, `agentEnvInjection.test.mjs`, `bwrapArgs.test.mjs`, both Dockerfiles, `image-definitions.test.mjs`, and all four coding manifests read directly |
| Not verified | native nested-bwrap behavior in the production Box (no Linux host available in this session); effective `sandbox.disableHostRuntimes` value in `.ploinky/agents.json` (read-denied); Fedora base image contents for `curl`/`ca-certificates`/`openssh`; `.ploinky/repos` managed-checkout commit identities (read-denied — §26's managed-drift figures come from the original planning session and were not re-derived) |
