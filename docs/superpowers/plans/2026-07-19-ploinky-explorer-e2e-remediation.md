# Ploinky Explorer E2E Remediation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the Ploinky contract-5 release gate consume explicit operator-approved local-only edge inputs, validate private Router listeners against independently observed rootless topology, and run Explorer's Chromium router/auth smoke before either architecture digest can be promoted.

**Architecture:** Ploinky remains the authority for desired-state validation, runtime topology evidence, exact listener profiles, and the lifetime of the full-graph smoke. The image-release workflow supplies protected operator input, prepares an independent Explorer browser checkout at the same immutable revision, and cannot export a candidate digest until Ploinky has run the fixed browser command and revalidated the boundary. Explorer continues to own the browser oracle and its runtime contract documentation; it does not gain a publication, forwarding, or authorization workaround.

**Tech Stack:** Node.js 24 ESM, `node:test`, rootless Podman/Netavark, `ip -j -4 address show`, `ss -H -lntup`, GitHub Actions, Docker Buildx, npm, Playwright 1.60 Chromium.

## Global Constraints

- Classify and execute this remediation as **consequential**: it changes release gates, runtime topology validation, E2E smoke lifetime, and two coupled release repositories plus Explorer documentation.
- Follow the consequential planner -> consequential implementer -> fresh-context consequential reviewer pipeline in `/Users/danielsava/work/file-parser/AGENTS.md`; do not combine planning, implementation, and acceptance in one agent context.
- Start Ploinky work from `/Users/danielsava/work/file-parser/ploinky/.worktrees/ploinky-phase1-http-router-proxy-mvp`, branch `ploinky-phase1-http-router-proxy-mvp`, base commit `3dc135c`.
- Start `container-image-builds` work from `/Users/danielsava/work/file-parser/container-image-builds`, `main`, base commit `9fd2641`.
- Treat `/Users/danielsava/work/file-parser/AssistOSExplorer/tests/smoke/specs/00-router-auth.spec.mjs` as the existing browser oracle. Do not weaken, skip, retry around, or replace it.
- Do not commit a public IPv4 literal, desired-state candidate, secret value, Playwright artifact, or generated browser dependency.
- An operational media address must be the operator's actual globally routable IPv4. There is no discovery, documentation-range value, private-range value, loopback value, or hard-coded fallback.
- The release desired state is local-only: no `cloudflare`, no public `hosts`, no `turn`, and therefore no DNS, tunnel, or external publication mutation.
- Keep the physical boundary exactly `127.0.0.1:18080 -> 8080/tcp` plus `0.0.0.0:7882 -> 7882/udp`. Never publish private Router `8081`, a product service port, or a third mapping.
- Keep private Router loopback `127.0.0.1:8081` mandatory. A managed gateway is required only when its exact gateway address is assigned to the exact managed bridge interface reported by the same current Podman network generation.
- Treat missing, malformed, stale, or cross-interface topology evidence as a failure. Only a proved unassigned managed gateway may remain inactive.
- Do not bind a wildcard, the outer-facing physical interface, or an unrelated address; do not add a forwarder, firewall substitute, direct-target path, public-listener fallback, or alternate authorization path.
- The fixed browser command is `SMOKE_BASE_URL=http://127.0.0.1:18080 npm test -- --project=chromium specs/00-router-auth.spec.mjs`, run from the independently checked-out `AssistOSExplorer/tests/smoke` directory.
- Run the fixed browser command inside `container/smoke-runtime.mjs` after full-graph listener convergence and before its existing `finally` cleanup. A browser failure must make the smoke process nonzero and still execute cleanup.
- Reinspect exact outer publications and recollect owner-aware listeners after Playwright exits, including when Playwright fails.
- Both native `linux/amd64` and `linux/arm64` matrix jobs must pass before digest artifacts exist. The merge job must remain unable to move `docker.io/assistos/ploinky-box:runtime` without both artifacts.
- Do not use `continue-on-error`, a conditional bypass, a synthetic fixture as operational configuration, or an `if: always()` digest export. `if: always()` is permitted only for deleting the exact temporary desired-state file.
- Preserve the current Ploinky and Explorer specification statuses as partially implemented. This remediation validates an inactive rootless bridge lane; it does not resolve Ploinky DS004 Question #8.
- Follow repository documentation synchronization rules. Do not manually edit `docs/specs/matrix.md`; frontmatter is unchanged, so verify that the matrix stays unchanged.
- Do not deploy from a local machine, change Cloudflare/DNS, or move the mutable runtime tag outside the reviewed GitHub Actions workflow.

---

## Confirmed root causes and chosen design

| Area | Confirmed evidence | Remediation decision |
| --- | --- | --- |
| Operator inputs | Run `29658478054` reached `FULL_EXPLORER_GRAPH requires both SMOKE_EDGE_DESIRED_FILE and SMOKE_MEDIA_PUBLIC_IPV4`; the workflow supplies only immutable repository refs. | A protected GitHub Environment named `ploinky-box-runtime-release` owns secret `PLOINKY_SMOKE_EDGE_DESIRED_JSON`. A required dispatch input `media_public_ipv4` provides an independent operator confirmation. Each matrix job uses trap-owned runner-temp files with mode `0600`, validates before building, rematerializes only for the full gate, and never persists either value through `$GITHUB_ENV`. |
| Desired-state contract | `smoke-runtime.mjs` performs partial checks, while `cli/services/edgeGeneration.js` owns the full schema and public-IP normalizer. | Export the production desired-state normalizer and make a focused smoke-config module call it. Reject any normalized drift, non-local publication fields, external relay fields, extra capability owners, or internal consumers. |
| Listener expectation | Run `29658478054` observed only `127.0.0.1:8081`; the profile expected `10.89.0.1,127.0.0.1`. `privateListenerSet.js` intentionally records `EADDRNOTAVAIL` managed gateways as inactive while preserving loopback. | Replace “every discovered gateway must bind” with “loopback plus every assigned managed-interface gateway must bind.” Collect assigned IPv4/interface evidence independently through `ip`, correlate it with Podman's exact `network_interface`, and fail on missing evidence or cross-interface assignment. |
| Security boundary | Merely setting `minMatches: 1` would accept a missing gateway even where the gateway is available. Trusting Router self-report alone would not independently prove the namespace. | Keep exact-set validation. The eligible set is derived from Podman network inspection plus kernel address inventory, not from Router claims or absence of a socket. Unknown and wildcard `8081` sockets remain unreviewed failures. |
| Later native hard-cut gate | After the earlier blockers are removed, the current workflow still unconditionally requires every child to connect to `host.containers.internal:8081`, contradicting an observed inactive managed-gateway lane. | Classify each child's unique resolution from the same current managed-network/kernel evidence. Require reachability only for an assigned managed gateway; require refusal for an inactive managed gateway or assigned non-managed transport; fail on unknown or ambiguous resolution. Repeat after Router restart. |
| Browser lifetime | `smoke-runtime.mjs` always destroys the box in `finally`; the workflow has no browser step. | Ploinky runs one fixed, non-shell Explorer command while the graph is alive. The workflow prepares a second Explorer checkout at the same SHA so installing Playwright does not contaminate the graph source copied into the box. |
| Promotion | Candidate images were pushed by digest, but digest export and the merge/tag job were skipped after the gate failure. | Preserve this dependency shape and add ordering tests: input validation before build; browser and post-browser validation before digest export; two architecture artifacts before tag movement. |

Rejected approaches:

1. Reducing the private-listener rule to loopback with `minMatches: 1` is rejected because it cannot distinguish an unavailable bridge address from a silently missing eligible bind.
2. Accepting any listener whose address equals an IPAM gateway is rejected because the same address on an unrelated or outer-facing interface would cross the security boundary.
3. Reading only `privateListenerSet.snapshot()` is rejected as the release oracle because it is application self-report rather than independent namespace evidence.
4. Running the smoke in the background and coordinating ready/stop files is rejected because it introduces timeout, signal, and cleanup races around the release gate.
5. Passing an arbitrary command or shell string into the smoke is rejected because `true`, a wrapper, or shell expansion could replace the browser oracle. Ploinky must invoke the fixed argv directly with `spawnSync` and `shell: false`.

## Exact operator input contract

The protected environment secret and the local operator file contain one JSON object with these exact semantics:

| JSON path | Required value |
| --- | --- |
| `schemaVersion` | Integer `1`. |
| `hosts` | Empty object. |
| `media.publicIPv4` | The operator's actual globally routable IPv4, byte-for-byte equal to `SMOKE_MEDIA_PUBLIC_IPV4` after the production normalizer validates it. |
| `media.addressMode` | `direct` only when that public address is assigned directly to the media host; `nat-forward` only when the operator has verified the corresponding forwarding path. |
| `security.hostNetworkAllowedInstances` | Array with the sole entry `webmeetInfra/liveKitServerAgent`. |
| `security.internalServiceConsumers` | Empty object. |
| `cloudflare`, `turn`, and every other root key | Absent. |

The file must be an absolute, non-symlink, regular file owned by the current process user, outside a repository checkout and outside `.ploinky`, no larger than `EDGE_DESIRED_CANDIDATE_MAX_BYTES`, and unreadable by group or other users. The validator must walk parent directories and reject any `.git` checkout marker. It must parse the file, normalize it with `normalizeEdgeDesiredState`, require deep equality with the submitted object, enforce the exact local-only shape above, and print only a value-free success summary.

Local operators create and approve this file outside all checkouts, set mode `0600`, then export `SMOKE_EDGE_DESIRED_FILE` and `SMOKE_MEDIA_PUBLIC_IPV4`. CI operators configure the same JSON as environment secret `PLOINKY_SMOKE_EDGE_DESIRED_JSON`, protect environment `ploinky-box-runtime-release` with required reviewers, and type the same IPv4 into the required workflow-dispatch field `media_public_ipv4`. The separate values must match; neither can be derived from the other.

## Ownership and file map

| Owner | Exact files | Responsibility |
| --- | --- | --- |
| Ploinky specs/docs | `docs/specs/DS004-runtime-execution-and-isolation.md`, `docs/specs/DS005-routing-and-web-surfaces.md`, `docs/specs/DS009-observability.md`, `docs/specs/DS010-testing-and-verification.md`, `docs/runtime.html`, `docs/interfaces.html`, `docs/operations.html`, `docs/architecture.html`, `container/README.md` | Define mandatory loopback, assigned-managed-interface eligibility, explicit inactive/reachability evidence, local-only operator input, and browser-before-cleanup release semantics. Keep Question #8 open. |
| Ploinky desired-state validation | `cli/services/edgeGeneration.js`, new `container/full-graph-smoke-config.mjs`, new `container/validate-full-graph-smoke-inputs.mjs`, new `tests/unit/fullGraphSmokeConfig.test.mjs`, `tests/unit/edgeGenerationHardCut.test.mjs`, `tests/unit/smokeFullGraphPrerequisites.test.mjs`, `container/smoke-runtime.mjs` | Reuse the production schema, enforce the exact release candidate, validate the independent E2E checkout, invoke the fixed browser argv, aggregate post-browser evidence, and preserve cleanup. |
| Ploinky listener validation | new `container/listener-address-inventory.mjs`, new `container/private-router-reachability.mjs`, `container/listener-network-inventory.mjs`, `container/listener-collector.mjs`, `container/listener-inventory.mjs`, `container/listener-inventory-tests.mjs`, new `tests/unit/privateRouterReachability.test.mjs`, `container/profiles/routing-graph-listeners.json`, `container/profiles/full-explorer-listeners.json`, `container/smoke-runtime.mjs` | Collect stable kernel IPv4/interface evidence, correlate it with exact managed network interfaces, calculate the exact eligible bind set, report active/inactive gateway state, and expose a fixed topology-classified child reachability gate. |
| `container-image-builds` | `.github/workflows/publish-ploinky-box-image.yml`, `tests/image-definitions.test.mjs`, `README.md` | Protect and materialize operator input, validate before build, prepare the same-SHA browser checkout, run both native gates, clean the temporary file, and preserve promotion ordering. |
| AssistOSExplorer | `docs/specs/DS06-ploinky-runtime-invariants.md`, `docs/architecture.html`, `docs/deploy-skills-explorer.md`, `docs/regression/headless-browser-regression.md`, `tests/smoke/README.md`; existing oracle `tests/smoke/specs/00-router-auth.spec.mjs` | Clarify that inactive gateway evidence does not activate bridge routing, document the baseline release command, and retain ownership of browser expectations. No Explorer product-code or test weakening is planned. |
| Workspace docs | `docs/superpowers/plans/2026-07-19-ploinky-explorer-e2e-remediation.md` | This implementation and acceptance plan only. |

---

### Task 0: Pin the remediation bases and preserve unrelated work

**Repositories:** Ploinky MVP worktree, `container-image-builds`, and AssistOSExplorer.

**Files:** No changes.

- [ ] **Step 1: Verify the supplied pushed bases before editing**

Run:

```bash
cd /Users/danielsava/work/file-parser/ploinky/.worktrees/ploinky-phase1-http-router-proxy-mvp
test "$(git branch --show-current)" = ploinky-phase1-http-router-proxy-mvp
test "$(git rev-parse HEAD)" = 3dc135c09cd1b42e031029c2af8f003465609022
test "$(git rev-parse origin/ploinky-phase1-http-router-proxy-mvp)" = 3dc135c09cd1b42e031029c2af8f003465609022
git status --short

cd /Users/danielsava/work/file-parser/container-image-builds
test "$(git branch --show-current)" = main
test "$(git rev-parse HEAD)" = 9fd26410a7b5f004de69dc01f0cbe5515cb3d510
test "$(git rev-parse origin/main)" = 9fd26410a7b5f004de69dc01f0cbe5515cb3d510
git status --short

cd /Users/danielsava/work/file-parser/AssistOSExplorer
git rev-parse HEAD
git status --short
```

Expected: the two supplied repositories match their exact pushed commits. Record the Explorer SHA printed by the command as the documentation and graph/E2E comparison base. If any repository has overlapping local changes, stop and preserve them; do not reset, clean, stash, or overwrite user work. If only unrelated changes exist, record them and keep every task's staging path-limited as shown below.

---

### Task 1: Clarify the Ploinky normative contract before code changes

**Repository:** `/Users/danielsava/work/file-parser/ploinky/.worktrees/ploinky-phase1-http-router-proxy-mvp`

**Files:**
- Modify: `docs/specs/DS004-runtime-execution-and-isolation.md` under the private-listener implementation-status text and Question #8
- Modify: `docs/specs/DS005-routing-and-web-surfaces.md` in the opening dual-listener contract
- Modify: `docs/specs/DS009-observability.md` in topology/release evidence
- Modify: `docs/specs/DS010-testing-and-verification.md` in release-gate requirements
- Modify: `docs/runtime.html`
- Modify: `docs/interfaces.html`
- Modify: `docs/operations.html`
- Modify: `docs/architecture.html`
- Modify: `container/README.md`
- Verify unchanged: `docs/specs/matrix.md`

**Interfaces:**
- Consumes: Existing `privateListenerSet` behavior: loopback is mandatory; only managed `EADDRNOTAVAIL` is an inactive condition; every other bind error is fatal.
- Produces: The normative three-state listener contract `required-loopback`, `required-assigned-managed-gateway`, and `inactive-unassigned-managed-gateway`, plus the corresponding topology-classified child-reachability evidence used by Tasks 3-6.

- [ ] **Step 1: Add the exact normative distinction to DS004 and DS005**

Add prose with all of these assertions, without changing either frontmatter status:

```text
127.0.0.1:8081 is required whenever RoutingServer is ready. For each current
Ploinky-managed bridge, the IPAM gateway is eligible only when kernel address
inventory proves that exact gateway is assigned to the exact network_interface
reported by the same current Podman network inspection. Every eligible gateway
must have exactly one private Router listener. A gateway absent from that exact
interface is explicitly inactive and must have no listener; it is not a release
failure by itself because managed bridge reachability remains unavailable.
Missing or stale address evidence, assignment on a different interface, a
missing eligible listener, an extra listener, a wildcard, or an unrelated bind
fails closed. This validation rule neither authorizes an outer-facing bind nor
resolves DS004 Question #8.
```

- [ ] **Step 2: Add the release sequence to DS010 and the HTML/operator docs**

Document this order exactly: validate protected desired input -> build immutable untagged candidate -> start full graph -> validate outer publication -> validate owner-aware listeners -> run fixed Chromium router/auth test -> revalidate publication and listeners -> clean up -> pass the remaining hard-cut/native safety gates, including topology-classified child private reachability or refusal -> export candidate digest artifact. State that a failure in any item prevents digest-artifact export and therefore prevents mutable-tag promotion. Untagged candidate content may exist after a failed gate.

In DS009, define the value-safe evidence records for both managed-gateway listener state and child resolution/reachability state. A child must reach private `8081` only when `host.containers.internal` resolves to an assigned managed gateway. Resolution to an inactive managed gateway or an assigned non-managed outer interface must refuse private `8081`; an ambiguous, wildcard, loopback, or otherwise unclassified resolution fails the gate. State explicitly that expected refusal is evidence of the preserved fail-closed boundary, not a reason to add a bind or forwarder.

- [ ] **Step 3: Verify documentation invariants**

Run:

```bash
cd /Users/danielsava/work/file-parser/ploinky/.worktrees/ploinky-phase1-http-router-proxy-mvp
rg -n "required.*127\.0\.0\.1:8081|assigned.*network_interface|inactive.*unassigned|Question #8|00-router-auth" \
  docs/specs/DS004-runtime-execution-and-isolation.md \
  docs/specs/DS005-routing-and-web-surfaces.md \
  docs/specs/DS009-observability.md \
  docs/specs/DS010-testing-and-verification.md \
  docs/runtime.html docs/interfaces.html docs/operations.html docs/architecture.html container/README.md
git diff --exit-code -- docs/specs/matrix.md
node --test tests/unit/runtimeDocumentation.test.mjs
```

Expected: every contract phrase is present, `matrix.md` has no diff, and the documentation test passes.

- [ ] **Step 4: Commit the Ploinky contract clarification**

```bash
git add docs/specs/DS004-runtime-execution-and-isolation.md \
  docs/specs/DS005-routing-and-web-surfaces.md \
  docs/specs/DS009-observability.md \
  docs/specs/DS010-testing-and-verification.md \
  docs/runtime.html docs/interfaces.html docs/operations.html docs/architecture.html container/README.md
git commit -m "docs: define topology-aware private listener gate"
```

---

### Task 2: Synchronize Explorer's contract and browser release runbooks

**Repository:** `/Users/danielsava/work/file-parser/AssistOSExplorer`

**Files:**
- Modify: `docs/specs/DS06-ploinky-runtime-invariants.md`
- Modify: `docs/architecture.html`
- Modify: `docs/deploy-skills-explorer.md`
- Modify: `docs/regression/headless-browser-regression.md`
- Modify: `tests/smoke/README.md`
- Verify unchanged: `docs/specs/matrix.md`
- Preserve unchanged: `tests/smoke/specs/00-router-auth.spec.mjs`

**Interfaces:**
- Consumes: The topology states defined in Task 1 and the existing Playwright package scripts.
- Produces: One documented baseline release oracle with exact base URL, project, and spec path.

- [ ] **Step 1: Clarify DS06 without claiming bridge activation**

Add the same required-loopback/eligible-gateway/inactive-gateway distinction. Explicitly retain all current prohibitions on wider bind, forwarder, direct target, and alternate authorization. Add to Verification that the baseline release lane must run the fixed Chromium command after the Ploinky full graph and listener gate succeed.

- [ ] **Step 2: Add the exact baseline command to every applicable runbook**

Use this command verbatim and state that the Ploinky release harness runs it before destroying the graph:

```bash
cd /Users/danielsava/work/file-parser/AssistOSExplorer/tests/smoke
SMOKE_BASE_URL=http://127.0.0.1:18080 npm test -- --project=chromium specs/00-router-auth.spec.mjs
```

Document that it proves the dashboard, Explorer shell, and routed WebChat shell through the Router. Do not describe this baseline as the separate WebMeet external-network or screen-share gate.

- [ ] **Step 3: Verify docs and preserve the oracle**

Run:

```bash
cd /Users/danielsava/work/file-parser/AssistOSExplorer
rg -n "127\.0\.0\.1:18080|00-router-auth\.spec\.mjs|inactive.*fail-closed|Question #8" \
  docs/specs/DS06-ploinky-runtime-invariants.md docs/architecture.html \
  docs/deploy-skills-explorer.md docs/regression/headless-browser-regression.md tests/smoke/README.md
git diff --exit-code -- docs/specs/matrix.md tests/smoke/specs/00-router-auth.spec.mjs
```

Expected: the exact command and fail-closed wording are present, while the matrix and browser spec remain unchanged.

- [ ] **Step 4: Commit the Explorer contract documentation**

```bash
git add docs/specs/DS06-ploinky-runtime-invariants.md docs/architecture.html \
  docs/deploy-skills-explorer.md docs/regression/headless-browser-regression.md tests/smoke/README.md
git commit -m "docs: define Explorer runtime release baseline"
```

---

### Task 3: Make listener validation depend on stable managed-interface evidence

**Repository:** `/Users/danielsava/work/file-parser/ploinky/.worktrees/ploinky-phase1-http-router-proxy-mvp`

**Files:**
- Create: `container/listener-address-inventory.mjs`
- Create: `container/private-router-reachability.mjs`
- Modify: `container/listener-network-inventory.mjs`
- Modify: `container/listener-collector.mjs`
- Modify: `container/listener-inventory.mjs`
- Modify: `container/listener-inventory-tests.mjs`
- Create: `tests/unit/privateRouterReachability.test.mjs`
- Modify: `container/profiles/routing-graph-listeners.json`
- Modify: `container/profiles/full-explorer-listeners.json`
- Modify: `container/smoke-runtime.mjs`
- Regression test: `tests/unit/privateListenerSet.test.mjs`

**Interfaces:**
- Produces: `parseOuterIPv4AddressInventory(stdout): ReadonlyArray<{ifindex:number, interfaceName:string, address:string, prefixLength:number, scope:string}>`.
- Produces: `sameOuterIPv4AddressGeneration(left, right): boolean`.
- Produces: `collectOuterIPv4AddressInventory({run, outerContainer})` and `assertOuterIPv4AddressInventoryCurrent({run, outerContainer, expected})`.
- Produces: `classifyManagedGatewayAssignments({managedNetworks, outerIPv4Addresses})` with exact assigned/inactive gateway sets, and `classifyResolvedHostGateway({resolvedIPv4, managedNetworks, outerIPv4Addresses})` with state `assigned-managed-gateway`, `inactive-managed-gateway`, or `assigned-non-managed`.
- Produces: fixed CLI `node /opt/ploinky/container/private-router-reachability.mjs --port 8081 --agent default-agent --agent multi-agent`, which collects current evidence inside the outer box and enforces topology-classified success/refusal without printing resolved addresses.
- Extends: `buildManagedNetworkRecord({inspection, listedName, workspaceHash})` with required `networkInterface: string` from Podman's `network_interface`/`NetworkInterface`.
- Extends: listener inventory input with `outerIPv4Addresses` and validation output with `managedGatewayStates` records containing `networkName`, `networkInterface`, `gateway`, and `state` (`assigned-required` or `unassigned-inactive`).
- Replaces: profile value `loopback-and-managed-gateways` with `loopback-and-assigned-managed-gateways`.

- [ ] **Step 1: Write failing parser, generation, and topology-matrix tests**

Add tests in `container/listener-inventory-tests.mjs` that cover this complete matrix:

| Case | Expected result |
| --- | --- |
| `ip -j` reports `127.0.0.1` on `lo` and a gateway on its exact `podman7` interface; both sockets exist | Pass; gateway state is `assigned-required`. |
| Managed gateway is absent from all `ip -j` records; only loopback socket exists | Pass; gateway state is `unassigned-inactive`. |
| Gateway is assigned to exact interface but its socket is missing | Fail with exact expected bind-set diagnostic. |
| Gateway is unassigned but a socket exists at it | Fail as an unreviewed listener. |
| Gateway address appears on `eth0` instead of its inspected `podman7` | Fail with an interface-mismatch diagnostic. |
| Managed networks exist but address evidence is missing or empty | Fail; never infer that every gateway is inactive. |
| Loopback socket is missing | Fail. |
| Duplicate loopback, duplicate gateway, wildcard `0.0.0.0:8081`, unrelated physical address, or unknown specific address | Fail. |
| Address inventory changes between collection and final check | Fail with `outer IPv4 address generation changed`. |
| Legacy profile value `loopback-and-managed-gateways` | Fail profile compilation as unsupported. |
| Child resolution is the one assigned managed gateway | Classify `assigned-managed-gateway`; the release integration must require private `8081` reachability. |
| Child resolution is an inactive managed gateway | Classify `inactive-managed-gateway`; the release integration must require private `8081` refusal. |
| Child resolution is a specific IPv4 assigned to a non-managed, non-loopback outer interface | Classify `assigned-non-managed`; the release integration must require private `8081` refusal. |
| Child resolution is empty, ambiguous, loopback, wildcard, or not in current address/network evidence | Fail classification; do not infer a reachability expectation. |

Use this exact valid `ip` fixture shape in the parser test:

```js
const addressFixture = JSON.stringify([
    {
        ifindex: 1,
        ifname: 'lo',
        flags: ['LOOPBACK', 'UP', 'LOWER_UP'],
        addr_info: [{ family: 'inet', local: '127.0.0.1', prefixlen: 8, scope: 'host' }],
    },
    {
        ifindex: 7,
        ifname: 'podman7',
        flags: ['BROADCAST', 'MULTICAST', 'UP'],
        addr_info: [{ family: 'inet', local: '10.89.0.1', prefixlen: 24, scope: 'global' }],
    },
]);
```

- [ ] **Step 2: Run the focused test and verify the expected failure**

Run:

```bash
cd /Users/danielsava/work/file-parser/ploinky/.worktrees/ploinky-phase1-http-router-proxy-mvp
node container/listener-inventory-tests.mjs
```

Expected: FAIL because `listener-address-inventory.mjs`, `networkInterface`, `outerIPv4Addresses`, and the new dynamic bind-set mode do not exist.

- [ ] **Step 3: Implement the focused kernel-address parser**

Create `container/listener-address-inventory.mjs` with strict JSON-array parsing. Accept only IPv4 `addr_info` records with a positive integer `ifindex`, a nonempty interface name matching `^[A-Za-z0-9_.:-]+$`, IPv4 `local`, prefix length `1..32`, and nonempty scope. Reject duplicate `interfaceName/address` pairs and require exact `127.0.0.1` evidence on `lo`. Sort by interface name, address, and prefix length before freezing. `sameOuterIPv4AddressGeneration` compares the normalized arrays byte-for-byte through `JSON.stringify`.

The exported record constructor must be equivalent to:

```js
Object.freeze({
    ifindex: Number(link.ifindex),
    interfaceName: String(link.ifname),
    address: String(address.local),
    prefixLength: Number(address.prefixlen),
    scope: String(address.scope),
})
```

- [ ] **Step 4: Bind managed networks to their exact inspected interface**

In `buildManagedNetworkRecord`, read `inspection.NetworkInterface || inspection.network_interface`, validate it with the same interface-name pattern, and include `networkInterface` in the frozen record. Reject missing interfaces and reject reuse of either a gateway or a network interface across current managed network records.

- [ ] **Step 5: Collect and recheck address evidence around listener collection**

Add `ip` to `COLLECTOR_TOOLS`. Collect with exact argv:

```js
['exec', '--user', '0', outerContainer, 'ip', '-j', '-4', 'address', 'show']
```

In `collectBoxListenerInventory`, take the address snapshot after managed-network inspection and before `ss`; after container and network current-generation checks, recollect it and reject drift. Return `outerIPv4Addresses` with listeners, containers, and managed networks. Apply the same before/after address check to the routing-probe collector in `smoke-runtime.mjs`.

- [ ] **Step 6: Implement the exact topology-aware bind-set calculation**

Implement `classifyManagedGatewayAssignments` once in `listener-address-inventory.mjs`, and consume that result in `validateListenerInventory`:

1. Require nonempty `outerIPv4Addresses` whenever the profile contains `loopback-and-assigned-managed-gateways`.
2. For each managed network, find address records equal to its gateway.
3. Zero matches produces state `unassigned-inactive`.
4. Exactly one match on `network.networkInterface` produces state `assigned-required` and adds the gateway to the eligible set.
5. A match on another interface or multiple matches is a validation error.
6. Match the private Router rule only on `127.0.0.1` or an eligible gateway.
7. Compare the matched addresses exactly against sorted `['127.0.0.1', ...eligibleGateways]`.

Keep `exclusiveSocket` behavior and all existing owner, PID, container, sensitive-port, and forbidden-socket checks unchanged.

Implement `classifyResolvedHostGateway` in the same module. It accepts exactly one normalized child-resolved IPv4 and the current snapshots. It returns `assigned-managed-gateway` when the address is an assigned managed gateway, `inactive-managed-gateway` when it is an inspected but unassigned managed gateway, and `assigned-non-managed` only when it is assigned to a current non-loopback interface that is not any managed network's `networkInterface`. Reject empty or multiple resolutions, `0.0.0.0`, loopback, a gateway assigned on the wrong interface, and every address absent from current evidence. This pure classifier is the sole authority that Task 6 may use for the native child reachability assertion; do not duplicate the topology decision in workflow shell.

Run `node container/listener-inventory-tests.mjs`. Expected: PASS for the full parser, assignment, classifier, exact bind-set, drift, wildcard, and wrong-interface matrix written in Step 1.

- [ ] **Step 7: Write the native child-reachability tests first**

In `privateRouterReachability.test.mjs`, use injected command results to cover all three classified states, success/refusal inversion, ambiguous resolution, spawn error, network/address drift, invalid/duplicate agent names, and attempted port override away from `8081`. Assert that unknown flags fail and that there is no host, command, or address override. Run:

```bash
node --test tests/unit/privateRouterReachability.test.mjs
```

Expected: FAIL because `container/private-router-reachability.mjs` does not exist.

- [ ] **Step 8: Implement the fixed native child-reachability gate**

Create `private-router-reachability.mjs` with injectable command execution for unit tests and the fixed CLI above. It must:

1. collect current managed networks using `podman network ls --format json`, exact `podman network inspect`, and the existing managed-network parsers;
2. collect current kernel evidence with `ip -j -4 address show` and `parseOuterIPv4AddressInventory`;
3. resolve `host.containers.internal` inside each exact agent with `podman exec AGENT getent ahostsv4 host.containers.internal`, deduplicate the first column, and require one IPv4;
4. classify that address through `classifyResolvedHostGateway`;
5. run only `podman exec AGENT nc -z -w 3 host.containers.internal 8081`; require exit zero for `assigned-managed-gateway`, and require nonzero with no spawn error for `inactive-managed-gateway` or `assigned-non-managed`;
6. recollect managed networks and kernel addresses after all probes and reject either generation changing; and
7. print only `PRIVATE_ROUTER_CHILD_REACHABILITY agent=NAME topology=STATE expectation=reachable|refused PASS`, never the address.

Run the focused test again. Expected: PASS.

- [ ] **Step 9: Update both checked-in profiles**

Set each `router-private.dynamicBindSet` to `loopback-and-assigned-managed-gateways`. Update the rationale to say loopback is mandatory, assigned managed-interface gateways are mandatory, and unassigned gateways remain inactive. Retain `reviewedSensitive: true`, `minMatches: 1`, the exact owner pattern, port `8081`, and no static or wildcard bind selector.

- [ ] **Step 10: Emit explicit active/inactive evidence**

Extend routing and full-graph smoke output with one `IN_BOX_MANAGED_GATEWAY_STATE` JSON record per network. Its exact keys are `phase`, `networkName`, `networkInterface`, `gateway`, and `state`; `state` is exactly `assigned-required` or `unassigned-inactive`.

Do not treat `unassigned-inactive` as proof that managed bridge calls work. Preserve the current `IN_BOX_MANAGED_NETWORK` and owner-aware listener records.

- [ ] **Step 11: Run focused and regression tests**

Run:

```bash
node container/listener-inventory-tests.mjs
node --test tests/unit/privateListenerSet.test.mjs \
  tests/unit/listenerInterfaceClassifier.test.mjs \
  tests/unit/privateRouterReachability.test.mjs
```

Expected: all tests pass. The existing `EADDRNOTAVAIL` test still proves loopback starts and an unavailable gateway stays out of the active address set; the occupied eligible-gateway test remains fatal.

- [ ] **Step 12: Commit topology-aware validation**

```bash
git add container/listener-address-inventory.mjs container/private-router-reachability.mjs \
  container/listener-network-inventory.mjs \
  container/listener-collector.mjs container/listener-inventory.mjs \
  container/listener-inventory-tests.mjs container/profiles/routing-graph-listeners.json \
  container/profiles/full-explorer-listeners.json container/smoke-runtime.mjs \
  tests/unit/privateRouterReachability.test.mjs
git commit -m "fix: validate private listeners against assigned topology"
```

---

### Task 4: Centralize and harden full-graph operator input validation

**Repository:** `/Users/danielsava/work/file-parser/ploinky/.worktrees/ploinky-phase1-http-router-proxy-mvp`

**Files:**
- Create: `container/full-graph-smoke-config.mjs`
- Create: `container/validate-full-graph-smoke-inputs.mjs`
- Create: `tests/unit/fullGraphSmokeConfig.test.mjs`
- Modify: `cli/services/edgeGeneration.js`
- Modify: `tests/unit/edgeGenerationHardCut.test.mjs`
- Modify: `tests/unit/smokeFullGraphPrerequisites.test.mjs`
- Modify: `container/smoke-runtime.mjs`

**Interfaces:**
- Produces: `normalizeEdgeDesiredState(desired): NormalizedEdgeDesiredState` from `cli/services/edgeGeneration.js`; the existing generation compiler must call the same export.
- Produces: `loadLocalOnlyFullGraphDesired({desiredFile, mediaPublicIPv4, sourceRoot, fileSystem}): {desiredFile, desired, mediaPublicIPv4, addressMode}`.
- CLI contract: `SMOKE_EDGE_DESIRED_FILE` and `SMOKE_MEDIA_PUBLIC_IPV4` are required; success prints `FULL_GRAPH_INPUTS local-only=PASS media-ip-match=PASS host-network-owner=webmeetInfra/liveKitServerAgent` and exits zero.

- [ ] **Step 1: Write failing unit tests for the exact desired-state contract**

Use temporary files created under `os.tmpdir()` with mode `0600`; simulate the wrong-owner case through the injected `fileSystem.lstatSync` result so the test never needs root. Reuse the deterministic accepted-address cases already covered by `edgeGenerationHardCut.test.mjs` only as in-memory/unit fixtures; no unit fixture may be copied into workflow, documentation, an operator file, or an E2E command. Cover:

- valid exact local-only state;
- missing/relative/symlink/in-repository/wrong-owner/group-readable/oversized file;
- invalid JSON and unknown schema keys;
- absent, private, loopback, or malformed public IPv4;
- mismatch between file and independent environment value;
- missing or invalid `addressMode`;
- nonempty `hosts`, any `cloudflare`, any `turn`;
- zero, two, or wrong host-network owners;
- nonempty `internalServiceConsumers`;
- a value that the production normalizer would trim or canonicalize, proving submitted and normalized objects must be deeply equal.
- every negative diagnostic excludes the submitted JSON, both address strings, and desired-file pathname, and uses one of the fixed categories `FULL_GRAPH_INPUT_MISSING`, `FULL_GRAPH_INPUT_FILE_POLICY`, `FULL_GRAPH_INPUT_DESIRED_INVALID`, `FULL_GRAPH_INPUT_MEDIA_INVALID`, `FULL_GRAPH_INPUT_MEDIA_MISMATCH`, or `FULL_GRAPH_INPUT_LOCAL_ONLY_POLICY`.

Add a test in `edgeGenerationHardCut.test.mjs` that imports `normalizeEdgeDesiredState` and proves the generation path and smoke path receive identical normalized media/security output.

- [ ] **Step 2: Run tests and verify they fail before implementation**

Run:

```bash
node --test tests/unit/fullGraphSmokeConfig.test.mjs tests/unit/edgeGenerationHardCut.test.mjs
```

Expected: FAIL because the new module/export/CLI do not exist.

- [ ] **Step 3: Export the production normalizer without duplicating schema logic**

Rename the internal `normalizeDesired` function to exported `normalizeEdgeDesiredState`, replace its internal caller in `compileGeneration`, and add the same function to the module's default export object. Named imports are authoritative for the smoke module. Do not change the accepted production schema.

- [ ] **Step 4: Implement `loadLocalOnlyFullGraphDesired`**

The function must:

1. Require both configured values.
2. Resolve an absolute regular non-symlink file outside `sourceRoot`, every `.ploinky` segment, and any directory tree whose ancestor contains a `.git` file or directory.
3. Require `size > 0`, `size <= EDGE_DESIRED_CANDIDATE_MAX_BYTES`, `(mode & 0o077) === 0`, and `stat.uid === process.getuid()` on platforms that expose both values.
4. Parse JSON, call `normalizeEdgeDesiredState`, and require `assert.deepStrictEqual(submitted, normalized)`.
5. Normalize the independent IPv4 with `normalizePublicMediaIPv4` and require exact equality to `normalized.media.publicIPv4`.
6. Require empty `hosts`, absent `cloudflare`, absent `turn`, exact owner array `['webmeetInfra/liveKitServerAgent']`, and empty `internalServiceConsumers`.
7. Return a frozen value without logging the address or full JSON.

Wrap production-normalizer failures at this boundary with the fixed value-free categories above. Preserve the original error as `cause` for in-process tests, but the CLI must print only the outer category/message; it must not serialize the cause, stack, desired pathname, JSON, or either submitted address.

- [ ] **Step 5: Implement the value-free validation CLI**

`container/validate-full-graph-smoke-inputs.mjs` must call the function with `process.env`, print only the fixed success record on success, and on failure print only `CATEGORY: fixed value-free message` to stderr before setting a nonzero exit code. It must not emit a stack/cause, stage state, start Podman, or mutate a workspace.

- [ ] **Step 6: Replace the bespoke checks in `smoke-runtime.mjs`**

At the smoke entry point, load and validate the candidate, the repository map, and the Explorer E2E checkout before the first Podman inspection, create, volume, or copy operation. Pass the frozen result into `runConfiguredFullGraph`; do not reread the operator file after engine mutation begins. Use the returned path and address mode when atomically staging it in the outer box. Replace the current public-IP-bearing log with:

```text
FULL_GRAPH_EDGE_CANDIDATE staged local-only=PASS media-ip-match=PASS addressMode=direct|nat-forward
```

Retain atomic staging, directory mode `0700`, file mode `0600`, no Cloudflare mutation, and the existing graph-start failure diagnostics.

- [ ] **Step 7: Replace source-regex-only prerequisite assertions with behavioral imports**

Keep `tests/unit/smokeFullGraphPrerequisites.test.mjs` assertions for graph ordering and probe removal, but import the focused module for input behavior. Assert that `smoke-runtime.mjs` calls `loadLocalOnlyFullGraphDesired` and no longer parses the file or calls `normalizePublicMediaIPv4` directly.

- [ ] **Step 8: Run focused tests and CLI negative checks**

Run:

```bash
node --test tests/unit/fullGraphSmokeConfig.test.mjs \
  tests/unit/edgeGenerationHardCut.test.mjs \
  tests/unit/smokeFullGraphPrerequisites.test.mjs
env -u SMOKE_EDGE_DESIRED_FILE -u SMOKE_MEDIA_PUBLIC_IPV4 \
  node container/validate-full-graph-smoke-inputs.mjs
```

Expected: unit tests PASS; the CLI exits nonzero with an explicit missing-input diagnostic and does not create `.ploinky` state.

- [ ] **Step 9: Commit the operator-input contract**

```bash
git add cli/services/edgeGeneration.js container/full-graph-smoke-config.mjs \
  container/validate-full-graph-smoke-inputs.mjs container/smoke-runtime.mjs \
  tests/unit/fullGraphSmokeConfig.test.mjs tests/unit/edgeGenerationHardCut.test.mjs \
  tests/unit/smokeFullGraphPrerequisites.test.mjs
git commit -m "fix: require validated Explorer smoke edge input"
```

---

### Task 5: Run the fixed Explorer browser oracle before smoke cleanup

**Repository:** `/Users/danielsava/work/file-parser/ploinky/.worktrees/ploinky-phase1-http-router-proxy-mvp`

**Files:**
- Modify: `container/full-graph-smoke-config.mjs`
- Modify: `tests/unit/fullGraphSmokeConfig.test.mjs`
- Modify: `tests/unit/smokeFullGraphPrerequisites.test.mjs`
- Modify: `container/smoke-runtime.mjs`

**Interfaces:**
- Produces: `validateExplorerE2ECheckout({configuredRoot, graphRoot, runGit, fileSystem}): {repositoryRoot, smokeRoot, revision}`.
- Produces: `runExplorerRouterAuthGate({checkout, baseURL, spawn, environment}): void`; `environment` is source input to an explicit allowlist, never inherited wholesale.
- Consumes: required env `SMOKE_EXPLORER_E2E_ROOT`, the already validated graph repository map, and `SMOKE_PORT`.
- Fixed subprocess: command `npm`; argv `['test', '--', '--project=chromium', 'specs/00-router-auth.spec.mjs']`; `shell: false`; `stdio: 'inherit'`.

- [ ] **Step 1: Write failing tests for checkout identity and fixed process execution**

Cover:

- missing or relative `SMOKE_EXPLORER_E2E_ROOT`;
- missing `.git`, `tests/smoke/package.json`, or target spec;
- E2E checkout revision different from graph Explorer revision;
- exact matching revision returns the real smoke directory;
- fake `spawnSync` receives only the fixed command/argv, exact cwd, a minimal allowlisted environment plus authoritative `SMOKE_BASE_URL`, `shell: false`, and inherited stdio;
- caller-provided `SMOKE_BASE_URL` is overwritten with `http://127.0.0.1:18080`;
- caller-provided `CI` is omitted so Playwright's configured CI retry cannot retry around the required single browser oracle;
- `PLOINKY_MASTER_KEY`, `PLOINKY_EDGE_DESIRED_JSON`, `SMOKE_EDGE_DESIRED_FILE`, `SMOKE_MEDIA_PUBLIC_IPV4`, `PLOINKY_ROUTER_TOKEN`, `PLOINKY_AGENT_TOKEN`, cookies, and every non-allowlisted caller variable are absent from the child environment;
- spawn error, signal, or nonzero status throws;
- no environment variable can replace the command, argv, project, or spec.

- [ ] **Step 2: Run tests and verify the missing-interface failure**

Run:

```bash
node --test tests/unit/fullGraphSmokeConfig.test.mjs tests/unit/smokeFullGraphPrerequisites.test.mjs
```

Expected: FAIL because checkout and browser-runner exports do not exist.

- [ ] **Step 3: Implement exact checkout validation**

Resolve both roots through `realpathSync`, require the E2E root to be a git checkout outside `.ploinky`, and run `git -C ROOT rev-parse HEAD` for each. Require the same exact 40-character lowercase SHA. Require the smoke package and fixed spec as regular files. Do not require a clean working tree because `npm ci` intentionally creates ignored `node_modules`; commit identity is the source authority.

- [ ] **Step 4: Implement the non-shell fixed runner**

Use an injected `spawn` defaulting to `spawnSync`. Derive the base URL from the selected smoke port and never read it from caller input. Construct the child environment from only `PATH`, `HOME`, `USER`, `TMPDIR`, `LANG`, `LC_ALL`, and `PLAYWRIGHT_BROWSERS_PATH` when present; then set only the authoritative `SMOKE_BASE_URL`. Do not spread `process.env` and do not pass `CI`, because the checked-in Playwright configuration enables a retry when `CI` is truthy. Print the fixed command before launch without printing the environment, cookies, master key, tokens, operator file path, media address, or desired state. Treat only `status === 0`, no `error`, and no `signal` as success.

- [ ] **Step 5: Integrate it into the live full-graph lifetime**

Refactor `runConfiguredFullGraph` to retain the validated graph repository roots and listener result. The successful sequence must be:

```text
ploinky start full Explorer graph
assertExactOuterBoundary('full-explorer-graph')
validateFullGraphListeners()
validate exact E2E checkout SHA against graph Explorer SHA
run fixed Explorer router/auth Chromium command
assertExactOuterBoundary('post-explorer-browser')
validateFullGraphListeners()
print EXPLORER_ROUTER_AUTH_E2E PASS
return to the outer try block
finally remove the exact outer box and volumes
```

If Playwright fails, capture that failure, still run the post-browser publication and listener checks, then throw one aggregate error containing the browser and any post-check failures. Do not print session data or page content in the aggregate.

- [ ] **Step 6: Assert ordering and cleanup structurally**

Update `smokeFullGraphPrerequisites.test.mjs` to require the browser call after initial full listener validation, both post-browser checks after the browser call, the PASS marker only after those checks, and all of them lexically inside the existing top-level `try` whose `finally` removes the box and volumes.

- [ ] **Step 7: Run focused tests**

Run:

```bash
node --test tests/unit/fullGraphSmokeConfig.test.mjs tests/unit/smokeFullGraphPrerequisites.test.mjs
node container/listener-inventory-tests.mjs
```

Expected: all tests pass and the fixed argv appears in behavioral assertions.

- [ ] **Step 8: Commit the browser-before-cleanup gate**

```bash
git add container/full-graph-smoke-config.mjs container/smoke-runtime.mjs \
  tests/unit/fullGraphSmokeConfig.test.mjs tests/unit/smokeFullGraphPrerequisites.test.mjs
git commit -m "test: gate Explorer graph with Chromium auth smoke"
```

---

### Task 6: Wire protected input and the browser checkout into image publication

**Repository:** `/Users/danielsava/work/file-parser/container-image-builds`

**Files:**
- Modify: `.github/workflows/publish-ploinky-box-image.yml`
- Modify: `tests/image-definitions.test.mjs`
- Modify: `README.md`

**Interfaces:**
- Consumes: protected environment `ploinky-box-runtime-release` and environment secret `PLOINKY_SMOKE_EDGE_DESIRED_JSON`.
- Consumes: required dispatch string `media_public_ipv4`.
- Produces: step-local env `SMOKE_EDGE_DESIRED_FILE`, `SMOKE_MEDIA_PUBLIC_IPV4`, and `SMOKE_EXPLORER_E2E_ROOT` for Ploinky's full gate; the desired file path is not persisted through `$GITHUB_ENV`.
- Preserves: `merge.needs: [resolve-source, build]` and exactly two distinct native digest artifacts.

- [ ] **Step 1: Write failing workflow-structure assertions**

Extend `tests/image-definitions.test.mjs` to require all of the following:

1. `media_public_ipv4` is a required `workflow_dispatch` input with no default.
2. The build job uses environment `ploinky-box-runtime-release`.
3. The desired JSON comes only from `secrets.PLOINKY_SMOKE_EDGE_DESIRED_JSON`.
4. Each validation/runtime materialization writes only under `$RUNNER_TEMP` after `umask 077`, checks current-runner ownership and mode `600`, installs an EXIT trap before writing, and never echoes content or address.
5. Ploinky's validation CLI runs before `Build and push candidate by digest`.
6. A second AssistOSExplorer checkout uses the exact same `${{ inputs.explorer_ref }}` and a distinct `browser-workspace/AssistOSExplorer` path.
7. Every graph checkout and both Explorer checkouts have `rev-parse HEAD` compared to their exact dispatch SHA before dependency installation or build.
8. The browser checkout runs `npm ci` and `npx playwright install --with-deps chromium`.
9. The runtime gate receives the three required env values in its own step and runs before `Export gated candidate digest`.
10. The checked-out Ploinky source gate runs `fullGraphSmokeConfig.test.mjs` and `container/listener-inventory-tests.mjs` before the image build.
11. The hard-cut gate invokes Ploinky's fixed CLI backed by the topology classifier, requires child private `8081` success only for `assigned-managed-gateway`, requires refusal for `inactive-managed-gateway` and `assigned-non-managed`, rejects unclassified resolution, and repeats the same classified assertion after Router restart.
12. No step writes the desired file path/address to `$GITHUB_ENV`, uploads desired or browser artifacts, or passes protected release variables to the browser child; no digest export/upload step has `if: always()`.
13. The build job has no `continue-on-error`, privilege, widened security option, hard-coded media IPv4, synthetic media IPv4, public-IP discovery command, or unconditional private `nc` success assertion.
14. Merge still requires both architecture artifacts before `docker buildx imagetools create` moves `:runtime`.

- [ ] **Step 2: Run the workflow test and verify it fails**

Run:

```bash
cd /Users/danielsava/work/file-parser/container-image-builds
node --test tests/image-definitions.test.mjs
```

Expected: FAIL on the missing dispatch input, protected environment, secret materialization, second checkout, browser setup, and pre-build validators.

- [ ] **Step 3: Add the protected operator input**

Add `media_public_ipv4` to `workflow_dispatch` with description `Operator-approved actual globally routable media IPv4; must equal the protected local-only desired state`, `required: true`, and `type: string`. Add `environment: ploinky-box-runtime-release` to the native build job.

After all source checkouts and before Docker Buildx setup, add a validation-only step that materializes, validates, and removes the protected value within that one step:

```bash
set -euo pipefail
test -n "$PLOINKY_SMOKE_EDGE_DESIRED_JSON"
test -n "$SMOKE_MEDIA_PUBLIC_IPV4"
umask 077
desired_file="$RUNNER_TEMP/ploinky-box-edge-desired-validate-${{ matrix.arch }}-$GITHUB_RUN_ID-$GITHUB_RUN_ATTEMPT.json"
cleanup_desired() {
  test "$desired_file" = "$RUNNER_TEMP/ploinky-box-edge-desired-validate-${{ matrix.arch }}-$GITHUB_RUN_ID-$GITHUB_RUN_ATTEMPT.json"
  rm -f -- "$desired_file"
}
trap cleanup_desired EXIT
test ! -e "$desired_file"
test ! -L "$desired_file"
printf '%s' "$PLOINKY_SMOKE_EDGE_DESIRED_JSON" > "$desired_file"
test "$(stat -c '%a' "$desired_file")" = 600
test "$(stat -c '%u' "$desired_file")" = "$(id -u)"
export SMOKE_EDGE_DESIRED_FILE="$desired_file"
node sources/ploinky/container/validate-full-graph-smoke-inputs.mjs
```

The step environment maps `PLOINKY_SMOKE_EDGE_DESIRED_JSON` from the protected secret and `SMOKE_MEDIA_PUBLIC_IPV4` from the dispatch input. Never print either value, the materialized JSON, or the desired path. The EXIT trap must be installed before the first write. Do not use `$GITHUB_ENV`; the runtime step rematerializes the same protected secret under a separate exact path and owns its lifetime.

- [ ] **Step 4: Add the independent exact-SHA browser checkout**

Check out `AssistOS-AI/AssistOSExplorer` a second time with the same `inputs.explorer_ref`, read-only token, and path `browser-workspace/AssistOSExplorer`. Add one `Verify immutable full-graph commits` step that compares `rev-parse HEAD` for `sources/ploinky`, both Explorer checkouts, `webmeetInfra`, `UmamiAgent`, `AchillesCLI`, `proxies`, and `basic` to `source_ref`, `explorer_ref`, `webmeet_infra_ref`, `umami_ref`, `achilles_cli_ref`, `proxies_ref`, and `basic_ref` respectively. Compare both `container-image-builds` checkouts to `$GITHUB_SHA`. Run this before source tests, dependency installation, or candidate build.

- [ ] **Step 5: Run new Ploinky unit gates before candidate build**

In `Gate checked-out Ploinky contract-5 source`, add:

```bash
node --test \
  sources/ploinky/tests/unit/fullGraphSmokeConfig.test.mjs \
  sources/ploinky/tests/unit/smokeFullGraphPrerequisites.test.mjs
node sources/ploinky/container/listener-inventory-tests.mjs
```

Keep the existing contract, lifecycle, documentation, and supervisor tests.

- [ ] **Step 6: Install the pinned browser only in the browser checkout**

Immediately before the full runtime gate, run:

```bash
cd browser-workspace/AssistOSExplorer/tests/smoke
npm ci
npx playwright install --with-deps chromium
```

Set `SMOKE_EXPLORER_E2E_ROOT` to `${{ github.workspace }}/browser-workspace/AssistOSExplorer` for the runtime-gate step. Do not install under `full-workspace/AssistOSExplorer`, which remains the exact graph source copied into the box.

- [ ] **Step 7: Pass the operator inputs into the existing full gate**

Keep the exact full-graph argv and repository JSON. In the `Gate exact fixed outer publications and lifecycle` step, map the protected JSON and dispatch input into step-local variables, then rematerialize the file as `$RUNNER_TEMP/ploinky-box-edge-desired-runtime-${{ matrix.arch }}-$GITHUB_RUN_ID-$GITHUB_RUN_ATTEMPT.json`. Use the same `umask 077`, exact-path EXIT trap, non-symlink check, current-UID check, and mode-`600` check from Step 3. Export `SMOKE_EDGE_DESIRED_FILE` only after writing it; set `SMOKE_EXPLORER_E2E_ROOT=${{ github.workspace }}/browser-workspace/AssistOSExplorer`; run the value-free validation CLI again immediately before `smoke-runtime.mjs`. Do not write any of these values to `$GITHUB_ENV`.

The Ploinky process itself must run the fixed browser command before it exits. Its Task 5 allowlist must exclude the protected JSON, file path, media IPv4, master key, cookies, and tokens from the Playwright child. The step's EXIT trap removes the exact desired file after `smoke-runtime.mjs` has completed its own box/volume cleanup, whether the gate passes or fails.

- [ ] **Step 8: Make the later hard-cut private reachability assertion topology-aware**

In `Gate contract-5 hard cut and native host-gateway topology`, remove the unconditional loop assertion `podman exec "$agent" nc -z -w 3 host.containers.internal "$router_port"` and the post-restart assertion `podman exec default-agent nc -z -w 3 host.containers.internal 8081`. Replace them with the fixed Ploinky-owned CLI:

```bash
podman exec "$outer" node /opt/ploinky/container/private-router-reachability.mjs \
  --port 8081 --agent default-agent --agent multi-agent
```

Run it once after agent creation and again after Router restart. Keep the existing public `8080` reachability-plus-unauthorized-status assertions, same/isolated network tests, egress test, loopback-service refusal, generation comparison, and fixed public/private Router environment assertions. The CLI itself decides whether `8081` must be reachable or refused from fresh managed-network, kernel-address, and per-agent resolution evidence. Delete the unconditional shell success assertion; do not replace it with unconditional refusal. Update `tests/image-definitions.test.mjs` to require both CLI invocations and to reject a raw unconditional private `nc` success assertion. Update `README.md` so it no longer promises private reachability on a topology where the managed gateway is inactive.

- [ ] **Step 9: Update operator documentation**

In `README.md`, document:

- creation and required-reviewer protection of environment `ploinky-box-runtime-release`;
- environment secret `PLOINKY_SMOKE_EDGE_DESIRED_JSON` and the exact field table from this plan;
- the independent `media_public_ipv4` dispatch confirmation;
- no public-IP discovery or committed example address;
- the second same-SHA Explorer checkout and exact Chromium baseline;
- topology-classified private child reachability/refusal evidence and the absence of a forwarding workaround;
- the fact that failed native/browser gates may leave untagged candidate content but cannot move `:runtime`.

Replace the existing Ploinky-box manual dispatch example with this complete checked-input form:

```bash
: "${SMOKE_MEDIA_PUBLIC_IPV4:?export the operator-approved actual media IPv4}"
: "${CONTAINER_IMAGE_BUILDS_SHA:?export the reviewed workflow commit}"
: "${PLOINKY_SHA:?export the reviewed Ploinky commit}"
: "${EXPLORER_SHA:?export the reviewed Explorer commit}"
: "${WEBMEET_INFRA_SHA:?export the reviewed webmeetInfra commit}"
: "${UMAMI_SHA:?export the reviewed UmamiAgent commit}"
: "${ACHILLES_CLI_SHA:?export the reviewed AchillesCLI commit}"
: "${PROXIES_SHA:?export the reviewed proxies commit}"
: "${BASIC_SHA:?export the reviewed basic commit}"
for release_sha in "$CONTAINER_IMAGE_BUILDS_SHA" "$PLOINKY_SHA" "$EXPLORER_SHA" \
  "$WEBMEET_INFRA_SHA" "$UMAMI_SHA" "$ACHILLES_CLI_SHA" "$PROXIES_SHA" "$BASIC_SHA"; do
  [[ "$release_sha" =~ ^[0-9a-f]{40}$ ]]
done
gh workflow run publish-ploinky-box-image.yml \
  --repo AssistOS-AI/container-image-builds \
  --ref "$CONTAINER_IMAGE_BUILDS_SHA" \
  -f source_ref="$PLOINKY_SHA" \
  -f explorer_ref="$EXPLORER_SHA" \
  -f webmeet_infra_ref="$WEBMEET_INFRA_SHA" \
  -f umami_ref="$UMAMI_SHA" \
  -f achilles_cli_ref="$ACHILLES_CLI_SHA" \
  -f proxies_ref="$PROXIES_SHA" \
  -f basic_ref="$BASIC_SHA" \
  -f media_public_ipv4="$SMOKE_MEDIA_PUBLIC_IPV4"
```

- [ ] **Step 10: Run workflow tests and inspect ordering**

Run:

```bash
node --test tests/image-definitions.test.mjs
git diff --check
```

Expected: PASS. The test proves input validation precedes the candidate build; the runtime/browser, hard-cut, and post-check gates precede digest export; the desired file is step-local and trap-cleaned; and merge/tag promotion still depends on both architecture artifacts.

- [ ] **Step 11: Commit the release integration**

```bash
git add .github/workflows/publish-ploinky-box-image.yml tests/image-definitions.test.mjs README.md
git commit -m "ci: gate ploinky runtime on Explorer browser smoke"
```

---

### Task 7: Run repository-level verification before the expensive E2E

**Repositories:** Ploinky worktree, `container-image-builds`, and AssistOSExplorer.

**Files:** No new files. This task verifies the committed change sets.

**Interfaces:**
- Consumes: Tasks 1-6.
- Produces: review evidence that unit, profile, workflow, documentation, and existing focused Phase 1 gates are green before using operator infrastructure.

- [ ] **Step 1: Verify the Ploinky focused suite**

Run:

```bash
cd /Users/danielsava/work/file-parser/ploinky/.worktrees/ploinky-phase1-http-router-proxy-mvp
node --test \
  tests/unit/fullGraphSmokeConfig.test.mjs \
  tests/unit/edgeGenerationHardCut.test.mjs \
  tests/unit/smokeFullGraphPrerequisites.test.mjs \
  tests/unit/privateListenerSet.test.mjs \
  tests/unit/privateRouterReachability.test.mjs \
  tests/unit/listenerInterfaceClassifier.test.mjs \
  tests/unit/runtimeDocumentation.test.mjs
node container/listener-inventory-tests.mjs
npm test
```

Expected: every focused test passes and the full Ploinky suite remains at least the previously established `316/316` gate with no regression.

- [ ] **Step 2: Verify release-workflow structure**

Run:

```bash
cd /Users/danielsava/work/file-parser/container-image-builds
node --test tests/image-definitions.test.mjs
```

Expected: PASS.

- [ ] **Step 3: Verify the Explorer browser package without opening a browser**

Run:

```bash
cd /Users/danielsava/work/file-parser/AssistOSExplorer/tests/smoke
npm ci
npm run test:unit
```

Expected: unit tests pass; no graph or browser is required in this step.

- [ ] **Step 4: Require fresh consequential review**

Give a fresh-context consequential reviewer the original requirements, base commits, exact changed-file lists, and all commands/output above. Require explicit review of:

- cross-interface gateway assignment;
- missing address-evidence failure behavior;
- the fixed non-shell browser argv;
- the browser subprocess environment allowlist and absence of protected/master-key/token inputs;
- same-SHA graph/E2E checkout validation;
- topology-classified child `8081` reachability/refusal before and after Router restart;
- desired-state secrecy and exact local-only shape;
- cleanup after browser failure;
- digest-export and merge/tag ordering.

Resolve every high-severity or medium-severity finding, rerun the affected tests, and obtain a new fresh-context review after any material fix.

---

### Task 8: Prove the full local Explorer stack with the workflow-built digest

**Repositories:** All graph repositories plus the Ploinky MVP worktree.

**Files:** Operator-owned desired state outside all repositories; no tracked changes.

**Interfaces:**
- Consumes: image `docker.io/assistos/ploinky-box@sha256:27c8c2775dadc49324b823818e456f2d8c4f7dc9346b4015bbb2f684cc9b71b7`, explicit operator inputs, exact graph checkouts, and the independent E2E checkout.
- Produces: the required proof that the full runtime gate starts, the real browser passes, the boundary remains exact, and cleanup occurs.

- [ ] **Step 1: Validate the operator-owned file before runtime mutation**

The operator exports the two approved values, then run:

```bash
cd /Users/danielsava/work/file-parser/ploinky/.worktrees/ploinky-phase1-http-router-proxy-mvp
: "${SMOKE_EDGE_DESIRED_FILE:?export the absolute approved desired-state file}"
: "${SMOKE_MEDIA_PUBLIC_IPV4:?export the approved actual globally routable media IPv4}"
node container/validate-full-graph-smoke-inputs.mjs
```

Expected:

```text
FULL_GRAPH_INPUTS local-only=PASS media-ip-match=PASS host-network-owner=webmeetInfra/liveKitServerAgent
```

- [ ] **Step 2: Prepare an independent Explorer E2E checkout at the graph revision**

Run:

```bash
E2E_CHECKOUT_ROOT="$(mktemp -d /tmp/ploinky-explorer-e2e.XXXXXX)"
git clone --no-local /Users/danielsava/work/file-parser/AssistOSExplorer "$E2E_CHECKOUT_ROOT"
git -C "$E2E_CHECKOUT_ROOT" checkout --detach "$(git -C /Users/danielsava/work/file-parser/AssistOSExplorer rev-parse HEAD)"
cd "$E2E_CHECKOUT_ROOT/tests/smoke"
npm ci
npx playwright install --with-deps chromium
export SMOKE_EXPLORER_E2E_ROOT="$E2E_CHECKOUT_ROOT"
```

Expected: the detached checkout HEAD exactly equals the graph Explorer HEAD and Chromium installs successfully.

- [ ] **Step 3: Run the full runtime and embedded browser gate**

Run from the Ploinky worktree:

```bash
cd /Users/danielsava/work/file-parser/ploinky/.worktrees/ploinky-phase1-http-router-proxy-mvp
SMOKE_IMAGE='docker.io/assistos/ploinky-box@sha256:27c8c2775dadc49324b823818e456f2d8c4f7dc9346b4015bbb2f684cc9b71b7' \
SMOKE_PORT=18080 \
SMOKE_EDGE_DESIRED_FILE="$SMOKE_EDGE_DESIRED_FILE" \
SMOKE_MEDIA_PUBLIC_IPV4="$SMOKE_MEDIA_PUBLIC_IPV4" \
SMOKE_EXPLORER_E2E_ROOT="$SMOKE_EXPLORER_E2E_ROOT" \
SMOKE_FULL_GRAPH_ARGS_JSON='["start","AssistOSExplorer/explorer","18080"]' \
SMOKE_FULL_GRAPH_REPOSITORIES_JSON='{"AchillesCLI":"/Users/danielsava/work/file-parser/AchillesCLI","AssistOSExplorer":"/Users/danielsava/work/file-parser/AssistOSExplorer","UmamiAgent":"/Users/danielsava/work/file-parser/UmamiAgent","basic":"/Users/danielsava/work/file-parser/basic","container-image-builds":"/Users/danielsava/work/file-parser/container-image-builds","proxies":"/Users/danielsava/work/file-parser/proxies","webmeetInfra":"/Users/danielsava/work/file-parser/webmeetInfra"}' \
node container/smoke-runtime.mjs
```

The harness must invoke this exact browser command while the graph is alive:

```bash
cd "$SMOKE_EXPLORER_E2E_ROOT/tests/smoke"
SMOKE_BASE_URL=http://127.0.0.1:18080 npm test -- --project=chromium specs/00-router-auth.spec.mjs
```

Expected evidence, in order:

```text
FULL_GRAPH_EDGE_CANDIDATE staged local-only=PASS media-ip-match=PASS
IN_BOX_LISTENER_PROFILE full-explorer-v5 PASS
PORT_BINDINGS post-explorer-browser
IN_BOX_LISTENER_PROFILE full-explorer-v5 PASS
EXPLORER_ROUTER_AUTH_E2E PASS
runtime smoke passed
```

The exact placement of `addressMode` and listener count may add fields, but none of the six markers may be absent. Every managed gateway must emit either `assigned-required` with a matching listener or `unassigned-inactive` without one.

- [ ] **Step 4: Verify cleanup after success**

Run:

```bash
test -z "$(podman ps -a --format '{{.Names}}' | rg '^ploinky-box-ploinky-runtime-smoke-' || true)"
```

Expected: success with no smoke container left behind. Remove the exact temporary E2E checkout only after saving permitted, sanitized test results:

```bash
git -C "$E2E_CHECKOUT_ROOT" status --short
case "$E2E_CHECKOUT_ROOT" in
  /tmp/ploinky-explorer-e2e.??????) ;;
  *) echo "refusing unexpected E2E checkout path" >&2; exit 1 ;;
esac
test -d "$E2E_CHECKOUT_ROOT/.git"
rm -rf -- "$E2E_CHECKOUT_ROOT"
```

The guarded removal accepts only the exact six-character `mktemp` suffix and refuses every workspace checkout.

---

### Task 9: Prove the protected release workflow cannot promote on partial success

**Repository:** `/Users/danielsava/work/file-parser/container-image-builds`

**Files:** No code changes unless verification exposes a defect, in which case return to Task 6 and repeat review.

**Interfaces:**
- Consumes: protected environment configuration, committed Ploinky/Explorer/container-image-builds SHAs, and all other exact graph SHAs.
- Produces: one GitHub Actions run whose two native jobs pass input, topology, full-graph, browser, and post-browser gates before promotion.

- [ ] **Step 1: Record the current mutable tag before dispatch**

Run:

```bash
docker buildx imagetools inspect docker.io/assistos/ploinky-box:runtime
```

Record the manifest digest and per-platform digests in the release record. This is rollback evidence, not authorization to retag locally.

- [ ] **Step 2: Confirm protected environment state**

An authorized repository operator confirms in GitHub that:

- environment `ploinky-box-runtime-release` exists and has required reviewers;
- secret `PLOINKY_SMOKE_EDGE_DESIRED_JSON` contains the approved exact local-only document;
- the dispatching operator has independently verified the actual media IPv4 and address mode;
- no repository or organization variable supplies a fallback address.

- [ ] **Step 3: Dispatch with immutable refs and the independently entered IPv4**

Use the reviewed 40-character commits for all seven repository inputs and `-f media_public_ipv4="$SMOKE_MEDIA_PUBLIC_IPV4"`. Do not use branch names, mutable tags, or generated public-IP discovery.

- [ ] **Step 4: Verify both native jobs before accepting promotion**

For both `amd64` and `arm64`, require logs proving:

1. desired input validation PASS before image build;
2. exact graph and E2E Explorer SHAs match;
3. routing and full listener profiles PASS with explicit gateway states;
4. the exact Chromium router/auth command PASS;
5. post-browser publication and listener checks PASS;
6. the topology-classified child `8081` gate PASSes before and after Router restart; and
7. candidate digest export occurs only afterward.

Then require the merge job to download exactly two distinct digest files and only then execute `docker buildx imagetools create --tag docker.io/assistos/ploinky-box:runtime`.

- [ ] **Step 5: Run a controlled negative promotion proof before the first production promotion**

In a reviewed test run, dispatch `media_public_ipv4` as loopback `127.0.0.1`. This is deliberately invalid input, never an operational public-IP substitute. Expected: production normalization fails before candidate build, no digest artifact is uploaded, merge is skipped, and the recorded mutable tag digest is unchanged. Use the independently verified actual address for the production run. Do not change the protected JSON to make the invalid value pass.

---

## Acceptance criteria

| Requirement | Acceptance evidence |
| --- | --- |
| Explicit operator input | Local validation CLI and both workflow matrix jobs consume an absolute mode-`0600` file plus an independent actual globally routable IPv4; missing or mismatched values fail before build/start. |
| Exact local-only desired state | Production schema normalizer accepts the submitted bytes without normalization drift; hosts are empty; Cloudflare and TURN are absent; the sole host-network owner is `webmeetInfra/liveKitServerAgent`; internal consumers are empty. |
| Required loopback | Exactly one owner-approved `127.0.0.1:8081` listener is present in routing and full Explorer profiles. |
| Topology-aware managed gateway | An IPAM gateway is required only if kernel evidence assigns it to the exact Podman `network_interface`; an assigned gateway missing its listener fails; an unassigned gateway is emitted as inactive; missing/cross-interface evidence fails. |
| Topology-aware child reachability | Each managed child's unique `host.containers.internal` resolution is classified from the same live topology: assigned managed gateway requires private `8081` success; inactive managed gateway or assigned non-managed transport requires refusal; unknown/ambiguous resolution fails. The check passes before and after Router restart. |
| Security boundary | Wildcard/private physical publication, unrelated physical bind, private `8081` publication, every listed service-port publication, extra nested container, unknown listener, and wrong owner/PID continue to fail. |
| Full runtime gate | Full Explorer graph starts with the explicit candidate using the contract-5 digest and both listener profiles pass. |
| Browser gate | While that graph is alive, Ploinky runs `SMOKE_BASE_URL=http://127.0.0.1:18080 npm test -- --project=chromium specs/00-router-auth.spec.mjs`; dashboard, Explorer shell, and WebChat shell pass. |
| Post-browser stability | Exact two-publication boundary and full owner-aware listener profile pass again after Playwright, even when Playwright returns failure. |
| Cleanup and secrecy | The smoke removes its exact outer box, volumes, and temporary state on success or failure; each workflow step trap removes only its exact runner-temp desired file; protected input, master key, tokens, and cookies are absent from the browser environment and uploaded artifacts. |
| Promotion safety | Neither native job uploads a digest before all gates pass; merge requires exactly two distinct artifacts; `:runtime` is not moved on any input, graph, listener, browser, or post-check failure. |
| Documentation | Ploinky DS004/DS005/DS009/DS010 and Explorer DS06 describe the same active/inactive and reachability/refusal semantics and keep DS004 Question #8 open. Operator runbooks contain the exact baseline command and protected input procedure. |

## Rollback strategy

1. **Before promotion:** Preserve the current `:runtime` manifest and per-platform digests in the release record. Unpromoted candidate digests are harmless immutable registry content; do not tag them manually.
2. **Code rollback:** Revert by repository and commit boundary in reverse dependency order: `container-image-builds` workflow commit, Ploinky browser/input commit, Ploinky listener-validation commit, Explorer docs commit, then Ploinky docs commit. Never roll back by weakening a profile, accepting missing evidence, adding a fake address, or bypassing the browser.
3. **Review rollback:** Run every Task 7 command against the revert and obtain a new consequential review. A reverted workflow must still be unable to move `:runtime` without its then-current complete gates.
4. **Tag rollback after a later-discovered defect:** Dispatch the reviewed GitHub Actions workflow at the previous known-good Ploinky and graph SHAs with the same protected operator-input process. Let both native candidates and all gates pass again, then let the workflow move `:runtime` to the revalidated manifest. Do not retag from a workstation.
5. **Running boxes:** Contract 5 pins an inspected image ID for an existing box. Moving `:runtime` backward does not mutate a running instance. An operator must explicitly `ploinky destroy` and recreate only after approving the rollback; retained volumes remain governed by the existing contract-5 hard cut.
6. **External state:** This remediation never creates, updates, or deletes Cloudflare, DNS, TURN, firewall, or public-network resources, so rollback has no external publication cleanup step.

## Release-safety stop conditions

Stop implementation or release and return to consequential planning/review if any of these occurs:

- Podman network inspection on either native runner omits or changes the meaning of `network_interface`.
- `ip -j -4 address show` cannot be collected twice as root inside the outer box or cannot be tied to the same graph generation.
- An IPAM gateway appears on the outer-facing interface rather than the exact managed interface.
- A child's `host.containers.internal` resolution is ambiguous, loopback, wildcard, absent from current topology evidence, or changes during the reachability assertion.
- The browser checkout SHA differs from the graph Explorer SHA.
- Playwright cannot run natively on either release runner.
- GitHub protected-environment reviewers cannot approve and audit both native matrix jobs before either can read `PLOINKY_SMOKE_EDGE_DESIRED_JSON`.
- The full graph requires a desired-state field outside the exact local-only contract defined above.
- The baseline browser test reveals an Explorer product defect. Fix that defect in a separately reviewed Explorer change; do not weaken or skip the oracle in this remediation.
- Any proposed fix requires binding `8081` wider, publishing a service port, adding a forwarder, changing authorization, or resolving DS004 Question #8. Those are new architecture decisions and outside this plan.

## Implementation handoff

Execute one task at a time through the repository's consequential pipeline. Each commit is an independent review checkpoint; do not squash away the specs-first, topology, input, browser, and workflow boundaries before final review. This session intentionally performs no implementation.
