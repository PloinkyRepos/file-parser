# Ploinky Networking Plan Review

**Subject:** Hard-cut removal of the Go network gateway in favor of the Ploinky box host gateway  
**Verdict:** **Approve with corrections**  
**Review date:** 15 July 2026  
**Workspace:** `/Users/danielsava/work/file-parser`  
**Scope:** Review-only analysis of the current working trees, including uncommitted user changes

## Executive decision

The gateway-free architecture is viable, but the proposed plan is not implementation- or release-ready as written. Do not implement it until the controlled hosts-base correction, contract-4 destroy/recreate cutover, and exact native nested-Podman release gates described below are incorporated.

The design correctly preserves isolated managed bridges, aliases, multiple attachments, trusted box-peer assumptions, and routed JWT authorization while eliminating the bespoke Go gateway and Unix relay. Two corrections are release blockers:

1. Podman's default hosts base can import the outer box's `/etc/hosts` into an inner agent. Therefore, `--add-host` alone is not a controlled nested-container contract; managed agents need `--hosts-file=none` as well.
2. Restarting a compatible outer box does not pull a new image. This hard cut must bump the outer runtime contract to 4 and require destroy/recreate rather than restart.

The exact nested-rootless composition remains an unverified platform assumption. Podman documents `host-gateway` and `isolate=true` individually, but the real Ploinky topology—nested rootless Podman, custom isolated bridges, multiple attachments, and a wildcard box listener—must pass native amd64 and arm64 tests against the exact candidate digest before gateway artifacts are removed or the runtime tag is promoted.

## Review scope and evidence classification

The `ploinky` repository contained uncommitted user changes and was reviewed as a working tree rather than only at `HEAD`. The `container-image-builds` repository was clean. No existing source files, resources, containers, networks, images, workflows, or runtime configuration were changed during the review.

- **Observed:** Verified in the current working tree, including uncommitted user changes.
- **Inferred:** A consequence of observed implementation details or official platform behavior, but not directly exercised in the exact target topology.
- **Unverified:** A platform or release assumption that requires the specified real-engine gate.

Repository prefixes used below:

- `[ploinky]` = `/Users/danielsava/work/file-parser/ploinky/`
- `[images]` = `/Users/danielsava/work/file-parser/container-image-builds/`
- `[workspace]` = `/Users/danielsava/work/file-parser/`

## Severity-ordered findings

### F-01 — Outer restart does not migrate the box image

**Severity:** Critical  
**Evidence class:** Observed

Compatible contract-3 boxes are reused or started without pulling. New mounted Ploinky source can therefore run against an older, unproven Podman image if the release relies only on restart.

**Evidence:**

- `[ploinky] container/runtime-supervisor.mjs:1594-1680` — reconciliation and compatible-box reuse.
- `[ploinky] container/runtime-supervisor-tests.mjs:667-675` — explicit no-pull assertion.
- `[images] README.md:241-245` — documented image-ID reuse.
- `[images] images/ploinky-box/Dockerfile:44` — current runtime contract label 3.
- `[ploinky] container/runtime-contract.mjs:11` — current required runtime contract 3.
- `[ploinky] container/runtime-supervisor.mjs:1386-1417` — only contract 2 receives special upgrade handling; other mismatches require destroy.

**Required correction:** Bump both repositories to runtime contract 4, remove the existing contract-2 upgrade bypass, stage and gate the exact contract-4 candidate, and require explicit `ploinky destroy` followed by recreation while preserving named storage. An ordinary restart is insufficient.

### F-02 — The default hosts base is not safe for this nested transport

**Severity:** Critical  
**Evidence class:** Observed mechanism; inferred nested consequence

Podman uses the host `/etc/hosts` as the default base. Its implementation parses explicit extra hosts first and then appends the base file without deduplicating those two user-controlled sets. In the nested box, an inherited outer `host.containers.internal` entry could therefore coexist with the intended inner box mapping and offer a prohibited path toward the physical host.

Official Podman documentation states that:

- `--add-host` conflicts with `--no-hosts` and global `no_hosts=true`.
- Explicit `host-gateway` resolves to an address usable to connect to the host and fails with an error when Podman cannot determine one.
- Podman uses the host `/etc/hosts` as its base by default.
- `--hosts-file=none` starts from an empty base.

Podman v5.8.2 source parses explicit entries before the base file and only applies name deduplication to later automatic entries, not between the explicit and base entries.

**Required correction:** For managed default and bridge modes, use:

```text
--hosts-file=none
--add-host host.containers.internal:host-gateway
```

Delete the Ploinky-generated `managed-hosts` file, bind mount, `--no-hosts`, and their lifecycle. Podman still owns and generates the resulting `/etc/hosts`.

Podman may also add `host.docker.internal` automatically at the same calculated address. The product contract should forbid Ploinky from selecting or falling back to that name; it should not claim that Podman guarantees the hostname is absent.

### F-03 — Router port is not guaranteed at every creation boundary

**Severity:** High  
**Evidence class:** Observed

The normal workspace-start path passes a configured port, but enable, CLI, shell, reinstall, restart, watchdog, and some client or sandbox paths can omit it and silently depend on `routing.json` or 8080. The existing parser also accepts trailing junk and does not reject values above 65535.

**Evidence:**

- `[ploinky] cli/services/docker/agentServiceManager.js:441-446` — permissive `normalizeRouterPort` parsing.
- `[ploinky] cli/services/docker/agentServiceManager.js:448-470` — routing-file lookup and silent 8080 fallback.
- `[ploinky] cli/services/agents.js:405-415` — enable path omits an explicit port.
- `[ploinky] cli/services/workspaceUtil.js:1281, 1403, 1504-1508` — CLI, shell, and reinstall paths.
- `[ploinky] cli/commands/cli.js:573-578` — restart path.
- `[ploinky] cli/server/containerMonitor.js:473-480` — watchdog path.
- `[ploinky] cli/services/noWaitWorker.js:95-103` — passes the port only when supplied.
- `[ploinky] Agent/client/AgentMcpClient.mjs:15` — client-side loopback/8080 fallback.

**Required correction:** Introduce one strict resolver for exact decimal ports from 1 through 65535. Persist the selected port before agent creation, pass it explicitly through every create/recreate path, and fail before Podman, network, or registry mutation on missing or invalid state. None mode bypasses resolution.

RoutingServer startup may deliberately choose and persist a documented initial default. Agent creation must never independently or silently choose 8080.

### F-04 — Agent contract drift currently becomes a foreign-name collision

**Severity:** High  
**Evidence class:** Observed

Changing `runtimePolicy` changes the agent contract hash, but current container inspection treats any contract mismatch as foreign. An old exact-named Ploinky agent would block replacement rather than being cleanly invalidated.

**Evidence:**

- `[ploinky] cli/services/networkContract.js:123-129` — `networkContractHash` includes `runtimePolicy`.
- `[ploinky] cli/services/networkLifecycle.js:1325-1353` — `inspectContainerContract` classifies mismatched contracts as foreign.
- `[ploinky] cli/services/networkLifecycle.js:1150-1173` — managed replacement requires current expected labels.
- `[ploinky] cli/services/docker/agentServiceManager.js:1545-1555` — foreign-container error.

**Required correction:** Separate immutable Ploinky ownership from mutable compatibility. Full immutable ownership with an old contract hash is `owned-drift` and may be atomically replaced. Partial labels and unrelated exact-name collisions remain foreign. This is generic contract enforcement, not a legacy gateway adoption or compatibility branch.

The bridge resources remain schema 2 and reusable because their labels and structural shape do not change.

### F-05 — The exact nested-rootless topology is not proven by current CI

**Severity:** High  
**Evidence class:** Unverified

Official documentation supports the individual mechanisms, not their full composition in the Ploinky box. Current box-image CI runs an Alpine echo using the transport that the proposal explicitly forbids and does not exercise RoutingServer, multi-attachment, host-gateway failure, or isolation boundaries.

**Evidence:**

- `[images] .github/workflows/publish-ploinky-box-image.yml:211-328`, especially `:287-288` — current `slirp4netns:allow_host_loopback=true` echo smoke.
- `[ploinky] container/smoke-runtime.mjs:103-178` — starts a real default agent but does not prove router connectivity or multiple attachments.
- Podman network-create documentation defines bridge `isolate`, but does not certify this nested topology.

**Required correction:** Make the exact native amd64 and arm64 transport smoke a release gate against the candidate digest. Record the Podman, Netavark, and Aardvark versions. Preferably pin the multi-architecture box base by digest; at minimum, reject an uncharacterized mutable candidate.

### F-06 — A production Cloudflared origin hardcodes port 8080

**Severity:** High  
**Evidence class:** Observed

Cloudflared routes and related settings use `http://host.containers.internal:8080`. A correctly configured non-default RoutingServer port would therefore break web publishing even if managed agents receive the new variables.

**Evidence:**

- `[workspace] basic/cloudflared/lib/routes.mjs:5-18`.
- `[workspace] basic/cloudflared/IDE-plugins/cloudflared-settings/cloudflared-settings.js:2-12`.
- `[workspace] basic/cloudflared/README.md:51-60`.
- `[workspace] docs/specs/DS003-cloudflared-agent.md:62-66, 84-90`.
- `[workspace] docs/cloudflared.html:52-61, 88-98`.
- `[workspace] docs/index.html:124-135`.
- `[workspace] tests/unit/cloudflaredRoutes.test.mjs`.
- `[workspace] tests/unit/webPublishingRoutes.test.mjs`.

**Required correction:** Generate or inject the configured router origin into the Cloudflared preset and update its active documentation and tests. Do not preserve a second hidden 8080 contract.

### F-07 — Resource and status schemas need separate authority

**Severity:** Medium  
**Evidence class:** Observed

One constant currently drives bridge labels, agent labels, the contract hash, and the status payload. The current status classifier also accepts a matching workspace label as sufficient evidence that an attachment is an agent.

**Evidence:**

- `[ploinky] cli/services/networkContract.js:4` — `NETWORK_SCHEMA_VERSION`.
- `[ploinky] cli/services/networkLifecycle.js:1254-1322` — status payload and attachment classification.
- `[ploinky] tests/unit/networkLifecycle.test.mjs:51-107` — current gateway-bearing status shape.

**Required correction:** Keep bridge resource schema as the string `"2"` because the bridge shape is unchanged. Add a distinct status schema string `"3"`. Classify attachments as `agent` only with the complete required Ploinky ownership label set; everything else is `unknown`.

### F-08 — Wildcard binding broadens box-side reachability

**Severity:** Medium  
**Evidence class:** Observed bind; inferred exposure boundary

An explicit IPv4 wildcard bind is the minimal listener required for the box gateway. Outer `-p` bindings still define the supported physical-host/LAN publication contract, but wildcard binding also exposes RoutingServer to any peer that can route to a box interface.

**Evidence:**

- `[ploinky] cli/server/RoutingServer.js:692-735` — Unix relay and current listen call.
- `[ploinky] cli/services/workspaceUtil.js:131-155` — Unix-first readiness.
- `[ploinky] container/runtime-contract.mjs:725-779` — outer publication arguments.

**Required correction:** Use:

```js
server.listen(port, "0.0.0.0", callback)
```

Remove the Unix relay, keep TCP readiness against `127.0.0.1` from inside the box, and document that physical publication policy does not prove the absence of every alternate box-side path.

### F-09 — Artifact and removal inventories are incomplete or over-broad

**Severity:** Medium  
**Evidence class:** Observed

The gateway has no image-local README; its documentation lives in the root image-build README. The plan also misses box contract assertions, active client fallbacks, Cloudflared, exact release-SHA provenance, and registry retirement. Conversely, global searches for `ploinky-router`, `8080`, `socket`, or `slirp4netns` would catch legitimate identities, services, wording, and dependency behavior.

**Evidence:**

- `[images] README.md:21, 58-78, 227-229` — root gateway documentation.
- `[images] images/ploinky-network-gateway/Dockerfile` and `main.go` — gateway sources.
- `[images] .github/workflows/publish-ploinky-network-gateway.yml` — gateway publication.
- `[images] tests/image-definitions.test.mjs:320-365` — positive gateway definition tests.
- `[images] tests/image-definitions.test.mjs:390-605` — box contract and workflow assertions.
- `[images] .github/workflows/publish-ploinky-box-image.yml:5-45, 429-519` — mutable `master` source default, digest publication, and tag movement.
- `[ploinky] docs/superpowers/plans/**` — historical material that should not be rewritten by a runtime-removal gate.
- `[ploinky] cli/services/dependencyCache.js:441` — separate, non-agent dependency-install use of `slirp4netns:allow_host_loopback=true`.

**Required correction:** Update the root README, replace positive gateway tests with scoped absence gates, require the exact release SHA, treat remote registry retirement as a separate action, and allowlist authentication identities, historical plans, unrelated 8080 uses, generic TCP wording, and dependency-install slirp behavior.

## Answers to every review question

| # | Review question | Verified answer |
|---:|---|---|
| 1 | Does Podman reliably support explicit `host-gateway` on the custom `isolate=true` rootless bridges? | The primitives are supported, but the exact composition remains unverified. Podman documents explicit `host-gateway` and documents `isolate` as blocking traffic between isolated bridges. It does not guarantee nested rootless Podman with custom isolated bridges and multiple attachments. Native candidate-image gates are required. |
| 2 | Can the managed hosts machinery be deleted completely? | The generated file, bind mount, `--no-hosts`, and related lifecycle can be deleted. The default hosts base must not be used: pass `--hosts-file=none` plus the explicit host-gateway mapping. Podman still owns and generates the resulting `/etc/hosts`. |
| 3 | Does unresolved explicit host-gateway fail creation, or could it be silently omitted? | An explicit `host-gateway` request fails with an error; silent omission applies only to Podman's automatic aliases. In Ploinky's create-then-start flow, materialization can fail during `start` and leave configured residue, so the whole transaction must abort and clean up. |
| 4 | Is `server.listen(port, "0.0.0.0")` correct, and does outer publication still control exposure? | Yes. It is the minimal explicit IPv4 wildcard bind needed for gateway access. Existing outer port bindings continue to govern the supported physical-host/LAN mapping. Wildcard binding nevertheless broadens reachability to any peer able to route to a box interface. |
| 5 | Is the configured router port always available before managed agent creation? | No. Normal workspace start passes it, but several standalone and recovery paths omit it and can fall back to `routing.json` or 8080. One strict resolver must run before mutation, and every creation/restart boundary must receive its result explicitly. |
| 6 | Is keeping resource schema 2 while introducing status schema 3 coherent? | Yes, if the constants are separated. The bridge resource shape and exact labels remain unchanged, so resource schema `"2"` can be preserved. The status payload is a separate API and should use status schema `"3"`, retaining the current string type. |
| 7 | Does changing only `runtimePolicy` invalidate old agents without making bridges foreign? | Not with the current classifier. It changes the agent hash but calls the old exact-named container foreign. Add immutable ownership versus mutable contract drift. Bridge resources remain schema 2 and reusable because their shape is unchanged. |
| 8 | Does outer-box boot cleanup definitely remove the old gateway before attachments are reused? | The entrypoint orders cleanup before readiness and fails boot if exact-managed-label containers cannot be removed. That covers the old gateway and agents when the entrypoint actually runs. However, an ordinary restart reuses the old contract-3 image; the release still needs contract-4 destroy/recreate and a seeded multi-network regression test. |
| 9 | Is releasing the `ploinky-router` DNS alias safe given its authentication meaning? | Yes, for networking only. Remove the network reservation and gateway alias use. Preserve every JWT issuer/audience, discovery, MCP identity, client/server name, and SSO meaning. Add a regression proving that a container alias of the same name gains no privilege. |
| 10 | Are there production consumers of the current `gateway` status field? | One in-repository production renderer was found in `cli/commands/cli.js`, plus help text and unit coverage. No additional current in-repository consumer was found. External JSON consumers cannot be proven absent, so the schema-3 break requires release notes. |
| 11 | Which gateway helpers are dead, and which serve shared Podman behavior? | Gateway image, socket, probe, SELinux, forwarding, remote-machine, namespace-executor, and reconciliation helpers can go. Rootless proof, locks, label proof, bridge validation, aliases, multi-attachment, transaction, rollback, status, and prune foundations remain. See the detailed disposition below. |
| 12 | What docs, workflows, tests, or sibling references did the plan miss? | The plan missed runtime contract 4, exact release-SHA gating, active client port fallback, Cloudflared's fixed origin, root README and box assertions, registry retirement, and several active documentation/tests. See the detailed inventory below. |

## Gateway-helper disposition

The symbols below are primarily in `[ploinky] cli/services/networkLifecycle.js`.

| Remove as gateway-only | Retain or adapt as shared lifecycle behavior |
|---|---|
| Gateway constants, image/digest/capability/socket/minimal-host constants; `gatewayContainerName`; `expectedGatewayLabels` | Workspace hashing; `physicalNetworkName`; expected network and agent labels |
| `minimalHostsFileIsExact`; `writeMinimalHostsFile`; `hasExactMinimalHostsPolicy` | `firstRecord`; `labelsOf`; `containerRecordId`; exact/required-label helpers |
| `remoteShellCommand`; `parseRecordList`; `resolveRemoteMachineName`; `ensureNamespaceExecutor`; `executeInRootlessNamespace` | Rootless-Podman proof; lock acquisition, stale-lock reaping, and serialized lifecycle operations |
| Router-socket checks; gateway-image pull/inspection; forwarding proof; gateway-record validation; gateway probes/readiness; gateway SELinux handling | Exact bridge inspection and creation: driver, `isolate=true`, DNS, IPAM, subnet, gateway, and labels |
| `ensureGateway`; `reconcileManagedControlPlane`; gateway branches in preflight, prepare, rollback, status, and prune | Network-only preflight/prepare/rollback; alias verification; multi-attachment finalization; atomic replacement; start verification |
| Gateway-only adapter parameters and cached state | Read-only bridge validation before exact agent reuse; exact-owned empty-network prune |

Do not remove `fs`, `path`, `exactRuntimeAliases`, `semanticRuntimeAliases`, `hasExactLabels`, `assertExactLabels`, `hasRequiredLabels`, or `assertRequiredLabels` merely because gateway code also used them. They continue to support workspace identity, locking, bridge proof, aliases, and ownership.

## Missed and over-broad references

| Area | Required treatment |
|---|---|
| Gateway artifact | Delete `images/ploinky-network-gateway/{Dockerfile,main.go}` and its publication workflow. There is no per-image README. Update the root `container-image-builds/README.md` and replace positive gateway tests with scoped absence coverage. |
| Box contract and provenance | Update the box Dockerfile label, workflow contract checks, runtime-supervisor constants/tests, and both repositories' docs to contract 4. Require the exact 40-character source SHA instead of the workflow's current `master` default. |
| Runtime port fallbacks | Remove the active `127.0.0.1:8080` fallback in `Agent/client/AgentMcpClient.mjs` and pass the resolved port into watchdog, sandbox, enable, CLI, shell, reinstall, and restart paths. |
| Cloudflared | Update `basic/cloudflared/lib/routes.mjs`, IDE plugin settings, README, DS003, generated HTML, `docs/index.html`, `cloudflaredRoutes.test.mjs`, and `webPublishingRoutes.test.mjs` to consume the configured origin. |
| Router readiness and docs | Rewrite Unix-first readiness and related comments in `workspaceUtil.js`. Update DS003, DS004, DS011, and `code-derived-agent-lifecycle.md`. |
| Status consumer | Update `cli/commands/cli.js` and help text; release-note removal of `gateway` from network status JSON because external consumers are unknown. |
| Registry residue | Deleting source and workflow does not remove the already published image. Retire the exact remote tag as a separate, explicit release action after replacement gates pass. |
| Removal-gate exclusions | Do not rewrite historical `docs/superpowers/plans/**` by default. Preserve authentication/protocol uses of `ploinky-router`, unrelated 8080 services, generic TCP socket wording, and `dependencyCache.js`'s separate slirp use. |
| Stale documentation | Resolve the `container-image-builds` README's inconsistent old runtime-contract statements while moving current guidance to contract 4. |

## Missing tests and rollout risks

| Risk or assumption | Required release gate |
|---|---|
| Exact platform behavior | Native amd64 and arm64 runs using the exact contract-4 candidate digest; record Podman, Netavark, and Aardvark versions. |
| Router connectivity | Use the actual RoutingServer on a non-8080 port. Prove default and primary-then-secondary multi-attached agents resolve and connect. |
| Hosts contamination | Assert exactly one `host.containers.internal` mapping to the intended box host. Permit Podman's automatic `host.docker.internal` only if Ploinky never selects it. |
| Fail-closed transaction | Force host-gateway resolution failure. Verify create/start abort, candidate removal, previous-agent restoration, and no alternate transport or residue. |
| Global hosts policy | Cover `no_hosts=true` conflict and fail closed with a clear unsupported-configuration diagnostic. |
| Bridge isolation | Prove same-network connectivity first, then prove isolated bridges cannot communicate by peer IP. |
| Listener boundary | Prove a wildcard box listener is reachable and a `127.0.0.1`-only box listener is not. |
| Port plumbing | Test missing, corrupt, trailing-junk, zero, and greater-than-65535 ports at every creation/restart boundary; none mode bypasses resolution. |
| Contract hard cut | Reject contract 3 with destroy/recreate guidance; remove the contract-2 bypass; preserve named storage; seed a legacy multi-network gateway and agents before boot cleanup. |
| Status and prune | Test status schema `"3"`, full-label ownership, partial/spoof labels as `unknown`, and locked re-inspection before exact-owned empty-network removal. |
| Security regression | Run routed JWT, policy, replay, issuer, and audience tests unchanged; prove a `ploinky-router` network alias grants no privilege. |
| Release provenance | Require the exact Ploinky release SHA and finish all transport gates before gateway deletion and runtime-tag promotion. |
| External status users | Publish the status JSON break and migration note; absence of external consumers is unverified. |

## Corrected replacement plan

This plan supersedes the proposal under review. It preserves every stated product decision while correcting the implementation and rollout assumptions.

### 1. Runtime contract and hard-cut release

- Set the required outer box runtime contract to 4 in Ploinky, the box Dockerfile, workflow assertions, tests, and active documentation.
- Remove the existing contract-2 automatic upgrade bypass. New code rejects every non-4 box; old code rejects contract 4. This is a coordinated maintenance cut, not a rolling-compatible release.
- Require the exact 40-character Ploinky release SHA in the box build. Build and gate the contract-4 candidate before moving the runtime tag.
- Require `ploinky destroy` followed by recreation. Preserve the named storage volume. An ordinary restart is not the cutover mechanism.

### 2. Canonical router-port contract

- Create one strict resolver that accepts only exact decimal integers from 1 through 65535.
- RoutingServer startup may deliberately choose and persist the documented initial default, but agent creation never silently chooses 8080.
- Resolve before agent registry, container, or network mutation. Pass the validated port through start, enable, no-wait, CLI, shell, reinstall, restart, watchdog, sandbox, and client paths.
- None mode neither resolves nor injects a router port.
- Make Cloudflared consume the generated or injected configured router origin.

### 3. Agent transport by network mode

For `default` and `bridge` modes:

```text
PLOINKY_ROUTER_HOST=host.containers.internal
PLOINKY_ROUTER_PORT=<validated configured port>
PLOINKY_ROUTER_URL=http://host.containers.internal:<validated configured port>
```

Creation arguments must include:

```text
--hosts-file=none
--add-host host.containers.internal:host-gateway
```

For `host` mode, use `127.0.0.1` with the validated configured port and emit neither managed-hosts flag.

For `none` mode, inject no router variables or hosts flags.

Never select the Go gateway, `host.docker.internal`, a raw gateway IP, loopback for managed bridge modes, or `slirp4netns:allow_host_loopback=true`. Any create/start failure aborts the transaction and removes candidate residue.

### 4. RoutingServer and readiness

- Bind explicitly with `server.listen(port, "0.0.0.0", callback)`.
- Delete `.ploinky/run/router.sock`, the Unix listener, Unix-to-loopback relay, permissions, stale-socket cleanup, and Unix readiness.
- Retain TCP-only readiness against `127.0.0.1` from inside the box.
- Keep the existing outer physical-host/LAN publication policy.
- Document that wildcard binding also exposes RoutingServer to any peer able to route to a box interface; do not claim that outer publication controls every possible box-side path.

### 5. Managed network lifecycle

- Delete gateway image/container/socket/probe/reconciliation, forwarding, SELinux, remote-machine, and gateway-only namespace-executor logic.
- Remove router host, port, and URL from network preflight and network resource state. Provide them only as validated agent-creation inputs.
- Retain rootless-Podman proof, locks, exact bridge inspection and creation, `isolate=true`, aliases, multiple attachments, atomic replacement, rollback, and start verification.
- Simplify preflight, preparation, rollback, status, and prune to network-only behavior.
- Before exact agent reuse, retain read-only validation of every expected bridge. Router restart causes no network mutation.

### 6. Agent ownership and contract drift

- Change `runtimePolicy` from `managed-hosts-v1` to `box-host-gateway-v1`.
- Define immutable agent ownership as exact `managed=1`, `resource=agent`, resource schema 2, and matching workspace identity.
- Treat a differing contract hash as owned drift eligible for the existing atomic replacement transaction.
- Treat partial labels, spoofed workspace-only labels, and unrelated exact-name collisions as foreign or unknown.
- Do not add gateway-specific adoption, compatibility, or fallback branches.

### 7. Status, prune, and naming

- Preserve the managed-network resource schema as string `"2"` and add a separate status schema string `"3"`.
- Return `{ schemaVersion, workspaceHash, networks }` and remove the top-level `gateway` field.
- Classify an attachment as `agent` only when `managed=1`, `resource=agent`, resource schema 2, matching workspace hash, and a syntactically valid nonempty contract hash are all present. Otherwise classify it as `unknown`. Extra unrelated OCI labels remain allowed.
- Under the lifecycle lock, re-inspect and prune only exact-owned empty networks. Never disconnect attachments as part of prune.
- Remove only the network reservation and DNS alias use of `ploinky-router`. Preserve its authentication, discovery, MCP, client/server, and SSO identities.

### 8. Gateway artifact and image contract

- After the replacement transport gates pass, delete `images/ploinky-network-gateway` and its publication workflow.
- Update the root image-build README; do not attempt to delete a nonexistent image-local README.
- Replace positive gateway definition coverage with scoped absence checks.
- Update the box contract, workflow, smoke, and image-definition assertions.
- Pin the box base manifest digest or otherwise enforce and record the tested Podman, Netavark, and Aardvark tuple.
- Retire the published gateway registry tag separately after promotion. Source deletion alone does not remove it.
- Keep the general `slirp4netns` package unless separate analysis proves it unused.

### 9. Security and active documentation

- State that `isolate=true` continues to block traffic between isolated managed bridges.
- State that trusted agents can reach services bound to the box gateway address or wildcard interfaces.
- State that routed agent-to-agent MCP calls remain JWT- and policy-protected.
- State that direct calls to other reachable box services bypass router authorization and require those services' own protection.
- Do not claim that the host gateway exposes box loopback-only or Unix-socket services unless exact negative tests prove otherwise.
- Update CLI status/help, DS003, DS004, DS011, code-derived lifecycle documentation, the root image-build README, Cloudflared documentation, and the active runtime-documentation test without rewriting historical plans by default.

### 10. Verification and removal gates

- Add unit coverage for all four network modes, exact Podman arguments, strict ports, immutable ownership versus drift, status schema, spoof attachments, locked prune, TCP-only readiness, router restart, and create/start rollback.
- Replace the old workflow echo with a real nested-rootless smoke using the actual RoutingServer on a non-default port.
- Cover default and multi-attached agents, controlled `/etc/hosts`, wildcard-positive and loopback-negative listeners, same-network positive checks, isolated cross-bridge negatives, egress, and explicit host-gateway failure without residue.
- Run the exact candidate natively on amd64 and arm64 before gateway deletion or runtime-tag promotion.
- Run existing routed JWT, policy, replay, issuer, and audience tests unchanged.
- Scope source-removal searches to gateway transport symbols, the exact Unix path/listener, generated managed hosts, workflow/artifact paths, managed-agent slirp fallback, and fixed router endpoints.
- Allowlist protocol identities, unrelated ports, historical plans, generic TCP wording, and dependency-install networking.

### 11. One-time cleanup and release operations

- On the recreated contract-4 box, run existing exact-managed-label boot cleanup before readiness.
- Seed an old gateway-shaped container and agents across multiple isolated bridges in CI to prove cleanup and subsequent network reuse.
- After managed containers are gone, remove only the known stale `router.sock`, `managed-hosts`, and exact cached gateway image/reference.
- Tolerate absence and confirm no container references the image before removal.
- Do not perform broad image, container, volume, or network pruning.
- Preserve the named storage volume and reusable exact-owned schema-2 bridges.
- Publish the status-schema break, destroy/recreate requirement, exposure model, and absence of fallback as explicit release notes.

## Current verification baseline

The review directly ran:

```text
node --test \
  tests/unit/networkContract.test.mjs \
  tests/unit/networkLifecycle.test.mjs \
  tests/unit/agentServiceManager.test.mjs
```

All 24 targeted network contract, lifecycle, and agent-service tests passed. Parallel review passes also reported 77 broader Ploinky tests and 14 image-definition tests passing.

These results establish only that the current gateway-era working tree is internally consistent. No real nested-Podman resource smoke was run during this review, and none of these mocked or definition-level suites proves the replacement transport.

## Official Podman sources

1. [Podman run documentation: `--add-host`, explicit host-gateway failure, automatic internal aliases, and default hosts base](https://docs.podman.io/en/latest/markdown/podman-run.1.html)
2. [Podman run documentation: `--hosts-file=none`](https://docs.podman.io/en/latest/markdown/podman-run.1.html#--hosts-filepath--none--image)
3. [Podman network-create documentation: bridge `isolate` and managed mode](https://docs.podman.io/en/latest/markdown/podman-network-create.1.html)
4. [Podman v5.8.2 hosts construction order](https://github.com/containers/podman/blob/v5.8.2/vendor/go.podman.io/common/libnetwork/etchosts/hosts.go#L101-L128)
5. [Podman v5.8.2 hosts write and deduplication behavior](https://github.com/containers/podman/blob/v5.8.2/vendor/go.podman.io/common/libnetwork/etchosts/hosts.go#L302-L339)
6. [Podman v5.8.2 explicit host-gateway error path](https://github.com/containers/podman/blob/v5.8.2/vendor/go.podman.io/common/libnetwork/etchosts/hosts.go#L236-L259)
7. [Podman v5.8.2 empty hosts-base implementation](https://github.com/containers/podman/blob/v5.8.2/vendor/go.podman.io/common/libnetwork/etchosts/util.go#L10-L29)

The source citations are pinned to Podman v5.8.2 for deterministic implementation evidence. The current box derives from a mutable base, so the actual candidate's Podman, Netavark, and Aardvark versions must be recorded and the complete topology revalidated before release.

## Review boundary

This was a review-only task. No existing source files or runtime resources were changed. This Markdown report is the only deliverable created from the findings.
