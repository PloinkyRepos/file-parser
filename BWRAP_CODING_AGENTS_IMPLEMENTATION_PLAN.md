# Dual-Runtime Coding-Agent Migration: Implementation Plan

Status: implementation-ready clean-break planning document; no migration code is included.

Authority: `BWRAP_CODING_AGENTS_ARCHITECTURE.md` is the target architecture. The dated decisions in section 24 resolve its remaining rollout choices. The user explicitly waived backward compatibility on 2026-08-04. The two selector outcomes in this plan are both target behavior, not old/new compatibility modes.

> **For implementers:** execute this plan with `superpowers:subagent-driven-development` wherever tasks are independent, `superpowers:test-driven-development` for every feature or fix, and `superpowers:verification-before-completion` before each completion claim. Keep repository ownership explicit and review each subagent result before integration.

**Goal:** make `lite-sandbox` a universal, fail-closed selector while proving OpenCode, Codex, and PI AgentServers and provider flows in both selected runtimes.

**Architecture:** `true` selects Bubblewrap on Linux/inside Box or Seatbelt on macOS; false/missing selects Podman. Coding manifests retain their container declarations so the selector alone toggles the mode. Every provider execution uses the narrower provider boundary inside the selected AgentServer runtime.

**Primary technology:** Node.js 24, rootless Podman, Bubblewrap, macOS Seatbelt, native Linux `openat2`, Ploinky Router/MCP, and repository-native shell/Node test suites.

Evidence labels used below:

| Label | Meaning |
| --- | --- |
| **Observed** | Verified in the current primary source checkouts or their tests. |
| **Target** | Required by the authoritative architecture. |
| **Inferred** | Consequence of observed code and the target, but not yet proven in a native Box. |
| **Decision** | A rollout choice now fixed by section 24 rather than inferred from source. |

## 1. Executive summary

The migration is a hybrid runtime change, not a removal of nested containers. `ploinky-box` remains the single outer Podman container. `lite-sandbox` becomes a universal binary selector for every agent: true requires the platform sandbox, while false or missing requires Podman. Image-dependent application agents remain false/missing. OpenCode, Codex, and PI are the first agents required to pass in both modes, using the same manifest with a retained container declaration.

In sandbox mode the trusted coding AgentServer receives the complete `/workspace` read-write and its exact `/home/agent` persistent HOME. In container mode it retains the established coding-container filesystem, HOME, volume, relay, and lifecycle ABI. It never receives the Box master key or unrelated nested Podman storage. Every provider process—including browser tasks, continuation, model/login helpers that execute provider code, and interactive CLI—runs in a second, narrower bwrap namespace inside the selected service runtime. That provider namespace sees a sanitized workspace read-only, one canonical selected WORKDIR read-write, the exact mode-derived provider HOME read-write, immutable runtime and executable mounts, private `/proc`, minimal `/dev`, private `/tmp`, and a `--clearenv` environment. Ploinky control state, all other homes, engine storage, and engine sockets are absent.

The critical implementation order is: classify existing true selectors and remove them from incompatible image-dependent services; remove the unsafe whole-workspace readiness probe; prove bwrap plus the fd-binding launcher in the production Box; make universal runtime and network selection strict; build the trusted sandbox-service mount/HOME/identity path without regressing the container path; authenticate the existing direct root `/mcp` route; converge every provider invocation on one policy; then enable browser and interactive flows and run both-mode native security/E2E gates. Runtime selection must not release before the compatibility inventory and Box capability gate.

The highest-risk work is not the bwrap argument list. It is generation-bound AgentServer credentials, platform-owned shared-network admission, consistent nested policy across every provider subprocess, fd-pinned workdir/executable mounts, and exact process-tree cleanup. Section 24 records the fixed decisions; there are no remaining architect-confirmation blockers in this plan.

## 2. Scope and affected repositories

### 2.1 Definite implementation repositories

| Repository | Required branch | Planned responsibility |
| --- | --- | --- |
| `file-parser` | `ploinky-bwrap` from `ploinky-proxy` | Architecture record and this plan only; no migration implementation belongs in the aggregate root. |
| `ploinky` | `ploinky-bwrap` from `ploinky-proxy` | Strict runtime/network selection, trusted AgentServer bwrap policy, retained container path, provider policy library, pipe-fed identity descriptor and frozen context, fd-safe launcher source/protocol, direct root routing, workdir/PTY propagation, lifecycle, status, logs, Box contract tests. |
| `container-image-builds` | `ploinky-bwrap` from `ploinky-proxy` | Install pinned Bubblewrap, build/copy the fd-safe launcher, and add native amd64/arm64 capability and behavior gates. |
| `AchillesCLI` | `ploinky-bwrap` from `ploinky-proxy` | Retain dual-mode container metadata in three coding manifests; update all OpenCode/PI/Codex provider adapters; remove GPTResearcher's incompatible selector; browser launcher contract tests. |
| `AssistOSExplorer` | `ploinky-bwrap` from `ploinky-proxy` | Remove seven currently incompatible selectors and verify the Explorer dependency graph stays container-backed. |
| `copilot-agents` | `ploinky-bwrap` from `ploinky-proxy` | Remove four currently incompatible selectors and update manifest assertions; provider/browser topology remains container-backed. |
| `UmamiAgent` | `ploinky-bwrap` from `ploinky-proxy` | Remove the specialized Umami agent's selector and retain its Podman stack. |

### 2.2 Inspected dependencies with no baseline source change

| Repository or runtime copy | Finding | Treatment |
| --- | --- | --- |
| `ploinky/node_modules/achillesAgentLib` | **Observed:** coding delegation uses Ploinky's `/Agent/client/AgentMcpClient.mjs`; bwrap lifecycle, Router identity, and provider wrappers are not owned here. | No planned source change. Re-test as an immutable mounted dependency. Change only if generated-local transport fails the new credential descriptor contract. |
| `proxies` | **Observed:** Soul already accepts signed agent provenance; OpenCode/PI implement task-scoped loopback brokers. No primary manifest uses `lite-sandbox`. | No baseline source change. Validate the existing contract through Ploinky/Achilles integration tests. A proxy change requires a separately justified credential API delta. |
| `basic` | Its bwrap-runner capability/policy and native test are useful precedents; no primary selector needs migration. | Reference implementation only unless the shared probe is deliberately extracted. |
| `webmeetInfra` | Its image/network services remain Podman dependencies in the Explorer graph. | Acceptance coverage only. |
| `.ploinky/repos/*` | **Observed:** runtime-managed checkouts differ in branch, commit, and manifest content from primary checkouts. | Never edit or commit these as source. Refresh them from exact approved `ploinky-bwrap` source commits during rollout and assert resulting commit identities. |

### 2.3 Explicitly out of scope

| Excluded work | Reason |
| --- | --- |
| Replacing Podman for all agents | Contradicts the hybrid target and specialized-image requirements. |
| Adding `runtime.isolation`, isolation classes, or per-agent mount/network policy properties | Rejected by the architecture. `lite-sandbox` is the runtime selector; platform code owns the policy. |
| Redesigning `startup: "manual"` | Current lifecycle semantics already meet the target. |
| Editing generated `.ploinky` runtime state as source | Runtime state is refreshed/reconciled, not versioned implementation. |
| Making the outer Box privileged or mounting an engine socket | Violates the Box and provider trust boundaries. |
| Adding a `/root` shim to sandbox mode, old continuation/state readers, cross-runtime fallback, or downgrade-readable post-cutover sandbox HOME state | Backward compatibility was explicitly waived. Container mode's native HOME is retained because it is a target runtime; sandbox mode is a clean `/home/agent` ABI. Selected-runtime failures are explicit and recovery uses a pre-cutover snapshot. |

## 3. Verified current architecture

### 3.1 Runtime selection

| Evidence | Verified behavior |
| --- | --- |
| `ploinky/cli/utils/runtime/sandboxRuntime.js` | **Observed:** `/etc/ploinky-box` forces host sandbox disabled, rejects enabling it with `PLOINKY_BOX_SANDBOX_FORCED`, and reports Podman as effective. |
| `ploinky/cli/sandbox/docker/common.js:getRuntimeForAgent` | **Observed:** the Box branch returns Podman before inspecting `lite-sandbox`; outside Box, a disabled sandbox redirects `lite-sandbox` to a container, while enabled Linux/macOS selects bwrap/seatbelt. Missing bwrap fails, and a bwrap startup error has no implicit fallback. |
| `ploinky/tests/unit/sandboxRuntime.test.mjs` | **Observed:** tests currently encode forced Podman in Box and host-disable fallback outside it. |
| `container-image-builds/images/ploinky-box/Dockerfile:74` | **Observed:** the Box image additionally bakes `PLOINKY_DISABLE_HOST_SANDBOX=1` into `ENV`. `isHostSandboxDisabled()` (`sandboxRuntime.js:45-51`) checks that variable *before* the workspace config, so Podman is forced in the Box by **three** independent mechanisms — the `getRuntimeForAgent` marker short-circuit, this image env var, and the marker-driven `isForcedBoxSandboxPolicy()`. Phase 3 is not effective unless all three change together, and `container-image-builds/tests/image-definitions.test.mjs:448,472` pins both the marker line and this env var. |
| `ploinky/ploinky-box/lib/boxMarker.mjs:27-41` vs `sandboxRuntime.js:74-80` | **Observed:** two different Box detectors sit on the same decision path. `isInsideBox` (used by `getRuntimeForAgent`) rejects symlinks, requires `nlink === 1`, validates exact marker bytes, and **throws** on a malformed marker; `isForcedBoxSandboxPolicy` follows symlinks, ignores content, and swallows errors. They disagree on a corrupt/symlinked marker. Reconcile them in phase 3 rather than adding a third detector. |
| Outside-Box opt-in | **Observed:** host sandboxing is disabled only by default. An explicit `sandbox.disableHostRuntimes:false` selects seatbelt/bwrap for true manifests today. Removing a selector can therefore change non-Box behavior; phase 1 treats that as an intentional breaking change, never as an inert cleanup. |

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
| Network admission blocker | **Observed:** all three coding manifests omit `network`, so `canonicalizeNetwork(undefined)` produces `mode:'default'`. `resolveBwrapRuntimeProfile()` then calls `assertHostSandboxNetworkCompatibility()`, which accepts only explicit `mode:'host'`; a selected coding bwrap therefore fails before launch today. Phase 3 must derive the effective host/shared network internally from strict true and record it in runtime admission without adding a manifest policy field. |

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
| OpenCode | `task-sandbox.mjs` validates containment/symlinks, probes nested bwrap, clears env, unshares user/PID/IPC/UTS, shares network, mounts only the selected project RW, uses scoped Soul broker, and runs task/session recovery inside bwrap. | It does not mount `/workspace` RO, so siblings are invisible rather than readable; it can create missing project dirs; `/workspace` becomes wholly RW when selected; login/control/model-list and direct manifest CLI invoke provider code outside the narrow policy. |
| PI | Its `task-sandbox.mjs` is currently byte-identical to OpenCode; task/continue uses it and a scoped Soul broker. | Same workspace/root/HOME gaps; login and imported model runtime execute provider code in the trusted service; direct manifest CLI bypasses the provider boundary. |
| Codex | `codex-runner.mjs` enables Codex's own `workspace-write`/never-approve policy. | It directly spawns with inherited service env and `/root`, validates only `path.resolve`, uses reusable Router credentials, and has no nested bwrap, readiness probe, or scoped broker. Model app-server, login, and direct CLI are also unsandboxed at the provider layer. |
| Readiness added by `1fe668f` | OpenCode/PI `check-task-sandbox.mjs` now run provider `--version` with `projectDir=PLOINKY_WORKSPACE_ROOT`. | Current policy binds that selected path RW, so provider readiness receives the whole workspace writable without an explicit root choice. Phase 1 restores capability-only readiness; phase 6 reintroduces provider execution in a private empty readiness workspace. |
| Credential provenance coupling | OpenCode/PI scoped brokers and Codex managed routing require generated `PLOINKY_ROUTER_URL`, request-authority, API-key, and `PLOINKY_ENV_SOURCE_*` values; otherwise they fail or return no broker. | The new service descriptor intentionally does not recreate secret environment variables. Phase 5 must expose a frozen trusted credential-context API, and phases 6–7 must change brokers/runners to consume that context and fail closed; identity is therefore a hard blocker for every provider path. |

### 3.6 Box, HOME, relay, and managed checkout state

| Area | Verified behavior |
| --- | --- |
| Box image | `container-image-builds/images/ploinky-box/Dockerfile` copies Node 24/npm into `/usr/local` but does not explicitly install Bubblewrap. The publish workflow builds native amd64/arm64 digests but currently asserts no behavioral gate. |
| HOME | `workspaceStructure.js` already creates `<workspace>/.data/<sanitized-instance>` per instance/alias; generic bwrap maps it to `/root`. The broad workspace mount also reveals `.data` unless hidden. |
| Routing | `RuntimeRelay` and agent-port edge plans require Docker/Podman, a 64-hex container ID, inspect labels, and `runtime exec`. In contrast, the agent root surface already dials its registered loopback port directly. None of the three coding manifests declares an agent-owned additional port; their `/mcp` and endpoint execution use the root AgentServer. The scoped Soul broker's outbound Soul route remains an existing container-owned additional-port route. |
| Identity | `agentIdentityEnv.js` separates principal from post-attestation credentials. AgentServer inbound/outbound assertions require its exact agent secret; current bwrap deliberately omits that secret. |
| Managed drift | Managed AchillesCLI is `master` at `dd82c35...`, not the primary feature branch; all five inspected manifests differ and managed `achilles-cli` incorrectly adds `lite-sandbox`. `AchillesIDE`, `basic`, and `copilot-agents` managed shadows also differ from primaries. Rollout refreshes only from exact approved `ploinky-bwrap` commits. |

## 4. Current-to-target gap matrix

| Concern | Current | Target | Required owner/gate |
| --- | --- | --- | --- |
| Universal selector | Marker forces Podman before manifest evaluation and current behavior depends on workspace state. | For every agent, true means mandatory platform sandbox (Box/Linux bwrap, macOS Seatbelt); false/missing means mandatory Podman. Agent names do not affect dispatch. | `ploinky`; full runtime matrix and agent-name-independence gate. |
| Fallback | Disabled host sandbox can turn true into a container. | The selected backend either starts or fails. True never falls back to Podman; false/missing never falls forward to bwrap. | `ploinky`; missing/unusable backend, startup failure, and config-conflict tests. |
| Selector inventory | Sixteen production manifests use true; several image-dependent agents cannot satisfy sandbox mode. | Classify every true declaration by capability. Remove true from currently incompatible services. Do not add an exact-three name allowlist. | Four manifest repos merge their classifications before selector deployment. |
| Dual-mode coding declaration | The `ploinky-proxy` baseline contains true plus `docker.io/assistos/ploinky-node:24-bookworm-tools`; the current candidate commit removed those container declarations under the superseded one-way plan. | Restore and retain the reviewed container declaration on `ploinky-bwrap`. True ignores it and performs no image/engine action; false/missing requires and launches it. | Achilles candidate correction plus Ploinky dispatch tests in both modes. |
| Box capability | Bubblewrap absent from explicit image ABI. | Pinned bwrap and native namespace/proc/signal proof. | `container-image-builds` before runtime enablement. |
| Outer service | Broad generic bwrap mounts, `/root`, principal-only identity; existing container mode has its own established ABI. | Trusted sandbox coding profile: workspace RW, exact `/home/agent`, immutable runtime, pipe-fed exact generation identity. Container-selected mode retains its service ABI and RuntimeRelay behavior. | `ploinky`; authenticated readiness and both-mode regression gates. |
| Network admission | Missing network becomes `default`, while bwrap requires explicit `host`. | Strict true derives platform-owned effective `host` networking; manifests may not override coding sandbox network policy. | `ploinky`; network-contract/admission tests before any service launch. |
| Routing | Additional-port relay is container-only, but root AgentServer routing is already direct loopback. | First rollout supports only coding root `/mcp` and manifest endpoints; bwrap-owned additional ports fail with a stable unsupported-policy error. Existing container relay remains unchanged. | `ploinky`; root pre-dial ownership/readiness and explicit agent-port denial tests. |
| Provider workspace | OpenCode/PI see only project; Codex relies on native policy. | Workspace RO, exact WORKDIR RW, protected paths hidden for all. | Shared Ploinky policy + Achilles adapters. |
| Provider HOME | `/root`; writable state and executable trees intermixed. | Sandbox service mode uses exact per-alias `/home/agent`; container service mode derives its native HOME. Both re-bind executable/package roots RO inside the provider boundary and never share ABI state. | Ploinky/Achilles; mode-specific persistence/poisoning tests. |
| Environment | OpenCode/PI task paths clear env; other paths and Codex inherit broader env. | Every actual provider path uses `--clearenv` and a role-specific allowlist. | Achilles enumeration test. |
| Interactive | Direct `manifest.cli` runs under broad outer attach; workdir ignored. | Provider wrapper applies the same inner policy and exact workdir. | Ploinky CLI + three manifests/adapters. |
| Browser | Workdir forwarded, provider enforcement inconsistent. | Same validation/policy as interactive; manual agent starts explicitly. | Achilles launch/E2E tests. |
| Proc/network | Provider task shares network; current private-proc probe has guarded inherited fallback. | Production uses private proc and platform-owned shared networking; inherited proc is never admitted in production. | Image/native security and loopback-auth gates. |
| Status/logs | Registry can record bwrap but runtime key may be queried incorrectly; tasks are not distinguished fully. | Real service/task runtime, PID/generation/workdir, separate sanitized logs. | `ploinky`; observability acceptance. |
| Lifecycle | Service ownership is strong; outer stop relies on local stop; provider descendants need proof. | Exact service and task trees die on cancel/crash/disable/restart/Box stop. | Ploinky/Achilles native failure injection. |

## 5. Final target architecture

```text
host
└── Podman: ploinky-box (rootless, non-privileged deployment boundary)
    ├── trusted Ploinky Router/control plane
    ├── Podman: specialized non-coding services
    └── each coding AgentServer, selected independently
        ├── lite-sandbox: true
        │   └── bwrap: trusted AgentServer
        │       └── bwrap: untrusted provider task/login/models/TUI
        └── lite-sandbox: false or missing
            └── Podman: trusted AgentServer
                └── container-local bwrap: untrusted provider task/login/models/TUI
```

| Invariant | Final contract |
| --- | --- |
| Outer engine | Podman creates `ploinky-box` and every false/missing nested service; no engine socket is mounted into an AgentServer/provider. |
| Universal service selector | True selects mandatory bwrap/Seatbelt; false/missing selects mandatory Podman; agent identity and dormant container metadata do not alter dispatch. |
| Coding service | OpenCode/Codex/PI keep a container declaration and pass as trusted, generation-bound services in both selected modes. |
| Provider | All executable provider entrypoints use the canonical nested bwrap adapter. Provider-native security remains defense in depth. |
| Filesystem | Service workspace RW; provider sanitized workspace RO plus one WORKDIR RW and one private HOME RW. |
| Identity | Service gets only exact instance/generation capability; provider gets only short-lived task-scoped broker capability. |
| Runtime | Sandbox mode uses Box Node/npm; container mode uses the pinned coding image runtime. Both expose immutable exact Agent/code/dependency/provider roots in provider namespaces. |
| Network | True implies a platform-owned shared Box network for this rollout; no manifest field selects or weakens it. All sensitive loopback listeners authenticate. |
| Route | Coding root `/mcp` uses direct loopback with generation/PID pre-dial verification. Bwrap-owned additional ports are unsupported in this rollout. |
| Lifecycle | Registry and PID records identify actual runtime and exact process tree. |

## 6. Trust boundaries and threat model

| Actor/resource | Trust | Capability | Explicit non-capability |
| --- | --- | --- | --- |
| Box Router/control plane | Trusted | Runtime admission, identity minting, registry, routing, cleanup. | Must not delegate master authority to agents. |
| Coding AgentServer in either selected runtime | Trusted platform adapter | Full workspace RW, its mode-specific HOME RW, install/update provider, launch nested bwrap, own task brokers. | No Box master key, other HOME bind, engine socket/storage, or unrelated credentials. |
| Provider and descendants | Untrusted | Read user workspace, write exact project and own state, invoke scoped model broker, outbound network per rollout decision. | No control plane, other homes, engine, service credential, sibling writes, executable persistence. |
| Project content | Adversarial input | Can instruct provider and influence files inside selected project. | Must not alter policy builder, bwrap binary, provider executable, or future task bootstrap. |
| Network peer | Untrusted unless authenticated | Only authenticated Router/Soul endpoints should act on requests. | Loopback location alone is not authentication. |

Threats covered by release tests are symlink/traversal/TOCTOU escape, workspace sibling modification, control-plane disclosure, cross-agent HOME disclosure, provider executable poisoning, environment/argv/fd/log secret leakage, `/proc` inspection of the trusted server, stale PID/generation takeover, route confused deputy, cancellation escape, and engine access. Workspace confidentiality is not provided by the initial RO-workspace policy: an online provider can read and potentially exfiltrate sibling project content. Section 24 explicitly accepts that residual risk for the first rollout.

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
| `<workspace>/.data/<runtime-key>.sandbox-v2` | `/home/agent` | RW | Exact instance/alias and sandbox ABI only; create mode 0700 and verify owner. Container mode continues to use its existing `<workspace>/.data/<runtime-key>` backing. |
| Pipe-fed generation credential | `/run/ploinky-agent/credential.json` | 0400 RO data mount | Create with `--perms 0400 --ro-bind-data`; no Box-side source file or parent credential directory; never bind workspace master material. |
| New tmpfs | `/tmp`, `/run` except exact capability | RW ephemeral | No persistent control state. |
| New proc/dev | `/proc`, `/dev` | Private/minimal | Private PID namespace; no fuse/tun. |

Do not mount `.ploinky/shared` into coding AgentServers unless a verified current dependency requires it. The architecture says providers do not receive it; avoiding it at the service layer reduces accidental delegation.

### 7.3 Nested provider CLI/task bwrap

Mount order is mandatory because later mounts intentionally narrow or overlay earlier ones. In sandbox service mode the sources are the Box workspace and versioned sandbox HOME. In container service mode the same policy builder runs inside the coding container, using its existing workspace and native HOME as sources. Provider-visible policy stays equivalent, but the two service HOME backings are never cross-read.

| Order | Source | Provider target | Mode/result |
| --- | --- | --- | --- |
| 1 | Minimal system tree and exact CA/DNS files | Same | RO |
| 2 | `/opt/ploinky-node` | `/opt/ploinky-node` | RO |
| 3 | Exact provider adapter/runtime files | Exact command paths | RO |
| 4 | `/workspace` | `/workspace` | Recursive RO |
| 5 | Empty tmpfs/masks | `/workspace/.ploinky`, `/workspace/.data` | Hidden; no source content visible |
| 6 | If allowed, exact selected repo below `.ploinky/repos` | Recreated parent path and exact WORKDIR | RW; no sibling `.ploinky` content |
| 7 | Otherwise exact canonical existing WORKDIR | Same absolute path | RW overlay; descendants writable |
| 8 | Exact mode-derived HOME source | `/home/agent` | RW; sandbox source is `<workspace>/.data/<runtime-key>.sandbox-v2`, container source is the selected container's existing native HOME backing |
| 9 | Exact provider binaries/package trees inside HOME | Same logical paths | RO overlay after HOME bind |
| 10 | New tmpfs | `/tmp`, `/tmp/cache`, `/run` | Private RW ephemeral |
| 11 | New proc/minimal dev | `/proc`, `/dev` | Private process view and minimal devices |

Absent paths include `/home/podman`, `/opt/ploinky`, `.ploinky/shared`, engine sockets, fuse/tun, all other agent homes, and all Ploinky credential/registry/run/log/PID data. The selected WORKDIR may not be `.data`, `.ploinky` generally, or a protected ancestor. The sole exceptional protected subtree is an exact selected repository below `.ploinky/repos`, reconstructed without exposing its parents' content.

Every workspace, HOME, WORKDIR, and executable/package source in these tables is opened by the Box-owned `ploinky-bwrap-launch` helper and supplied to Bubblewrap with `--bind-fd` or `--ro-bind-fd`. No security-sensitive source is re-opened by pathname after validation. Phase 2 pins a Bubblewrap build that exposes `--bind-fd`, `--ro-bind-fd`, `--ro-bind-data`, and `--perms`; absence of any feature is a fatal image-contract failure.

## 8. HOME ownership, persistence, concurrency, and executable-integrity policy

| Property | Required policy |
| --- | --- |
| Identity | One physical HOME per agent instance/alias and service runtime. Container mode retains `<workspace>/.data/<sanitized effective runtime key>`; sandbox mode uses collision-safe `<workspace>/.data/<sanitized effective runtime key>.sandbox-v2`. No name-only sharing across aliases or implicit sharing across modes. |
| Logical path | The sandbox AgentServer uses `/home/agent`; the container AgentServer retains its native HOME. Every inner provider namespace maps the selected mode's exact source to `/home/agent` and sets HOME/XDG paths consistently. |
| Creation | Trusted Ploinky code creates with 0700, validates canonical containment/owner/type, rejects symlinked home roots, and records effective key/generation. |
| Persistence | Preserve across service/task restart, disable/re-enable, Box restart, and image upgrade unless the user explicitly removes data. |
| Clean-break cutover | Leave the existing container HOME at `.data/<key>`. Create the separate sandbox `.data/<key>.sandbox-v2`, mount it at `/home/agent`, and write ABI marker `ploinky-home-v2`. Do not copy state automatically, add `/root` symlinks, add cross-mode readers, rewrite tolerant records, or provide old-release write compatibility. Incompatible sandbox state fails with `PLOINKY_HOME_STATE_INCOMPATIBLE` and an archive/reset instruction; never delete either HOME automatically. |
| Continuation state | Change store defaults to `$HOME/.ploinky/...`. OpenCode/Codex records already store workspace `projectDir` plus provider IDs, not HOME paths; PI recomputes its session directory from the current HOME. No record rewrite is planned. Incompatible provider-owned state is rejected as part of the clean break. |
| Concurrency | One exclusive per-HOME lease covers provider tasks, continuation, login, install/update, model helpers that execute provider code, and interactive CLI. Queue with bounded status/owner metadata or fail with `PLOINKY_PROVIDER_HOME_BUSY`; never run two provider processes against one HOME. Distinct alias homes may run concurrently. |
| Executable integrity | Trusted service installs/updates while holding the lease. Provider launch re-binds exact fd-opened roots RO after HOME RW: OpenCode `/home/agent/.opencode`; Codex `/home/agent/.local/bin/codex` and `/home/agent/.local/lib/node_modules/@openai/codex`; PI `/home/agent/.local/bin/pi` and `/home/agent/.local/lib/node_modules/@earendil-works/pi-coding-agent`. `openat2` no-symlink resolution plus `--ro-bind-fd` pins each launch to the opened object; a path swap cannot change the mounted executable. |
| State separation | Keep auth/config/session/database paths RW. Do not make all of `.local` RO if it also contains required state; bind exact executable/package subtrees instead. |

Expected fail-closed behavior: invalid ownership, symlinked HOME, missing immutable runtime, executable identity drift, or unavailable HOME lease prevents the provider from starting and produces a sanitized error. The trusted service may run an explicit installer/update operation only while holding the same exclusive lease.

## 9. Node.js, npm, provider installation, and toolchain model

| Layer | Model |
| --- | --- |
| Box | Node 24/npm/npx remain copied to `/usr/local` by the image. The production image pins Bubblewrap by exact RPM NEVRA and proves `--bind-fd`, `--ro-bind-fd`, `--ro-bind-data`, and `--perms`; it also supplies CA certificates, Git, SSH client, curl, shell/core utilities, `script`, and namespace/process tools proven by tests. The workflow supplies an immutable full-SHA Ploinky checkout as a named BuildKit context; a separate stage compiles `ploinky/ploinky-box/native/ploinky-bwrap-launch.c`, records that source SHA in an image label, and copies only the binary. No moving branch, network fetch in the Dockerfile, compiler, or headers remain in the runtime image. Python/compiler additions for provider work require a failing representative task and are not assumed. |
| Coding container image | `assistos/ploinky-node:24-bookworm-tools` remains the declared container-mode base. Its build pins a compatible Bubblewrap and compiles/copies the same non-setuid `ploinky-bwrap-launch` protocol from the exact approved Ploinky SHA. Native image tests prove the provider launcher, private proc, required fd options, Node/npm, and provider dependencies before the digest is approved. Runtime installation of Bubblewrap is forbidden. |
| Coding service | Ploinky resolves the real Node prefix and mounts it RO at `/opt/ploinky-node`. `node`, npm's CLI JS, and npx execute from that prefix; `/usr/local` is not assumed inside the namespace. |
| Installation | `install-opencode.sh`, `install-codex.sh`, and `install-pi.sh` run only in the selected trusted service under that mode's exclusive HOME lease. Sandbox mode uses Box Node/npm or the required vendor installer and writes under `/home/agent`; container mode retains its image-native install source and HOME. Source records the exact tested provider version for each mode; no unversioned latest install is released. Installers must not apt-install bwrap at runtime. |
| Provider task | The inner provider always sees its mode-derived HOME at `/home/agent`, with executable directories re-bound RO. Sandbox mode uses `/opt/ploinky-node/bin`; container mode uses its pinned image runtime through an equivalent RO bind. Self-update attempts fail clearly and direct the user to the trusted install/update flow. |
| Verification | Until the canonical policy lands, OpenCode/PI readiness performs only the bwrap capability probe; this removes the `1fe668f` whole-workspace provider invocation. The final provider readiness mode mounts an empty tmpfs as `/workspace`, creates `/workspace/readiness` RW, mounts only exact HOME state and executable roots, and runs harmless `--version`/help there. Real user workspace content is absent. |

The related AchillesCLI commit `1fe668f` adds a guarded inherited-`/proc` fallback and provider version probes. It is preparatory, not the final Box contract: phase 1 removes the unsafe version invocation, and production Box acceptance admits only private `/proc`. Inherited `/proc` may remain for current container-only development but is never a successful production readiness state.

## 10. Environment allowlist and secret handling

### 10.1 Trusted service environment

The table is the sandbox-service environment. Container-selected services retain the established container environment construction and credential bootstrap, subject to the same secret non-delegation and provider-boundary rules; they do not receive the bwrap descriptor locator.

| Admit | Source/control |
| --- | --- |
| `HOME=/home/agent`, XDG paths, `PATH`, locale, terminal, `TMPDIR` | Sandbox-service platform constants. |
| `PLOINKY_WORKSPACE_ROOT=/workspace`, exact runtime/instance/generation principal | Ploinky registry/admission. |
| Fixed `PLOINKY_AGENT_CREDENTIAL_FILE=/run/ploinky-agent/credential.json` locator | Platform constant; descriptor bytes arrive through a parent-only pipe and are materialized by bwrap, never named on the Box filesystem. |
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

### 11.1 Current blocker and fixed scope

The bwrap service currently receives principal-only identity, but AgentServer request verification and outgoing MCP assertions require the exact instance secret/private generation capability. The coding manifests expose no agent-owned additional port. Their authenticated root `/mcp` surface is already a direct Router-to-loopback dial, so the first rollout does not generalize `RuntimeRelay`: container-owned additional routes, including Soul, keep the existing relay; a bwrap-owned additional-port request is rejected by policy.

### 11.2 Generation credential bootstrap

| Sequence | Required behavior |
| --- | --- |
| 1. Admit | Resolve exact manifest bytes, effective instance/runtime key, generation, platform network contract, Router authority, and least-privilege agent secret. Serialize a versioned descriptor with those fields, manifest/admission digest, random nonce, and expiry. It contains no master key and no bwrap PID. |
| 2. Spawn | Start `ploinky-bwrap-launch`/bwrap with a dedicated readable child FD. Parent writes the bounded descriptor bytes to that pipe and closes it. Bwrap uses `--perms 0400 --ro-bind-data <fd> /run/ploinky-agent/credential.json`; no source credential file exists on the Box filesystem and no secret appears in env or argv. |
| 3. Bootstrap | AgentServer requires the fixed locator, validates regular-file type, mode, schema, instance, generation, authority, expiry, and manifest/admission digest, reads once, closes the file, and constructs a frozen in-memory `AgentCredentialContext`. Assertion and scoped-broker factories receive that object explicitly; they do not repopulate secret environment variables. The descriptor path/content and context are never exposed to provider launchers. Any mismatch exits before listening. |
| 4. Attest | After spawn, Ploinky records bwrap PID/start identity, generation, nonce digest, and exact loopback port as an unpublished candidate. PID identity is deliberately external to the pre-spawn descriptor, avoiding a circular bootstrap dependency. |
| 5. Ready/publish | Router performs authenticated root `/mcp` readiness through a pre-dial callback that rechecks candidate PID/start identity/generation/port. Only a successful challenge publishes the route. |
| 6. Rotate/stop | Disable, restart, generation change, or expiry unpublishes first, terminates the exact process tree, invalidates the nonce/generation, and starts a fresh service. There is no in-place credential rotation and no host credential artifact to delete. |

### 11.3 Root routing and provider credentials

| Component | Fixed design |
| --- | --- |
| Root `/mcp` and manifest endpoints | Direct loopback only. Before every dial, verify the registered runtime key, effective instance, generation, PID/start identity, and exact allocated port. A stale or mismatched owner fails before socket creation. |
| Bwrap agent-owned additional ports | Unsupported in this rollout. `edgeRoutePlan` returns stable `BWRAP_AGENT_PORT_UNSUPPORTED`; it never invents a container ID or weakens container relay attestation. |
| Existing container additional ports | `RuntimeRelay/confinement` and `RuntimeRelayManager` remain unchanged. The scoped coding broker may call the existing Soul container route with service identity. |
| Provider model access | OpenCode/PI brokers and Codex managed routing replace their generated-env provenance gates with an explicit trusted `AgentCredentialContext` input from AgentServer. They fail if the context is absent or mismatched. Provider receives only a random task/generation/audience-bound token and minimum model/chat routes; broker lifetime is the provider process lifetime. No direct-provider-credential fallback is allowed. |

### 11.4 Concrete Ploinky modules

| File/module | Change |
| --- | --- |
| `cli/utils/security/agentIdentityEnv.js` | Reserve the fixed non-secret descriptor locator and validate exact generated credential serialization/provenance. |
| New `cli/sandbox/bwrap/bwrapAgentCredential.js` | Build bounded descriptor bytes, create/write/close the spawn pipe, track nonce digest/expiry, and redact errors. No disk persistence API. |
| `Agent/server/AgentServer.mjs` plus new `Agent/lib/{agentCredentialDescriptor,agentCredentialContext}.mjs` | Read and validate the bwrap-materialized 0400 descriptor before listening; expose a frozen context only to trusted assertion/broker factories; keep secret use in trusted server code and out of `process.env`. |
| `cli/server/{RoutingServer,routerHandlers,edgeRoutePlan,wsAgentRootProxy}.js`, `cli/sandbox/edgeGeneration.js`, and `cli/server/utils/agentReadiness.js` | Extend the existing direct root plan/lease/dial path with bwrap PID/start/generation/port ownership and authenticated readiness; keep websocket and HTTP ownership checks aligned. |
| `cli/server/edgeRoutePlan.js` | Preserve existing container plans and return explicit unsupported policy for a bwrap-owned additional port. |
| `cli/server/runtimeRelay/{confinement,RuntimeRelayManager}.js` | No first-rollout behavior change; regression-test that container ID/label/exec requirements remain exact. |
| Identity/root-route/agent-port tests | Pipe/descriptor EOF and size failures, no disk artifact, stale PID/start/generation/port, expiry, descriptor leakage, authenticated root round trip, explicit bwrap agent-port denial, and unchanged Soul/container relay. |

## 12. Network design for the first rollout and later hardening

| Stage | Policy | Trade-off/gate |
| --- | --- | --- |
| First rollout decision | Retain `--share-net` for coding service and provider. Strict true internally derives effective network `host`; coding manifests and profiles must omit `network`, and an attempted override is a manifest error. Runtime admission records both the declaration absence and effective platform network hash. Allocate exact loopback service ports through the registry and require authentication on every Router/Soul/control listener. | Providers can scan Box loopback and exfiltrate readable workspace data. This residual risk is accepted for the first rollout only if the mandatory loopback authentication scan passes. |
| Later hardening | Private provider network namespace with controlled egress proxy and explicit connection to task broker; optionally private service networking with Router-owned transport. | Stronger isolation, but DNS/TLS/streaming/provider compatibility and Podman Machine support require a separate design and native matrix. |

Network policy is a platform invariant, not a manifest property. Add `deriveHostSandboxNetworkContract()` (name may follow local conventions) in `cli/sandbox/networkContract.js`; call it from bwrap/seatbelt profile resolution and runtime admission before `assertHostSandboxNetworkCompatibility()`. For strict true with no declared network, it returns immutable effective `{mode:'host', source:'platform-lite-sandbox'}`. Explicit coding manifest/profile network, `none`, `default` passed through without derivation, or `bridge` is rejected. Container resolution remains byte-for-byte unchanged. Tests must prove admission/preflight/router endpoint hashes use the effective contract and that unauthenticated access to Router, other AgentServers, Soul management routes, nested Podman APIs, and metadata endpoints fails.

## 13. Runtime-selection semantics for `lite-sandbox`

| Context | `lite-sandbox: true` | Missing/false |
| --- | --- | --- |
| Inside `ploinky-box` | Select Linux bwrap after capability/admission check; any missing binary, namespace/proc failure, or policy build failure is a named fatal error. Never try Podman. | Select Box Podman as today. |
| Linux outside Box | Select bwrap and fail closed if unavailable. An explicit host-sandbox disable plus true is `PLOINKY_SANDBOX_POLICY_CONFLICT`, not a fallback. | Container runtime. |
| macOS outside Box | Select seatbelt and fail closed if unavailable. An explicit host-sandbox disable plus true is the same policy conflict. The native migration release gate remains Linux Box. | Container runtime. |
| Any unsupported platform | Stable unsupported-sandbox error; never create a container for true. | Container runtime. |

In Box, the marker no longer means “disable all host sandboxing.” It means “hybrid appliance”: Podman is mandatory for false/missing manifests and bwrap is mandatory for true manifests. The rule is independent of agent name. A `container` declaration is valid alongside true: sandbox dispatch treats it as dormant and must not inspect, pull, start, or otherwise require it; changing the selector to false/missing activates and requires that declaration. `ploinky sandbox status` reports Box hybrid capability, bwrap probe result/version, Podman availability, and each agent's selected runtime. `setHostSandboxDisabled(false)` is no longer the path that enables coding bwrap; selection is manifest-driven. Any legacy `runtime` string remains rejected rather than becoming a back door.

## 14. Migration of existing non-coding `lite-sandbox` manifests

This compatibility classification must merge before strict selection is deployed.

The verified source baseline contains 56 manifests, 16 production true selectors, and one Ploinky true fixture. The initial compatibility audit removes true from the thirteen inspected production agents that depend on specialized images or have not proved the sandbox contract. This is an intentional breaking policy change outside the Box when host sandboxing was explicitly enabled, not an assumption that every current flag is inert. CI validates capabilities and manifest shape; it must not encode an exact list or count of names allowed to use true.

| Repository | Files | Required migration and proof |
| --- | --- | --- |
| `AchillesCLI` | `GPTResearcher/manifest.json` | Remove true; retain `assistos/bwrap-runner:node24-python-bookworm` image/startup. Test that nested Podman and its image-specific Python/browser tooling still work. |
| `AssistOSExplorer` | `dpuAgent`, `explorer`, `gitAgent`, `multimedia`, `soplangAgent`, `tasksAgent`, `webAssist` `manifest.json` | Remove all seven. Preserve volumes, images, dependency/no-wait edges, and Explorer's managed-repositories behavior. Start the Explorer graph and assert these registry entries are containers. |
| `UmamiAgent` | `umamiAgent/manifest.json` | Remove true; prove PostgreSQL/Umami/MCP image startup, generated DB secrets, persistence, and routing. |
| `copilot-agents` | `browserUseAgent`, `copilotProviderRelay`, `research-agents`, `webSearchAgent` `manifest.json` | Remove all four; update unit assertions and prove browser/provider relay image topology. |
| `ploinky` test fixtures | `tests/testAgent/manifest.json`, dynamic fixtures in `tests/doPrepare.sh` and `workspace_dependency_startup_tests.sh` | Split explicit bwrap and container fixtures. Do not let one fixture accidentally change meaning. |

Keep true initially on `AchillesCLI/opencodeAgent/manifest.json`, `codexAgent/manifest.json`, and `piAgent/manifest.json`, keep their valid `container` declarations, and keep `startup: "manual"`. This is the first validated set, not a permanent allowlist. A future agent may use true only after it satisfies the same sandbox capability and security gates; a false/missing agent must have a valid Podman declaration.

Managed shadows are reconciled only after the primary feature branches merge: run the normal Ploinky managed-repo refresh pinned to exact `ploinky-bwrap` commits, verify origin/branch/HEAD, compare all relevant manifests, and reject rollout if any managed selector or container declaration differs from its approved primary source.

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

Acceptance covers all three providers, manual cold start, repeated warm start, continuation, cancellation, login, model listing, and policy error rendering in both selected modes. In true mode `podman ps`, engine events, and image pulls gain no coding-agent artifact. In false/missing mode the exact declared coding container runs and no outer coding bwrap service is created.

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

### 17.1 Public syntax

The clean-break CLI contract is:

```text
ploinky cli <agent> --workdir <workspace-relative-or-/workspace-absolute-path> -- <provider-args>
```

Ploinky consumes exactly one `--workdir` only before the separator; arguments after `--` are byte-for-byte provider arguments. `--workdir` is required for coding-agent interactive CLI. Omission fails with `PLOINKY_WORKDIR_REQUIRED`; exact `/workspace` fails with `PLOINKY_WORKDIR_ROOT_FORBIDDEN`. Browser launchers must likewise supply an existing non-root `projectDir`. There is no cwd inference, root default, host-path substitution, or legacy syntax.

### 17.2 Validation algorithm

| Step | Required check/failure |
| --- | --- |
| Parse | Reject empty/NUL, repeated selector, unknown selector form, explicit `..` segments, and provider-option ambiguity. |
| Native helper | `ploinky-bwrap-launch` is a non-setuid Box-owned executable built from `ploinky/ploinky-box/native/ploinky-bwrap-launch.c`. It receives a bounded, versioned, non-secret launch description over a dedicated FD; untrusted task text and provider arguments never become helper options. Unknown fields, duplicate mounts, unsupported destinations, and oversized input fail before opening anything. |
| Root | Helper opens `/workspace` once with `O_PATH\|O_DIRECTORY\|O_NOFOLLOW`, verifies directory/device/expected Box ownership, and retains the fd until `execve(bwrap)`. |
| Resolve | Require an existing non-root relative path. From the retained root fd, call Linux `openat2` with `O_PATH\|O_DIRECTORY` and `RESOLVE_BENEATH\|RESOLVE_NO_MAGICLINKS\|RESOLVE_NO_SYMLINKS`; no `lstat`/`realpath` fallback exists. `ENOSYS`, unsupported resolve flags, or inability to retain fds is `PLOINKY_PATHFD_UNAVAILABLE`. |
| Containment | Reject `.data`, `.ploinky`, and protected/masked ancestors before the syscall. The only exception is `.ploinky/repos/<repo>/...`, which requires a nonempty exact repo component and is opened by the same no-symlink beneath-root call. Exact root is always rejected. |
| Source pinning | Helper retains workspace-root, WORKDIR, HOME, and provider executable/package fds. It emits `--ro-bind-fd` for workspace/executables and `--bind-fd` for exact WORKDIR/HOME. Bwrap therefore never reopens a security-sensitive source pathname. |
| Mount | Bind the root fd RO at `/workspace`, apply masks, create the lexical destination parents, bind the retained exact WORKDIR fd RW at its same `/workspace/...` destination, and `--chdir` there. For the managed-repo exception, reconstruct only the selected destination beneath an otherwise empty `.ploinky/repos`. |
| Lifetime | Do not change workdir for a running provider; a continuation validates its stored project identity again. |

All path failures happen before HOME lease acquisition, broker creation, or provider spawn. Native tests coordinate rename/symlink/mount swaps after `openat2` but before bwrap exec and prove the mounted source remains the retained inode or the launch fails; there is no timing-based “revalidate immediately” claim. Tests also include lexical traversal, absolute escape, symlink in every component, file/missing target, protected paths, Unicode/space paths, exact root rejection, valid managed-repo target, malformed helper protocol, leaked-fd inventory, and a bwrap build missing fd-bind support.

## 18. Lifecycle, readiness, cancellation, recovery, status, and logging

| Event | Required behavior |
| --- | --- |
| Service start | Admit exact manifest/generation and selector. For true, verify sandbox capability, prepare sandbox mounts/HOME/credential, and spawn bwrap/Seatbelt. For false/missing, verify Podman plus the declared image and use the existing container start/credential/volume path. Record the selected runtime identity and complete authenticated MCP readiness before publishing the route. |
| Task start | Validate workdir; acquire HOME lease; mint scoped broker; spawn nested bwrap with `--die-with-parent`; record task PID/start identity, provider, workdir, service generation, log path, and broker owner. |
| Readiness | Service readiness uses authenticated root `/mcp`. Provider readiness uses the private empty tmpfs workspace mode from section 9 and tests private proc, Node/npm, immutable provider executable, and harmless provider startup. Immediate survival or a provider run against real `/workspace` is insufficient. |
| Cancel | TaskQueue cancellation reaches adapter; adapter TERM then KILLs exact provider process group, closes broker, releases lease, and records `cancelled`. No descendant remains. |
| Crash | Parent death plus `--die-with-parent` kills provider; startup recovery validates PID/start identity and cleans only matching orphans. Stale/reused PID is never signalled. |
| Disable/re-enable | Unpublish route, invalidate generation/nonce, cancel all tasks, stop the exact selected service, and remove its runtime-specific owner records. No sandbox host credential file exists. Preserve the mode-specific HOME, then start a new generation only on explicit use. |
| Restart | Drain/cancel old generation, rotate identity, verify no old route/task, then publish new authenticated readiness. |
| Box stop | `ploinky-local stop` stops provider tasks, sandbox services, then nested containers before the outer Podman stop. Supervisor verifies no owned bwrap or nested-container record/process remains. Timeout reports exact survivors and still lets outer stop contain them. |
| Destroy | Removing the outer container terminates all namespaces; retained workspace/HOME volumes remain unless explicitly deleted. On next start, stale records are rejected by start identity/generation. |

Status must label the actual service runtime (`bwrap`, `seatbelt`, or `container`), role (`service` or `provider-task`), effective instance/alias, generation, running/stopped/failed, runtime ownership identity, validated workdir, mode-specific HOME key (not secret path content), readiness, and sanitized log path. Fix the runtime-key mismatch in `agentRuntimeState.js`. Logs separate each service backend from `tasks/<task-id>-provider.log`, redact broker/identity canaries, never dump env/argv, and retain the existing task result/status contract. `ploinky logs` and Box status must not report a sandbox process as a container or hide the exact selected coding container.

## 19. Exact repository and file-level change map

### 19.1 `ploinky`

| Files/modules | Current responsibility | Add/remove/change | Tests |
| --- | --- | --- | --- |
| `cli/utils/runtime/sandboxRuntime.js`, `cli/sandbox/docker/common.js` | Box marker and backend selection. | Reuse the strict marker validator; hybrid Box state; universal true→platform sandbox and false/missing→Podman; permit dormant container metadata with true; no cross-runtime fallback; actionable capability codes. | `sandboxRuntime.test.mjs`, `enableAgentStartup.test.mjs`. |
| `cli/sandbox/networkContract.js`, `cli/utils/runtime/profileService.js`, `cli/sandbox/runtimeCapabilities.js`, bwrap/seatbelt profile callers | Declared network canonicalization, effective profile, admission hashes; bwrap currently requires explicit host. | Derive immutable platform host networking from strict true when `network` is absent, reject coding overrides, record effective hash, and leave container profiles unchanged. | Network contract/profile/admission/router endpoint matrix, including the three unchanged manifests. |
| `cli/sandbox/bwrap/bwrapServiceManager.js` | Generic mounts/env/start/interactive. | Add explicit trusted coding service profile selected internally by true; `/home/agent`; workspace RW; no Podman/shared/control mounts; pipe-fed descriptor; invoke fd launcher; honor workdir; correct readiness/config record. | `bwrapArgs.test.mjs`, `agentEnvInjection.test.mjs`, `startupReadiness.test.mjs`. |
| `cli/sandbox/bwrap/bwrapFleet.js`, `bwrapHealthProbes.js`, `cli/sandbox/agentRuntimeState.js` | PID ownership, probes, backend-neutral status. | Track service/task ownership and start identity; private-proc capability; fix runtime-key lookup; exact descendant cleanup/status. | `sandboxProcessOwnership.test.mjs`, `agentRuntimeState.test.mjs`. |
| New `ploinky-box/native/ploinky-bwrap-launch.c`; new `Agent/lib/providerSandbox.mjs` | No syscall-backed fd source pinning or canonical cross-provider policy exists. | Native bounded protocol, `openat2` beneath/no-symlink opens, retained-fd bwrap exec, capability/version output; JS policy owns allowed destinations, mount order, env, HOME lease hooks, and provider modes. | Native helper unit/race tests plus `providerSandbox.test.mjs`; Achilles integration consumes the public JS API. |
| `cli/utils/workspaceStructure.js`, `cli/utils/config.js` | `.data` home and workspace paths. | Immediate sandbox-mode `/home/agent` ABI marker, 0700/canonical ownership validation, incompatible-state error, and no `/root` shim; preserve container-mode HOME resolution and keep the two ABI states distinct. | New/updated workspace structure, mode separation, and clean-cutover tests. |
| `cli/utils/security/agentIdentityEnv.js`, new `cli/sandbox/bwrap/bwrapAgentCredential.js`, `Agent/lib/{agentCredentialDescriptor,agentCredentialContext}.mjs`, `Agent/server/AgentServer.mjs` | Two-phase identity and server auth. | Pipe-fed generation descriptor, bootstrap validation, frozen trusted context for assertions/brokers, nonce/expiry lifecycle; no Box-side disk artifact, secret env reconstruction, master key, or provider propagation. | `agentEnvInjection`, generated-local/session/auth, context provenance, pipe failure, and canary leakage tests. |
| `cli/server/{RoutingServer,routerHandlers,edgeRoutePlan,wsAgentRootProxy}.js`, `cli/sandbox/edgeGeneration.js`, `cli/server/runtimeRelay/*`, `cli/server/utils/agentReadiness.js` | Direct HTTP/websocket root proxy plus generation leases and container-only additional-port relay/readiness. | Add bwrap root plan/lease/PID-start-generation-port pre-dial verification and authenticated readiness; reject bwrap additional ports; leave container relay behavior unchanged. | Root HTTP/websocket ownership/readiness, `edgeRoutePlanInterface`, `agentPortTransport`, and `relayRequestAuth` regression. |
| `cli/commands/workspaceUtil.js`, `cli/commands/cli.js` | CLI enable/readiness/attach. | Parse workdir boundary, preserve manual explicit start, dispatch interactive adapter, task/service logs/status. | CLI unit/integration tests. |
| `ploinky-box/command/{parse,route,execute}.mjs`, `bin/ploinky-box.mjs` | Outer argument routing and fixed `/workspace` exec. | Consume/transport exact workdir selection, preserve provider separator/PTY, no raw host-path inference. | `ploinkyBoxArguments`, `ploinkyBoxCli`, native CLI tests. |
| `ploinky-box/contract/{image,container}.mjs`, `entrypoint/*`, `supervisor.mjs`, `smoke/graph.mjs` | Image ABI, Box boot, stop, smoke graph. | Require/probe bwrap without privilege; hybrid status; verify bwrap cleanup before stop. Keep exact four outer mounts. | Box image/entrypoint/supervisor/smoke/native tests. |
| `tests/testAgent/manifest.json`, `tests/doPrepare.sh`, `tests/test-functions/workspace_dependency_startup_tests.sh` | Runtime fixtures. | Split strict bwrap versus Podman fixtures and expected registry runtime. | Existing shell/unit suites. |

### 19.2 `container-image-builds`

| Files/modules | Current responsibility | Change | Tests/gate |
| --- | --- | --- | --- |
| `images/ploinky-box/Dockerfile` | Pinned Podman base (`quay.io/podman/stable` digest, Podman 5.8.2); Node 24 + npm/npx copied to `/usr/local`; cloudflared; the runtime package set does not provide the complete coding toolchain. | Pin Bubblewrap by exact RPM NEVRA in an image argument and fail the build if the installed NEVRA or required `--bind-fd`, `--ro-bind-fd`, `--ro-bind-data`, and `--perms` options differ. Remove `PLOINKY_DISABLE_HOST_SANDBOX=1`. Copy the C source only from the workflow-supplied `ploinky-src` named context; compile in a separate stage; copy only the stripped, non-setuid helper to `/usr/local/libexec/ploinky-bwrap-launch`; label the image with the full source SHA; leave no compiler or headers in the runtime stage. Pin the required runtime package set only after a source-level provider dependency inventory and native probe; at minimum verify `bash`, CA certificates, `curl`, `ffmpeg`, `git`, OpenSSH client, and `python3`, while provider compilation tools remain absent unless an exact provider/version requires them. Retain the non-privileged Box user and current Node ABI. | `tests/image-definitions.test.mjs` asserts the exact package/helper/source-label/env contract; image build runs helper ABI and Bubblewrap feature probes. |
| `images/ploinky-node/Dockerfile` and its publish workflow | Current coding container base includes Bubblewrap and Node tooling but does not carry the canonical fd-safe launcher/provenance contract. | Pin Bubblewrap to an exact supported Debian package/version, consume the same immutable full-SHA `ploinky-src` named context, compile in a separate stage, copy the stripped non-setuid helper, label the source SHA, and keep the existing non-root runtime user and coding toolchain. Publish immutable per-architecture/index digests and update the three coding manifests to the approved image reference if repository policy requires digest pinning. | Image-definition tests plus native helper, private-proc, fd-bind, Node/npm, and representative provider-readiness tests inside the coding image on amd64/arm64. |
| `.github/workflows/publish-ploinky-box-image.yml` | Native digest build/merge without behavioral gates. | Check out an explicitly supplied, full 40-hex approved Ploinky commit as `ploinky-src`; reject a branch/tag/dirty source; pass it as a BuildKit named context; build the helper/image per architecture; verify the image label and binary ABI match that commit; before manifest merge run native helper, Bubblewrap, empty-workspace provider-readiness, and dependency probes; upload diagnostics and promote only after amd64 and arm64 pass. | Workflow structural assertions plus live amd64/arm64 and Podman Machine runs; archived provenance contains source commit and image digests. |
| New `tests/native/ploinky-box-bwrap.mjs` plus helper protocol/race fixture | No Box-native bwrap test. | Prove helper protocol bounds, `openat2` fail-closed behavior, retained-fd source identity across rename/symlink/mount swaps, descriptor `--ro-bind-data`, nested user/mount/PID/IPC/UTS, private proc, effective RO/RW writes, clearenv, fixed Node/npm/provider versions, signals, and absence of privilege/engine access. | Mandatory on Linux amd64/arm64 and the Podman Machine lane; macOS seatbelt results never substitute for these gates. |

### 19.3 `AchillesCLI`

| Files/modules | Current responsibility | Change | Tests |
| --- | --- | --- | --- |
| `opencodeAgent`, `codexAgent`, `piAgent` `manifest.json` | The baseline manual coding services declare `assistos/ploinky-node`; candidate `94fa900` removed those declarations and retained direct CLI entries. | Restore the approved container declaration for false/missing mode while keeping manual/true; replace raw CLI with interactive adapters; add uniform readiness including Codex; make logical HOME runtime-context-aware. | Candidate-regression, install/manifest/provider-policy tests, including true-plus-container acceptance and selector-only toggling. |
| `GPTResearcher/manifest.json` | Specialized Python/browser bwrap-runner container. | Remove true only; retain image/start semantics. | GPTResearcher/container smoke. |
| OpenCode/PI `scripts/task-sandbox.mjs`, `check-task-sandbox.mjs`, `ensure-bubblewrap.sh` | Duplicated nested policy/probe; commit `1fe668f` executes the provider version check with the real workspace root writable through `task-sandbox.mjs`. | First remove provider execution from the real-workspace readiness check, leaving a capability-only probe. Then convert the scripts to thin adapters around `/Agent/lib/providerSandbox.mjs`; the final harmless provider startup check runs only in the private empty tmpfs workspace mode, and production requires private proc. Remove directory creation and direct-policy drift. | `tests/taskSandbox.test.mjs` plus a regression asserting the real workspace is absent during readiness. |
| OpenCode/PI `scoped-soul-broker.mjs`; Codex managed-routing factory | Generated environment provenance gates broker creation today. | Accept only the frozen trusted credential context from AgentServer, mint a task-scoped broker capability, and pass only its short-lived URL/token into the provider. Delete generated-secret-env reads from these paths and fail closed without context; never fall back to direct credentials. | Scoped-broker/context-provenance, missing/partial/mismatched-context, provider-env, and managed-routing tests. |
| OpenCode `opencode-runner.mjs`, `execute-task.mjs`, `continue-task.mjs`, model/control/login files | Task/session and several direct provider spawns. | Route task, resume, session recovery, models, control/login provider execution through canonical policy and exclusive HOME lease; preserve scoped broker. | OpenCode API/auth/install/cancel tests. |
| PI `execute-task.mjs`, `continue-task.mjs`, `pi-model-runtime.mjs`, model/login/session files | Nested tasks but trusted in-process/direct login/model code. | Classify pure trusted operations; sandbox every provider-code/network execution; preserve scoped broker and sessions. | PI execute/install/login/concurrency tests. |
| Codex `codex-runner.mjs`, `execute-task.mjs`, `continue-task.mjs`, model/login/session files | Direct Codex spawn with native sandbox and reusable credential. | Add nested Ploinky policy, strict path validation, scoped Soul broker, clearenv, cancellation parity; retain Codex native flags as defense in depth. | Codex bwrap/path/leakage/cancel/continue tests. |
| All three `install-*.sh`, stores, readiness scripts | Provider install and `/root` defaults; continuation records differ: OpenCode/Codex persist project identity plus session/thread ID, while PI additionally persists `sessionDir` and its reader derives defaults from the environment. | Derive provider HOME from the selected service runtime. In sandbox mode install exact versions under `/home/agent` with Box Node/npm and no `/root` default or shim. In container mode retain the image's native HOME/install contract. Update stores without rewriting old records, serialize trusted update with the HOME lease, keep mode-specific state distinct, and enforce immutable executable/package roots in both modes. | Existing install/store tests plus sandbox-ABI persistence, container-mode regression, cross-mode isolation, incompatible-state, and snapshot recovery tests. |
| New all-three `scripts/interactive-cli.mjs` (or one shared source copied at package time) | No narrow interactive wrapper. | Same provider policy, workdir, PTY/signal, HOME/broker/executable rules. | Native TTY and non-TTY matrix. |
| `achilles-cli/src/lib/copilotCodingAgentRouting.mjs`, three launch skills, `webchatBackgroundTasks.mjs` | Browser selection/start/status. | Preserve selection; surface structured policy errors; verify same policy for all targets. | Router/launcher/background task tests. |

### 19.4 Manifest-cleanup repositories

| Repository/files | Change | Tests/completion |
| --- | --- | --- |
| `AssistOSExplorer/{dpuAgent,explorer,gitAgent,multimedia,soplangAgent,tasksAgent,webAssist}/manifest.json` | Remove true after capability classification; no other semantic change. | These paths are container-selected for this rollout; full Explorer graph, volumes, no-wait edges, and routes remain unchanged. |
| `copilot-agents/{browserUseAgent,copilotProviderRelay,research-agents,webSearchAgent}/manifest.json` | Remove true. | Update `browser-use-provider`, GPTResearcher/OpenCode/PI/provider manifest assertions; browser delegation topology works. |
| `UmamiAgent/umamiAgent/manifest.json` | Remove true. | Stateful stack/image/persistence/routing smoke. |

## 20. Ordered implementation phases and cross-repository dependencies

Every phase uses `ploinky-bwrap`, created from `ploinky-proxy`, in every affected repository. A phase is complete only after its named tests pass and related source changes are committed/pushed without unrelated work. No implementation commit may land on `ploinky-proxy`, and no branch may be force-rewritten.

| Phase | Repository/files | Concrete work | Dependency/migration | Failure behavior and completion criterion |
| --- | --- | --- | --- | --- |
| 0. Contract, branch, and inventory freeze | All definite repos; repository branch policies; sections 14 and 24 | Verify every checkout/upstream is `ploinky-bwrap` based on the preserved `ploinky-proxy` baseline; update branch-specific source/CI/deployment gates; record the 16-production-manifest/one-fixture selector inventory and capability classification; define named error codes and telemetry; inventory every provider executable entrypoint. | None. | Exact branch and baseline evidence is archived, `ploinky-proxy` contains no feature change, section 24 has no open architecture decision, and scope/breaking behavior are reviewable. |
| 1. Baseline safety and selector classification | AchillesCLI readiness scripts and GPTResearcher manifest; seven Explorer manifests; four copilot manifests; Umami manifest; Ploinky fixtures | Remove the unsafe real-workspace provider version execution from OpenCode/PI readiness, leaving capability-only checks. Remove thirteen currently incompatible production flags, split fixtures, preserve container declarations and unrelated manifest semantics, and add capability-oriented validation. | Must precede strict selector deployment. | Readiness cannot see the real workspace. CI accepts any agent satisfying the universal true contract, rejects incompatible true declarations, requires a usable container declaration for false/missing launches, and specialized-agent container smokes pass. |
| 2. Sandbox capability and fd launcher in both service images | `container-image-builds` Box and `ploinky-node` Dockerfiles/workflows/native tests; Ploinky helper source/protocol and image/entrypoint contract | Pin compatible Bubblewrap features and provider runtime dependencies in both images; build the same non-setuid helper from an immutable full-SHA Ploinky named context in separate stages; record/verify source provenance; prove `openat2`, fd binds/data, private proc, namespaces, effective mounts, and signals on amd64/arm64, including Podman Machine for the Box and the coding-container nesting path. | Phase 1 may run in parallel; the helper-source commit and both approved image digests are required by phase 3. | Promotion stops on source/provenance, capability, helper ABI, dependency, or privilege drift; no moving source reference or extra outer mount/device/capability is allowed. |
| 3. Strict universal runtime and network selection | Ploinky selector, `networkContract`, profile/admission, status, fixtures; three Achilles coding manifests | Remove all three host-sandbox forcing mechanisms; retain coding `container` declarations; make true mean bwrap on Linux Box/Linux host and Seatbelt on macOS; make false/missing mean Podman; derive immutable effective host networking when sandbox-selected coding manifests omit `network`; permit true-plus-container while ignoring it for sandbox launch; reject disable/network conflicts; prohibit cross-runtime fallback. | Phases 1 and 2 merged; this branch state is not released until phases 4–10 pass. | The full platform/selector/network matrix passes for arbitrary agent names. Backend/admission/start failure is fatal within the selected mode. True causes zero container/image/engine activity; false/missing requires and launches the declared coding container with zero outer bwrap-service activity. |
| 4. Trusted sandbox service policy and mode-separated HOME ABI | Ploinky bwrap manager/fleet/workspace structure/helper/provider library plus container regression fixtures | Add sandbox coding-service mounts, direct `/home/agent` state, immutable runtime roots, exclusive HOME lease, service/task ownership, canonical policy primitives, and fd-pinned sources. Refuse pre-cutover sandbox HOME ABI instead of migrating it. Preserve container service HOME/volumes/lifecycle and prevent state mixing. | Phase 3. | Invalid sandbox HOME marker, path fd, mount, runtime, or lease fails before route publication; a dummy trusted AgentServer starts in both selected modes with truthful status and isolated state. |
| 5. Pipe identity, credential context, and root MCP route | Ploinky generation descriptor; AgentServer bootstrap/assertion context; root Router owner/readiness path; edge plan | Implement the pipe-fed `--ro-bind-data` descriptor, frozen in-memory credential context, and external unpublished owner record; validate bootstrap before listen; convert trusted assertion factories to explicit context inputs; perform authenticated root `/mcp` readiness with pre-dial PID/start/generation/port ownership; publish only afterward. Reject bwrap additional-port routes with `BWRAP_AGENT_PORT_UNSUPPORTED`; leave container RuntimeRelay unchanged. | Phase 4; hard blocker for every provider/browser integration. | No context or authenticated readiness means no route/broker. Secret never appears in a Box-side file, env, or argv. Stale/mismatched owner fails before dial; root MCP round trip, context provenance, and additional-port denial pass. |
| 6. Shared provider policy and safe readiness | Ploinky `providerSandbox`; Achilles OpenCode/PI adapters/tests | Build one runtime-context-aware provider policy: workspace RO plus masks and exact non-root WORKDIR RW, mode-derived HOME/executable overlays, clearenv, private proc, exclusive HOME lease, scoped broker, and harmless provider startup in an empty tmpfs workspace. | Phases 2, 4, and 5. | Any path/capability/credential drift prevents spawn; readiness has no real-workspace mount; adversarial OpenCode/PI suites pass inside bwrap-selected and Podman-selected AgentServers. |
| 7. Codex and all residual provider entrypoints | Achilles all provider runners, task/continue, model/login/control, installers, stores, readiness, and interactive adapters | Introduce the complete Codex provider boundary and scoped broker; keep Codex native sandbox flags; route every provider-code/network execution through a named policy mode; use `/home/agent` only in sandbox service mode and the native container HOME in container mode; provide no compatibility reader across layouts. | Phases 5–6. | Static and dynamic enumeration rejects unapproved direct provider spawn/import. All three task, continuation, login, model, update, and recovery paths pass in both selected runtimes with scoped credentials. |
| 8. Browser and interactive integration | Achilles launch/background modules; Ploinky Box/CLI parser/attach; three manifests | Ship the required `--workdir … --` syntax, exact-root rejection, fd-pinned workdir, PTY/signals, manual cold start, structured errors, selected-runtime attachment, and the same nested provider policy. | Phase 7. | Valid existing subfolders work; invalid/root paths fail before HOME/broker/provider work; TTY/non-TTY and browser matrices pass in both modes; runtime presence/absence evidence matches the selector. |
| 9. Lifecycle and observability | Ploinky fleet/status/logs/supervisor; Achilles TaskQueue adapters | Exact service/task registry, generation rotation by stop/restart, cancellation/crash/restart/disable/Box-stop cleanup, and sanitized logs/status. | Phases 5–8. | Failure injection leaves no owned process, descriptor, broker, or route and never signals an unrelated PID; status/log assertions pass. |
| 10. Native/E2E cutover and recovery drill | Ploinky native suites, image workflow, all runtime repos | Snapshot pre-cutover sandbox HOME state; refresh managed checkouts from exact approved `ploinky-bwrap` commits; run the hybrid graph and every coding flow in both selector modes; canary; exercise release rollback by stopping/unpublishing the new generation and restoring the pre-cutover snapshot with the previous release. | All earlier phases. | Section 25 is green, exact new-branch commits/digests/snapshot IDs are archived, no stale managed manifest remains, and sandbox/container HOME layouts are never cross-mounted. |
| 11. Later hardening | Ploinky/image/Achilles as separately approved | Private controlled egress and provider-specific toolchain minimization. Keep the initial exclusive HOME lease unless a separate design proves safe concurrency. | Production evidence; not an initial migration gate. | Separate architecture/security review and rollout. |

## 21. Unit, integration, native Box, and end-to-end test plan

### 21.1 Unit and contract tests

| Suite | Required assertions |
| --- | --- |
| `ploinky/tests/unit/sandboxRuntime.test.mjs` and network/profile suites | Full Box/Linux/macOS matrix for arbitrary agent names; true strictly selects bwrap/Seatbelt, false/missing selects Podman, true-plus-container is valid and dormant, false/missing requires usable container configuration, implicit sandbox-coding host-network derivation and explicit override rejection, admission-hash stability, and no cross-runtime fallback after probe/admission/start failure. |
| `bwrapArgs.test.mjs`, helper tests, new `providerSandbox.test.mjs` | Exact effective mount writability, protected masks, direct `/home/agent`, Node/provider roots RO, no engine/shared/control mounts, clearenv/private proc, bounded helper protocol, required `openat2` flags, retained-fd source identity, and fail-closed unsupported syscall/feature behavior. |
| `agentEnvInjection.test.mjs` and identity tests | Reserved injection rejected; versioned generation descriptor crosses only the dedicated pipe and fixed read-only mount; bootstrap validation; no secret in disk/env/argv/provider fds/logs; nonce/expiry/generation rotation. |
| `sandboxProcessOwnership.test.mjs`, `agentRuntimeState.test.mjs` | Runtime-key consistency, PID reuse, generation mismatch, service/task roles, TERM/KILL exactness. |
| Root-route/relay/readiness suites | Container RuntimeRelay behavior unchanged; bwrap root owner exact; stale PID/start/generation/port rejected before dial; authenticated MCP readiness; bwrap additional-port route rejected; provider readiness gets only empty tmpfs workspace. |
| Box parser/CLI suites | Workdir syntax/separator, no provider leakage, fixed mappings, TTY/non-TTY and signal behavior. |
| Achilles `tests/taskSandbox.test.mjs` and new Codex parity tests | Valid/malformed paths, siblings RO, selected RW, masks inaccessible, HOME only, immutable binaries, private proc, clearenv, no fallback. |
| Provider install/execute/control suites | Exact Node/npm/provider sources, clean `/home/agent` ABI and incompatible old-state failure, exclusive lease, scoped broker, cancel/continue/login/models/update, continuation-store defaults, and direct-provider invocation allowlist. |
| Manifest repository tests | Capability-based true validation with no name/count allowlist; coding manifests retain container declarations; currently incompatible specialized agents are false/missing and keep exact container expectations. |

### 21.2 Integration and native Box tests

| Layer | Scenario |
| --- | --- |
| Ploinky process integration | Run the same dummy AgentServer with true and false/missing. In sandbox mode test pipe descriptor, authenticated root MCP, additional-port denial, CLI attach, task spawn/status/cancel, generation rotation, and bwrap registry identity. In container mode assert existing credential/RuntimeRelay/lifecycle behavior and exact container registry identity. |
| Production Box contract | Build exact image; run non-privileged rootless Podman with exact four mounts/devices/security options; nested bwrap unshares user/mount/PID/IPC/UTS and private proc on amd64/arm64/Podman Machine. |
| Hybrid graph | Start Explorer dependency graph; confirm specialized/non-target agents are nested Podman and coding agents absent until explicit use. |
| Coding E2E | Browser and CLI for OpenCode, Codex, and PI in true mode and false/missing mode, including paths with spaces; create/modify selected file, read sibling, fail sibling write, continue, login/model operation, and cancel. Toggle only the selector between mode runs. |
| Runtime evidence | For true, snapshot `podman ps --all`, engine events, image pulls, bwrap registry, and logs and prove no coding container activity. For false/missing, prove the exact declared coding container starts and no outer coding bwrap service exists. |
| Persistence | Restart provider/service/Box in each mode and verify exact alias sessions/auth remain in that mode; a second alias cannot read them; concurrent same-HOME operations serialize; state from one mode is not silently consumed by the other. |
| Recovery | Capture a pre-cutover HOME snapshot, exercise the new ABI, stop and unpublish the new release, restore the snapshot, deploy prior Ploinky/image/source, refresh managed repos back, and prove the old containers resume. Post-cutover HOME state is never reused by the old release. |

## 22. Security tests and failure injection

| Attack/failure | Injection | Pass condition |
| --- | --- | --- |
| Traversal/symlink/source race | `..`, absolute escape, symlink chain, rename/symlink/mount swap after `openat2` and before bwrap exec, managed-repo parent escape, unavailable syscall/resolve flag/fd-bind option. | The retained inode is mounted or launch fails; bwrap never reopens the path; no provider/broker/HOME mutation; named policy error. |
| Workspace policy | Attempt selected write, sibling read/write, exact-root selection, protected path read, `.data` enumeration. | Selected write succeeds; siblings are readable but not writable; exact root and protected/other-home reads fail. This is an integrity boundary, not a sibling-confidentiality claim. |
| Executable poisoning | Provider writes/replaces/symlinks its executable/package; race trusted update. | Provider namespace cannot persist replacement; identity drift aborts; trusted update requires exclusive lease. |
| Proc isolation | Read `/proc`, enumerate PIDs, open AgentServer environ/cmdline/fd/root. | Provider sees only inner namespace and cannot inspect outer AgentServer. |
| Secret leakage | Canary master/service/other-provider values in parent env/files/fds; induce spawn/readiness/provider errors. | Canary absent from provider env/argv/mountinfo/fds/stdout/stderr/service/task logs/status. |
| Credential/root-route confused deputy | Reuse old descriptor/token, mutate PID/start/generation/port/owner, replay request, cancel during bootstrap/readiness, request a bwrap additional port. | Bootstrap or route refuses before listen/dial as applicable; root MCP alone is published; exact error and audit event. |
| Engine access | Probe sockets, `/home/podman/.local/share/containers`, `podman`, `/dev/fuse`, `/dev/net/tun`; attempt nested container. | Storage/socket/devices absent; no engine control even if a client binary exists. |
| Missing sandbox capability | Remove/non-executable/wrong Bubblewrap/helper, omit required fd/data options, reject `openat2` flags, disable userns, fail private proc, or change a binary after probe while true is selected. | Clear fatal sandbox-capability error; zero coding containers/direct provider processes and no path-based or Podman fallback. |
| Missing container capability | Remove/disable Podman, corrupt the selected image declaration, or force container startup failure while false/missing is selected. | Clear fatal container-runtime error; zero outer coding bwrap services/direct provider processes and no sandbox fallback. |
| Lifecycle | Kill provider, adapter, service, Router, outer exec; SIGSTOP; PID reuse; corrupt/stale records; Box stop timeout. | Exact owned trees/brokers/routes cleaned; unrelated PID untouched; restart recovers or fails closed. |
| HOME concurrency | Parallel task/task, task/login, task/TUI, two aliases; crash lock owner. | First rollout serializes same HOME, recovers stale lock safely, and permits distinct aliases without cross-read. |
| Network | Scan Box loopback; call Router/Soul/other service without token; try broker token outside task/audience/TTL. | All sensitive endpoints authenticate; scoped token cannot escape route/task/generation. Residual outbound exfiltration is documented, not claimed solved. |

## 23. Clean-break rollout and recovery strategy

| Stage | Action and gate |
| --- | --- |
| Pre-merge | Land capability classification first. CI permits true for any manifest that satisfies the sandbox contract, rejects incompatible true declarations, and verifies false/missing launches have usable container configuration. It contains no agent-name or exact-count allowlist. |
| Image canary | Publish immutable Box candidate after native gates; do not retag stable. Capture bwrap/Node/npm versions and both architecture digests. |
| Runtime dark launch | Ship the Ploinky capability in an unreleased candidate while managed coding manifests remain unrefreshed; exercise a dummy bwrap service only. Do not add a manifest policy flag or compatibility mode. |
| Managed refresh | Update managed checkouts from exact approved `ploinky-bwrap` commits; compare manifests/source hashes with primaries. Refuse mixed source/runtime generations or any source from `ploinky-proxy`. |
| Coding canary | One isolated workspace/alias per provider in true mode and one in false/missing mode, then browser and CLI, then concurrency/lifecycle/hybrid graph. Toggle only the selector and monitor runtime selection, readiness, route failures, redaction counters, engine events, and orphan checks. |
| General rollout | Promote only when section 25 is green on both architectures and rollback drill succeeds. |

This plan deliberately offers no backwards compatibility. The new release accepts only the new CLI grammar and the sandbox-mode `/home/agent` ABI; it has no cwd inference, sandbox `/root` shim, tolerant cross-mode state reader, cross-runtime fallback, or mixed-generation support. `startup: "manual"`, false/missing Podman selection, the native container HOME ABI, public task-result shapes, Codex's native defense in depth, and existing container RuntimeRelay behavior remain because they are target behavior, not compatibility mechanisms.

Recovery is release-level and snapshot-based. Before canary, quiesce all coding agents and snapshot each physical sandbox-mode coding HOME with the old release still active. To recover, unpublish routes, invalidate generations, stop and verify every bwrap service/task, restore the previous Ploinky/image/source and managed-repo commits, restore the pre-cutover sandbox HOME snapshots, and then restart the selected services. Never cross-mount sandbox `/home/agent` state into the container HOME layout, or vice versa, and never silently switch runtime after a selected launch fails.

## 24. Resolved decisions and fixed rollout policy

| Decision | Fixed contract | Consequence |
| --- | --- | --- |
| Runtime selector | For every agent, true selects mandatory bwrap on Linux/Box or Seatbelt on macOS; false/missing selects mandatory Podman. | Dispatch is agent-name independent. A selected backend failure is fatal and never triggers the other backend. |
| Dual-mode manifests | `container` is permitted alongside true. Sandbox launch ignores it completely; false/missing requires and activates it. | OpenCode/Codex/PI keep their container declaration and must pass after changing only the selector. No exact-three allowlist is permitted. |
| Branch isolation | All seven affected repositories use `ploinky-bwrap` created from `ploinky-proxy`; `ploinky-proxy` is preserved through normal history. | Source, CI, managed refresh, image provenance, and rollout evidence use exact new-branch commits. No feature commit or force-push targets `ploinky-proxy`. |
| Writable workspace root | Exact `/workspace` is rejected for browser and CLI workdir selection. | Users must select an existing non-root project directory; this intentionally breaks root-launched workflows. |
| Public CLI grammar | `ploinky cli <agent> --workdir <path> -- <provider-args>`; Ploinky consumes exactly one pre-separator selector. | No legacy argument interpretation or cwd inference. |
| Sibling visibility | The provider sees the workspace RO and only the selected project RW. | Siblings become readable compared with today's OpenCode/PI policy; the boundary protects integrity, not sibling confidentiality. |
| Network | Initial provider namespaces share Box networking for required egress. | Release requires an authenticated-loopback scan and scoped broker credentials; private controlled egress is later hardening. |
| AgentServer credential | Ploinky writes a versioned generation descriptor to a child pipe; Bubblewrap mounts it 0400 with `--ro-bind-data` at `/run/ploinky-agent/credential.json`. | No disk source, environment/argv secret, master credential, or in-place rotation. |
| HOME ABI | Sandbox state is mounted directly at `/home/agent` with a version marker; container mode retains its native HOME ABI. | No sandbox `/root` shim or cross-mode reader; incompatible state fails with an archive/reset instruction. Recovery and tests keep the layouts distinct. |
| HOME concurrency | Every provider task, login, model/update action, TUI, and trusted installer uses an exclusive per-HOME lease. | Same-alias work queues; different aliases may proceed independently. |
| Agent routing | Bwrap supports authenticated root `/mcp` through the existing direct loopback Router path only. | Coding manifests expose no agent-owned additional ports; any bwrap additional-port request fails `BWRAP_AGENT_PORT_UNSUPPORTED`. Container RuntimeRelay and Soul's existing container-owned relay remain unchanged. |

These decisions are implementation inputs, not release-time policy options. `lite-sandbox` is the required runtime switch; no other per-agent property may weaken its dispatch or security contract.

## 25. Definition of done

| Gate | Required evidence |
| --- | --- |
| Selector/network | Dispatch is agent-name independent: true strictly selects bwrap on Linux/Box or Seatbelt on macOS; false/missing strictly selects Podman. True-plus-container is valid and dormant, selected-backend failure never crosses runtimes, coding sandbox network derivation is stable, and prohibited disable/network conflicts fail explicitly. |
| Manifest capability | OpenCode/Codex/PI remain manual, retain valid container declarations, and pass after changing only the selector. CI uses capability rules rather than a name/count allowlist. Currently incompatible specialized agents are false/missing and keep their container semantics. |
| Hybrid runtime | In true mode there is no coding Podman container/event/image pull; in false/missing mode the exact coding container exists and no outer coding bwrap service exists. All three coding agents pass both-mode flows and all specialized non-coding agents pass their container smoke. |
| Box | Exact Bubblewrap NEVRA/fd features and the non-setuid launcher ABI pass native `openat2`, namespaces, private proc, mount, descriptor, and signal tests on amd64, arm64, and Podman Machine. |
| Filesystem | The retained-fd selected WORKDIR is writable; siblings are RO; exact root is rejected; protected Ploinky state/other homes/engine storage are unreadable; system/Node/dependencies/provider executable roots are immutable; path-race tests mount the retained inode or fail. |
| HOME | Direct sandbox `/home/agent` ABI and native container HOME each persist by exact alias across sessions/Box restart; state never crosses modes; incompatible state fails; cross-alias denial and exclusive-lease crash recovery pass. |
| Provider parity | Browser, task, continuation, models, login, and interactive flows for all three execute inside the canonical provider boundary in both selected modes; Codex retains native defense in depth. |
| Credentials/network/routing | The generation credential arrives only through pipe plus 0400 `--ro-bind-data`; no persistent Box-side credential file or secret env/argv exists; the provider cannot see the descriptor/context through mounts, fds, logs, or proc; authenticated root MCP and context-backed scoped task brokers work; direct-credential fallback and bwrap additional ports fail; loopback auth scan passes. |
| Workdir | Arbitrary valid existing subfolders and managed-repo exception work; traversal/symlink/TOCTOU/root policy tests pass. |
| Lifecycle | Cancel, crash, disable, restart, stale PID/generation, Router loss, and Box stop clean exact trees/routes/brokers without touching unrelated processes. |
| Observability | Registry/status/logs report real bwrap service/task runtime, generation, PID identity, workdir, readiness, and sanitized failures. |
| Readiness/toolchain | Capability checks never execute a provider against the real workspace; harmless provider readiness uses an empty tmpfs workspace; exact Box and approved coding-image Node/npm/provider versions run from immutable mounts in their respective modes. |
| Rollout/recovery | Managed checkouts match exact approved `ploinky-bwrap` commits; both-mode canary and snapshot recovery drill pass; branch/commit/image/snapshot evidence is archived; `ploinky-proxy` remains the verified non-feature baseline. |

## 26. Git and evidence report

This document records repository state only to make implementation handoff reproducible; live Git remains authoritative. On 2026-08-05 the recommended non-destructive branch migration was completed. `ploinky-bwrap` was created from the implementation candidate in every affected repository and pushed. Each `ploinky-proxy` branch was restored with a normal revert commit where needed; no force-push occurred. Primary checkouts now track `origin/ploinky-bwrap`. The aggregate root's large unrelated staged/modified workspace set and each repository's unrelated untracked files were left untouched.

| Commit/evidence | What it establishes |
| --- | --- |
| `092db1c` | Introduced the two Bubblewrap architecture/implementation documents with a path-scoped commit. |
| `829ec55` | Added the independent verification findings that this revision has now integrated into the normative sections. |
| `c51dc90` | Corrected the historical push report; it is the current local and remote branch head at revision start. |
| AchillesCLI `1fe668f` | Historical nested-Bubblewrap proc/readiness work; its 42 passing tests do not make the current provider readiness safe because the version probe receives the real workspace RW. Phase 1 fixes that before reuse. |
| `ploinky-bwrap` candidate heads | `file-parser c51dc90`, `ploinky 136e995`, `container-image-builds 1d0e18e`, `AchillesCLI 94fa900`, `AssistOSExplorer 9fec9a1`, `copilot-agents 2e738e1`, `UmamiAgent f9ee6b4`. These preserve the candidate and planning work on the new branch. |
| `ploinky-proxy` restoration commits | `ploinky b07db02`, `container-image-builds e2a1c6f`, `AchillesCLI 6d09665`, `AssistOSExplorer fa84290`, `copilot-agents c0976a0`, `UmamiAgent 7bfa7ab`. Tree equality was verified against each pre-implementation baseline. The root required no implementation revert. |

The source repositories identified for implementation remain `ploinky`, `AchillesCLI`, `container-image-builds`, `AssistOSExplorer`, `copilot-agents`, and `UmamiAgent`, all on `ploinky-bwrap` and tracking the corresponding remote branch. Managed runtime checkouts under `.ploinky/repos` are generated state and may differ; phase 10 refreshes them from exact approved new-branch commits and rejects mixed generations rather than editing them directly.

Historical selector verification found 56 source `manifest.json` files, 16 production `lite-sandbox: true` declarations plus one Ploinky test fixture, and five manual-start manifests. Historical AchillesCLI verification passed `18/18` task-sandbox, `13/13` OpenCode API, and `11/11` PI execute-task tests. Those results establish the inspected baseline only; the new security and native acceptance gates in sections 21–25 must still pass during implementation.
