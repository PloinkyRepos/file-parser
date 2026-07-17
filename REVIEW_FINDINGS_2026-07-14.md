# Six-Repository Adversarial Review Findings

Date: 2026-07-14  
Verdict: **FAIL**

This file records the actionable findings from the read-only review of the prescribed Ploinky, AssistOSExplorer, basic, webmeetInfra, UmamiAgent, and container-image-builds commit ranges. Evidence labels follow the review brief: **Observed** is directly supported by source, history, tests, or runtime output; **Inferred** is a reasoned consequence; **Unknown** was not proved with the available evidence.

## P1 findings

### F1 — Web Publishing’s Cloudflare tunnel token remains container-wide

**Evidence: Observed + Inferred. Affected history: incomplete remediation in `63c024f1`; env declaration inherited from `304327ef`.**

The manifest supplies `TUNNEL_TOKEN` as runtime environment at `/Users/danielsava/work/file-parser-webmeet-hardening/basic/web-publishing/manifest.json:119`, while AgentServer is a separate long-lived process at line 5. The supervisor only deletes the token from its own `process.env` at `/Users/danielsava/work/file-parser-webmeet-hardening/basic/web-publishing/runtime/supervisor.mjs:333`, and the admin tool still reads it from process environment at `/Users/danielsava/work/file-parser-webmeet-hardening/basic/web-publishing/tools/web-publishing-tool.mjs:217`.

Impact: by normal process inheritance, AgentServer and its descendants retain a credential the contract says must exist only in private file handoff.

Correction and regression test: remove the container-wide token environment variable and broker the token only to Cloudflared through a private file or file descriptor. Start the real container and assert the token is absent from `/proc/*/environ`, argv, AgentServer, admin tools, status, and logs while Cloudflared still starts.

### F2 — A foreign exact-name agent container can be stopped, renamed, and deleted

**Evidence: Observed. Affected commit: `24b01c45`.**

A label mismatch becomes generic “contract drift” at `/Users/danielsava/work/file-parser/ploinky/cli/services/docker/agentServiceManager.js:1525`. The replacement transaction then inspects the exact name without verifying ownership, stops and renames it at `/Users/danielsava/work/file-parser/ploinky/cli/services/networkLifecycle.js:878`, and deletes the backup after success at line 897. Existing tests encode replacement of an unlabeled object at `/Users/danielsava/work/file-parser/ploinky/tests/unit/networkLifecycle.test.mjs:289`.

Impact: unrelated containers colliding with deterministic names are destroyed.

Correction and regression test: require the exact workspace/resource/schema/contract identity before pull, stop, or rename. Mismatched or missing labels must fail closed. Add missing-label and mismatched-label fixtures asserting zero mutation.

### F3 — A legacy four-label gateway is mutably adopted

**Evidence: Observed. Affected commit: `c9039ba8`.**

`allowMissingSocketIdentity` authorizes a missing socket label at `/Users/danielsava/work/file-parser/ploinky/cli/services/networkLifecycle.js:480`; mutable preflight enables it at line 742, and `ensureGateway` then removes and recreates the gateway at line 669.

Impact: a legacy or foreign gateway that is supposed to be inspection/prune-only can be deleted.

Correction and regression test: permit missing socket identity only in read-only status/prune classification. Every reconciliation path must require all five exact labels. Test zero pull/remove/run operations for a four-label gateway.

### F4 — Authoritative graph/resource preflight is not globally before mutation

**Evidence: Observed. Affected range: integration introduced by `24b01c45..c9039ba8`.**

Workspace start can initialize the router, enable and persist agents, execute host hooks, and install repositories at `/Users/danielsava/work/file-parser/ploinky/cli/services/workspaceUtil.js:784`, `:792`, `:840`, and `:909` before graph collision validation at line 921. Direct container startup likewise creates directories, caches, mount paths, and staging state at `/Users/danielsava/work/file-parser/ploinky/cli/services/docker/agentServiceManager.js:778` before managed-resource preflight at line 1152.

Impact: an alias collision, foreign resource, or unsupported engine can fail only after arbitrary hooks and local state mutation.

Correction and regression test: introduce a genuinely pure discovery/graph/resource phase before operational hooks or writes, then execute the frozen plan. Spy tests should prove zero router, hook, repository, filesystem, cache, image, and engine mutations for every invalid preflight class.

### F5 — bwrap and Seatbelt bypass schema-2 networking and silently use host networking

**Evidence: Observed. Affected commit: `24b01c45` failed to integrate the pre-existing sandbox dispatch.**

Runtime dispatch occurs before network canonicalization at `/Users/danielsava/work/file-parser/ploinky/cli/services/docker/agentServiceManager.js:1350`. bwrap explicitly does not unshare networking at `/Users/danielsava/work/file-parser/ploinky/cli/services/bwrap/bwrapServiceManager.js:315`, and Seatbelt treats the network as shared host networking at `/Users/danielsava/work/file-parser/ploinky/cli/services/seatbelt/seatbeltServiceManager.js:379`. Both ignore the passed profile override and use the global profile at bwrap line 518 and Seatbelt line 335.

Impact: `none`, `default`, `bridge`, or invalid legacy network syntax can execute with host connectivity, defeating isolation and profile selection.

Correction and regression test: canonicalize before backend selection and either implement every mode or explicitly reject unsupported modes. Test invalid, none, default, bridge, and explicit-profile cases through both backends.

### F6 — Workspace start and watchdog restart do not share a safe lease

**Evidence: Observed. Affected commits: `e19abf39` and `e4d4f18b`.**

A live owner is reaped solely because a fixed expiry passed at `/Users/danielsava/work/file-parser/ploinky/cli/services/maintenanceLocks.js:55`, and the lock has no heartbeat despite its 24-hour expiry at line 75. The monitor only snapshots the lock, then calls restart later without acquiring or rechecking it at `/Users/danielsava/work/file-parser/ploinky/cli/server/containerMonitor.js:397`. Network-lock contention also blocks the monitor’s main JavaScript thread with `Atomics.wait` for up to 60 seconds at `/Users/danielsava/work/file-parser/ploinky/cli/services/networkLifecycle.js:259`.

Impact: container mutations can interleave with a live start, replacement locks can be unlinked, and one contention event can stall all watchdog probes and shutdown handling.

Correction and regression test: use a common renewable token/fingerprint lease with compare-before-delete, acquire it around monitor mutation, and make contention asynchronous or nonblocking. Add barrier tests for live expired owners, lock replacement races, monitor/start interleaving, other-target timer progress, and shutdown during contention.

## P2 findings

### F7 — Intended unhealthy-gateway repair is unreachable through public reconciliation

**Evidence: Observed. Affected commit: `c9039ba8`.**

Preflight probes a current-socket gateway and throws at `/Users/danielsava/work/file-parser/ploinky/cli/services/networkLifecycle.js:742`, before `ensureGateway` can reach its exact-owned repair branch at line 692. The green test calls `ensureGateway` directly at `/Users/danielsava/work/file-parser/ploinky/tests/unit/networkLifecycle.test.mjs:656`, bypassing the public boundary.

Impact: a hung or unhealthy gateway with the current socket inode bricks normal reconciliation instead of being safely replaced.

Correction and regression test: immutable preflight should return health drift while holding the lock, then allow exact-owned repair. Test through `reconcileManagedControlPlane` and the full transaction.

### F8 — Missing-profile fallback can combine default profile configuration with the root network

**Evidence: Observed. Affected commit: `24b01c45`.**

`getProfileConfig` falls back to default at `/Users/danielsava/work/file-parser/ploinky/cli/services/profileService.js:273`, but direct callers keep the nonexistent requested name and independently recompute the network at `/Users/danielsava/work/file-parser/ploinky/cli/services/docker/agentServiceManager.js:1396`. `effectiveManifestNetwork` then selects the root block at `/Users/danielsava/work/file-parser/ploinky/cli/services/networkContract.js:77`.

Impact: planner/graph topology and direct restart/monitor topology can diverge.

Correction and regression test: resolve a single `{resolvedProfileName, config, network}` object and pass it through every caller. Test a missing profile where root and default-profile networks differ.

### F9 — Implicit AgentServer publication erases manifest mappings from registry state

**Evidence: Observed. Affected commit: activated by `24b01c45` over pre-existing assignment logic.**

The new implicit-7000 condition is at `/Users/danielsava/work/file-parser/ploinky/cli/services/docker/agentServiceManager.js:1596`, but line 1604 replaces `allPortMappings` instead of appending. The truncated list is persisted and used for route selection at line 1659.

Impact: the container has both mappings, while registry, reuse, monitor, and route resolution forget declared ports.

Correction and regression test: append and deduplicate the implicit mapping, preferably persisting inspected actual mappings. Test manifest port 8080 plus implicit 7000 across start and reuse.

### F10 — Managed-container reuse does not validate the live hosts file’s contents or type

**Evidence: Observed. Affected commits: `24b01c45` and `b12b6066`.**

The localhost-only file is written at `/Users/danielsava/work/file-parser/ploinky/cli/services/networkLifecycle.js:304`, but reuse checks only bind source/read-only/`--no-hosts` metadata at lines 391 and 1007.

Impact: replacing or rewriting the live bind source can reintroduce host aliases while reuse still reports an exact contract.

Correction and regression test: use `lstat` to require a regular non-symlink file and verify exact content and mode before reuse. Define safe replacement behavior. Test modified content and symlink substitution.

### F11 — Cloudflare DNS preflight permits unrecorded partial remote mutation

**Evidence: Observed. Affected commit: `63c024f1`.**

Preflight issues only GET requests at `/Users/danielsava/work/file-parser-webmeet-hardening/basic/web-publishing/lib/cloudflare-api.mjs:140`. The tool then PUTs ingress before attempting DNS writes at `/Users/danielsava/work/file-parser-webmeet-hardening/basic/web-publishing/tools/web-publishing-tool.mjs:287`, and status is written only after both succeed. A mocked run observed four successful DNS GETs, a successful ingress PUT, then DNS POST 403; the prior status remained `running`.

Impact: remote ingress changes despite failed apply, with false or stale local state.

Correction and regression test: prove DNS write permission before ingress, or provide transactional rollback/reconciliation and partial-failure status. A GET 200 plus DNS write 403 fixture must cause zero ingress mutation.

### F12 — Encoded URL userinfo is detected but not redacted

**Evidence: Observed. Affected commit: `0e5532f8`.**

Detection recursively decodes values at `/Users/danielsava/work/file-parser-webmeet-hardening/AssistOSExplorer/webmeetAgent/IDE-plugins/webmeet-tool-button/components/webmeet-dashboard/services/diagnostic-redaction.mjs:45` and flags userinfo in the decoded view at line 127, but redaction only rewrites a literal URL in the original string at line 146. Single- and double-percent-encoded credential URLs survived a direct proof unchanged.

Impact: diagnostics and 0600 smoke artifacts can retain encoded URL credentials.

Correction and regression test: if decoded detection finds `URL_USERINFO`, fail closed by redacting the whole string or safely rewriting every encoding layer. Test single- and double-encoded userinfo through both dashboard and smoke redactors.

### F13 — “Full” UID/GID mapping validation checks only a sum

**Evidence: Observed. Affected range: exactness claim introduced across `9f461138..4f33c1b`; summing logic predates the range.**

The entrypoint sums mapping lengths at `/Users/danielsava/work/file-parser-webmeet-hardening/container-image-builds/images/ploinky-box/entrypoint.sh:40`, then compares only the total at line 63. The workflow repeats this at `/Users/danielsava/work/file-parser-webmeet-hardening/container-image-builds/.github/workflows/publish-ploinky-box-image.yml:275`. A gapped map can total 65,535 while omitting inner ID 65,534.

Impact: publication can pass while Coturn’s required fixed UID/GID is unmapped.

Correction and regression test: sort ranges and require start 0, no gaps or overlaps, and exclusive end 65,535 for UID and GID. Include equal-total gapped fixtures.

### F14 — Ploinky-box publication has mutable upstream build inputs

**Evidence: Observed + Inferred. Affected commits: inherited source promoted by `9f461138` and `4f33c1b`.**

`/Users/danielsava/work/file-parser-webmeet-hardening/container-image-builds/images/ploinky-box/Dockerfile:1` uses `quay.io/podman/stable` and `node:24-bookworm-slim`; line 12 installs unversioned packages from mutable Fedora repositories. The workflow supplies no pinned base arguments at `/Users/danielsava/work/file-parser-webmeet-hardening/container-image-builds/.github/workflows/publish-ploinky-box-image.yml:101`.

Impact: amd64 and arm64 jobs can resolve different unreviewed inputs, and a source SHA cannot reproduce the artifact. The published output digest itself remains immutable.

Correction and regression test: pin multiarch base indexes by digest, snapshot repositories and exact package versions, and record per-platform base and package provenance. Reject tag-only base arguments in the workflow.

### F15 — The Go gateway is connection and file-descriptor exhaustible

**Evidence: Observed + Inferred. Affected commit: `9f461138`.**

Every accepted connection receives two unbounded `io.Copy` goroutines without deadlines at `/Users/danielsava/work/file-parser-webmeet-hardening/container-image-builds/images/ploinky-network-gateway/main.go:16`. The accept loop at line 54 has no concurrency limit or error backoff.

Impact: an attached faulty or compromised agent can hold idle connections until file-descriptor exhaustion, after which persistent accept errors can spin CPU and logs and deny the workspace router path.

Correction and regression test: bound concurrency, add dial and idle handling, and add capped exponential accept-error backoff. Test idle-client exhaustion, injected persistent accept errors, bounded goroutines/logging, and recovery. There are currently no Go tests.

### F16 — Remote Podman fallback hardcodes a machine named `podman`

**Evidence: Observed. Affected commit: `2f0b440d`.**

Gateway namespace proofs fall back to `podman machine ssh podman ...` at `/Users/danielsava/work/file-parser/ploinky/cli/services/networkLifecycle.js:464` and line 580, ignoring the selected connection and standard machine identity.

Impact: valid remote rootless Podman configurations fail closed unless an unrelated local machine happens to have that exact name.

Correction and regression test: derive and verify the selected connection or machine, or reject remote mode before mutation with a precise supported-configuration error. Test two named machines and connections.

## P3 findings

### F17 — LiveKit’s “atomic” config replacement deletes the previous generation first

**Evidence: Observed. Affected commit: `0fa90ad2`.**

`/Users/danielsava/work/file-parser-webmeet-hardening/webmeetInfra/liveKitServerAgent/scripts/hooks/preinstall.sh:274` removes all three old files before sequential moves at lines 283–288.

Impact: interruption or a later rename failure leaves absent or mixed-generation configuration.

Correction and regression test: rename over each existing leaf without blanket deletion, or publish a staged generation through one indirection swap. Inject failure between renames and assert old remaining files survive.

### F18 — Publication gates do not prove numeric UID and exact-device contracts

**Evidence: Observed. Affected range: inherited gaps retained by `9f461138..4f33c1b`.**

Web Publishing relies on `useradd --system` without `--uid` or `--gid 999` at `/Users/danielsava/work/file-parser-webmeet-hardening/container-image-builds/images/web-publishing-agent/Dockerfile:38`, while tests only check the symbolic user. Ploinky-box checks only device existence at `/Users/danielsava/work/file-parser-webmeet-hardening/container-image-builds/images/ploinky-box/entrypoint.sh:118`, not character-device type or mode 0666.

Impact: a future base or runner can violate UID/device contracts while publication remains green.

Correction and regression test: create UID/GID 999 explicitly and runtime-check `id`. Inspect live outer device type, mode, and exact security configuration in both native jobs, with negative fixtures.

### F19 — Canonical documentation contradicts operational behavior

**Evidence: Observed. Affected range: documentation across the reviewed commits.**

Contract-3 code deliberately supports controlled contract-2 replacement at `/Users/danielsava/work/file-parser/ploinky/container/runtime-supervisor.mjs:1392`, while `/Users/danielsava/work/file-parser/ploinky/docs/specs/DS004-runtime-execution-and-isolation.md:32` says there is no migration path. Other Ploinky docs still say contract 2. The image README says contract 2 at `/Users/danielsava/work/file-parser-webmeet-hardening/container-image-builds/README.md:23`. Infrastructure docs describe tag-only LiveKit while `/Users/danielsava/work/file-parser-webmeet-hardening/webmeetInfra/liveKitServerAgent/manifest.json:2` is digest-pinned. Deploy workflows call their check `validPublicIpv4` at `/Users/danielsava/work/file-parser-webmeet-hardening/AssistOSExplorer/.github/workflows/deploy-skills-explorer.yml:162`, while the operational contract is only bare unicast/non-loopback and accepts private and special-use unicast. Remote Podman machine restrictions are undocumented.

Impact: operators cannot tell whether migration, mutable runtime-channel behavior, public routability, or remote Podman is supported.

Correction and regression test: choose and document one contract-2 policy, update contract numbers and digest examples, accurately name and define IP semantics, document remote assumptions, and add documentation/manifest consistency checks.

## Review conclusion

The implementation fails the review because the P1 findings include destructive mutation of foreign resources, credential-isolation failure, mutation before complete preflight, sandbox networking bypass, and unsafe start/monitor concurrency. Focused tests were largely green, but several tests encode the unsafe behavior or stop below the failing public boundary.
