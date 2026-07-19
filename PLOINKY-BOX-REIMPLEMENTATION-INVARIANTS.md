# Ploinky Box — Clean Reimplementation Invariants

**Purpose.** Hand this to a fresh Codex / Claude Code session so it can write a plan to implement the
Ploinky Box feature from scratch on new branches cut from `master`/`main`, without inheriting the
current `ploinky-box` branch.

**Status of this document.** Extracted 2026-07-19 by analysis of the `ploinky-box` branch across 9
repos plus `container-image-builds@main`. Every invariant below is tagged:

| Tag | Meaning |
| --- | --- |
| `[load-bearing]` | Violating it breaks the box or its security model. Must be reproduced. |
| `[incidental]` | An artifact of how this branch happened to be written. A clean implementation may choose otherwise. |
| `[OPEN]` | Not settled on the branch. The new plan must decide this before coding. |

**Evidence convention.** Paths are relative to `/Users/danielsava/work/file-parser/`. Line numbers
refer to the `ploinky-box` branch tip unless stated otherwise.

---

## 0. Read this first — the four things that decide the plan

0. **`ploinky-box` is NOT the newest work — pick your reference tip first.** Branch
   `ploinky-phase1-http-router-proxy-mvp` has `ploinky-box` as an ancestor and is **26 commits
   further ahead**, checked out at `ploinky/.worktrees/ploinky-phase1-http-router-proxy-mvp`
   (verified: `git merge-base --is-ancestor ploinky-box ploinky-phase1-http-router-proxy-mvp` → true;
   `git rev-list --count ploinky-box..ploinky-phase1-http-router-proxy-mvp` → 26). Both 2026-07-19
   remediation plans target **that** branch, and their file:line citations do **not** resolve against
   `ploinky-box` — validating them against the wrong tip yields false "the plan is wrong"
   conclusions. This document is extracted from `ploinky-box`; **those 26 commits are NOT analyzed
   here.** Decide which tip is authoritative before planning.

   Same problem in the image repo, inverted: `container-image-builds@main` is at **contract 5**,
   while its own `ploinky-box` branch (commit `4133cb9`) is at **contract 4**. Merging that branch
   into `main` would *regress* the contract label. `main` is authoritative there.

1. **The feature is NOT release-ready on the current branch, and the blocker is a design question,
   not a bug.** `ploinky/docs/superpowers/specs/2026-07-15-...-verification.md:5` states
   `Status: **NOT RELEASE-READY**`. The blocker is **DS004 Question #8** (§4.6 below): a rootless
   managed bridge cannot reach the private Router on `8081`. Every Cloudflare / media / browser
   acceptance gate is `BLOCKED` and has never executed against real infrastructure. **Settle
   Question #8 before writing any code.**

2. **Most of the branch arrived in one unreviewable commit.** In `ploinky`, commit `f428dd4`
   ("Checkpoint state from 2026-07-16 10:00 EEST") is **210 files, +31,290 / −8,706 — ~70 % of the
   entire branch diff**, with no rationale, simultaneously creating and deleting whole subsystems.
   The same pattern repeats in 6 other repos. This — not the design — is why the branch is
   unmaintainable. *The design is largely sound and well-tested; the history is not.*

3. **The tests are worth porting; the history is not.** `node --test tests/unit/*.test.mjs` on the
   branch → **1445 pass / 6 fail / 2 skipped (1453 total)**. The failures are: 2 macOS `/private/var`
   path artifacts, 2 unrelated feature-removal tests, 1 unrelated LLM catalog test, and 1
   (`runtimeV5SourceAbsence`) that fails **only** because stale uncommitted design docs mention
   removed components — committed code passes. Treat the unit suite as an executable spec.

---

## 1. Scope — repos, branches, baselines

| Repo | Default | `ploinky-box` commits | Files | Diff | Verdict |
| --- | --- | --- | --- | --- | --- |
| `ploinky` | `master` | 82 | 266 | +44,604 / −4,977 | Core. Full reimplementation. |
| `AssistOSExplorer` | `main` | 21 | 178 | +11,236 / −10,114 | Agent-side changes required. |
| `basic` | `main` | 8 | 31 | +103 / −2,760 | Mostly deletions (see §7). |
| `webmeetInfra` | `main` | 3 | 22 | +1,141 / −1,323 | **IN.** Real box work — LiveKit `network.mode: host`, zero `openPorts`, `httpServices[].port`, digest pin. |
| `proxies` | `main` | 2 | 34 | +385 / −8,062 | **MIXED.** ~171 lines of genuine contract-5 fail-closed deploy gates; the −8,062 is unrelated Soul Gateway doc deletion (already reverted in the working tree). |
| `UmamiAgent` | `main` | 2 | 14 | +1,267 / −192 | **IN.** Real box work — `network.name`→`mode: default`, `additionalServerPort`→`httpServices[].port`, new 3001 telemetry proxy (+422/+352 test). |
| `AchillesCLI` | `master` | 1 | 19 | +5,706 / −48 | **MIXED.** ~171 lines box routing + ~296 base-path adapter; the other ~5,150 is GPTResearcher pip hash-pinning, unrelated. Deliberate tested work despite the "Checkpoint" title. |
| `copilot-agents` | `main` | 1 | 0 | empty | **EXCLUDE.** Verified empty: commit tree object is byte-identical to its parent (`1ee70cc37df…`). |
| `container-image-builds` | `main` | — | — | — | **IN, via `main`** (contract 5). Its `ploinky-box` branch is contract 4 — do not use. |

### 1.1 Baseline hygiene `[load-bearing]`

**Cut new branches from `origin/*`, not local.** Local default branches are stale:

| Repo | Local behind origin |
| --- | --- |
| `AssistOSExplorer` | 18 commits |
| `AchillesCLI` | 14 commits |
| `ploinky` | 5 commits |
| `proxies` | 3 commits |
| `basic` | 1 commit |

**Upstream collision.** `ploinky` commit `2c11a07` ("introduce manifest startup policies and refine
agent dependency graph handling") is on `origin/master` but **not** on the box branch. It touches
**18 files the box branch also touches**, and adds `cli/services/manifestStartup.js` — which
conceptually overlaps the box's `cli/services/startupConfigProviders.js` (DS015).
**`[OPEN]` The new plan must decide how startup-config providers and manifest startup policies
reconcile.** This is the single largest merge risk.

### 1.2 Working-tree residue `[load-bearing]`

Two repos carry **uncommitted staged design docs** that are not on any branch:

| Repo | Staged files | Note |
| --- | --- | --- |
| `ploinky` | 22 (`docs/superpowers/plans/`, `docs/superpowers/specs/`) | **19,357 lines — the actual design record.** Preserve before any branch operation. |
| `AssistOSExplorer` | 14 (`docs/new-security-model*`, OnlyOffice design) | Preserve. |
| `proxies` | 16 (Soul Gateway plans) | Unrelated to box. |

These docs are the **only** written rationale for the design. Losing them loses the "why". They also
cause the one box-relevant test failure (see §0.3).

---

## 2. What the box is

`[load-bearing]` **One outer rootless-Podman container per workspace directory ("the box"), holding
the Ploinky router and all agent containers as nested Podman containers.** Ploinky core source is
**host-mounted** into the box, not baked into the image.

### 2.1 Runtime contract `[load-bearing]`

The image/container contract is versioned and validated field-by-field. **Current version is 5**
(`ploinky/container/runtime-contract.mjs:5`):

```js
export const REQUIRED_RUNTIME_CONTRACT = '5';
```

> **Contract churn warning.** The branch moved **1 → 2 → 4 → 5** in ~2 weeks, each a destroy/recreate
> hard cut with no migration. (Verified: "contract-3" appears **nowhere** in `ploinky/docs/` — the
> commit titled *"Publish contract-3"* did not bump the label. The Dockerfile `LABEL` is the only
> authority; commit titles are unreliable.) The 07-11 plan describes **contract 2** and is therefore
> **substantially superseded**. Pin the number once and do not design a migration path.

> ⚠️ **The gateway removal is UNDOCUMENTED.** The change from a managed gateway container to the
> box-host-gateway model exists **only in git history and code** (commit `c167bcf`) — verified: zero
> hits for `gateway container` / `managed gateway` / `box host gateway` across all three 2026-07-15
> design documents. The design silently assumes the post-removal model as its baseline. **DS004
> Question #8 is the direct, unresolved fallout of that undocumented replacement.** A reimplementer
> reading only the specs would not know this history exists.

### 2.2 The outer publication boundary `[load-bearing]`

Every contract-5 box has **exactly two engine publications**, constructed by the outer wrapper
**without reading graph state**:

| Publication | Bind | Purpose |
| --- | --- | --- |
| `127.0.0.1:<selectedRouterHostPort>:8080/tcp` | **loopback only** | the sole TCP boundary |
| `0.0.0.0:7882:7882/udp` | **all interfaces** | media (LiveKit) |

Evidence: `ploinky/docs/specs/DS004-runtime-execution-and-isolation.md:176-180`;
`ploinky/container/runtime-contract.mjs:16` (`BOX_MEDIA_PORT = 7882`), `:605`.

> ⚠️ **Security asymmetry to review deliberately.** TCP is loopback-only; UDP 7882 binds `0.0.0.0`.
> That is required for media reachability but means the box is world-reachable on UDP. The new plan
> should state this explicitly rather than inherit it silently.

`[load-bearing]` `PLOINKY_ROUTER_PORT` MUST be exactly `8080` **inside** the box; `--port` selects
only the outer loopback host port. There MUST be no silent `8080` fallback in the agent-env builder —
a missing persisted port must throw (`ploinky/cli/services/routerPort.js:20-30`, `:101-110`).

### 2.3 Reconciliation — replacement is FORBIDDEN, not transactional `[load-bearing]`

> ⚠️ **This inverts the 07-11 plan.** That plan specified a 9-step transactional replacement with
> rollback. The final design **deletes it**: `replaceRuntimeTransaction` is now a **forbidden
> symbol**, enforced by a source-absence test alongside `-rollback-`, `previous runtime restored`,
> and `['rename', existing.instance` (`tests/unit/runtimeV5SourceAbsence.test.mjs:99-113`, verified).

Reconciliation resolves to **exactly one of** `create` / `start` / `reuse` / `recreate-required`
(`container/runtime-contract.mjs:523-530`). Any configuration drift on a current-contract box
**fails closed** and demands an explicit `ploinky destroy`
(`container/runtime-supervisor.mjs:1409-1414`). The only surviving transaction is **create-cleanup**:
a failed initial create removes the partial container and its anonymous volumes, surfacing an
`AggregateError` if cleanup itself fails (`runtime-supervisor.mjs:1397-1407`).

Create MUST unconditionally `pull` before validation with **no cached fallback**; reuse and start
MUST NOT pull. The container MUST be created from the validated local **image ID**, never the mutable
tag, with the tag recorded separately as a label — this closes the race where a tag moves between
validate and run (`runtime-contract.mjs:574-577`; `runtime-supervisor.mjs:1378-1385`).

Inspected privilege/capability state MUST NOT be promoted into desired state; desired state is
re-derived from the contract on every reconcile. This is what makes drift *detectable* rather than
self-healing into a weaker config (`runtime-contract.mjs:463-472`).

### 2.4 Outer container privileges `[load-bearing]`

Granted **exactly**: `--user podman`, `--device /dev/fuse:rwm`, `--device /dev/net/tun:rwm`,
`--security-opt unmask=ALL`, plus `label=disable` **only when the engine reports SELinux enabled**
(queried, never assumed).

**Refused**: `--privileged` and any `--cap-add` — enforced by throw, not by convention
(`ploinky/container/runtime-contract.mjs:466-476`, `:532-538`).

### 2.4 Nested rootless Podman requirements `[load-bearing]`

| Requirement | Evidence |
| --- | --- |
| subuid/subgid range **exactly 65534** IDs for user `podman`; live mapping **exactly 65535** entries; verified at **both** build and boot | `container-image-builds/images/ploinky-box/Dockerfile:47-51`; `entrypoint.sh:160-169` |
| `newuidmap`/`newgidmap` root-owned with `cap_setuid`/`cap_setgid` (or setuid-root). Because the image is flattened `FROM scratch`, `rpm --setcaps shadow-utils` MUST re-run after the rootfs copy | `Dockerfile:60-63`; `entrypoint.sh:132-140` |
| `_CONTAINERS_USERNS_CONFIGURED` **unset**, `BUILDAH_ISOLATION=chroot`, `container=oci` — asserted at boot | `Dockerfile:67-74`; `entrypoint.sh:256-259` |
| Boot deletes **only** `/tmp/storage-run-<uid>` and `/tmp/podman-run-<uid>`; failure aborts boot. Retained graph, images, named volumes untouched | `entrypoint.sh:171-183` |

`[load-bearing]` Inside the box, host sandbox runtimes (bwrap/seatbelt) are **unconditionally forced
off**; enabling throws `PLOINKY_BOX_SANDBOX_FORCED`. Detection is the **`/etc/ploinky-box` marker
file**, not an env var (`ploinky/cli/services/sandboxRuntime.js:27-33`, `:74-80`).

---

## 3. Networking

### 3.1 Platform floor `[load-bearing]`

Managed networking requires **rootless Podman ≥ 5.4**, **Netavark** backend, and **operational
pasta**. Any missing prerequisite aborts **before** `network create`. **There is no `slirp4netns`
fallback and no CNI path, and no Podman-4 path at all**
(`ploinky/cli/services/networkLifecycle.js:453-492`).

Verified: zero `slirp4netns` hits under `cli/` and `container/` (one prose mention in
`container/README.md:216`).

### 3.2 Network modes `[load-bearing]`

Exactly four modes: `default`, `bridge`, `host`, `none`. Absent `network` block canonicalizes to
`default`. Legacy `name`/`aliases` fields are **rejected, not migrated**
(`ploinky/cli/services/networkContract.js:29-46`).

| Mode | Topology |
| --- | --- |
| `default` | one isolated bridge **per agent instance**, named `default-<sha256(instanceKey)[0..12]>`. Aliases of the same agent get **different** networks. |
| `bridge` | one per declared attachment name, shared. Requires nonempty `attachments` with **exactly one** `primary: true`; names unique lowercase DNS labels. |
| `host` | exactly `['--network','host']`, no bridges/aliases/hosts flags, **no `podman info` probe**. |
| `none` | exactly `['--network','none']`, same restrictions. |

Physical name: `ploinky-nw-<hash12(realpath(workspaceRoot))>-<hash12(logicalName)>` — realpath, so
symlinked roots collapse to one namespace (`networkLifecycle.js:39-47`).

### 3.3 Managed container run args `[load-bearing]`

**Exactly**: `--network <primaryPhysical> --network-alias <derivedAlias> --hosts-file=none
--add-host host.containers.internal:host-gateway`. Non-primary attachments added by a separate
`network connect --alias` **after create, before start** (`networkLifecycle.js:665-673`, `:751-754`).

Bridge creation is **exactly** `--driver bridge --opt isolate=true`. Reuse re-verifies driver,
`Internal=false`, `IPv6=false`, `DNS=true`, exactly one option (`isolate=true`), `host-local` IPAM,
one runtime-assigned IPv4 subnet (`networkLifecycle.js:514-583`).

### 3.4 Minimal hosts `[load-bearing]`

Managed containers must prove `HostConfig.HostsFile === 'none'` **and** `HostConfig.ExtraHosts`
is exactly `['host.containers.internal:host-gateway']`. **Validate the inspected `HostConfig`, NOT
`Config.CreateCommand`** — Podman normalizes/omits CreateCommand inconsistently across versions
(`networkLifecycle.js:402-408`; test pin `tests/unit/networkLifecycle.test.mjs:548-555`).

After start, the **running** container's `/etc/hosts` must contain **exactly one**
`host.containers.internal` entry. Unrelated entries tolerated; a duplicate is drift. This is the
runtime guard against the box's own `/etc/hosts` being inherited (`networkLifecycle.js:410-419`,
`:765-770`).

*Why `--hosts-file=none` and not `--no-hosts`:* Podman's default hosts base is the host's own
`/etc/hosts` with no dedup against `--add-host`. Inside the box that would yield two
`host.containers.internal` entries with different IPs, and musl resolvers return all matches.

### 3.5 Concurrency `[load-bearing]`

All network mutation runs under a single workspace lock `.ploinky/run/network.lock`. Container
transactions **wait** (default 60 s); prune takes it with **no** wait (`networkLifecycle.js:259-284`).

Stale-lock recovery requires **all of**: owner PID dead, age past a 5 s grace window, **and** a
byte-identical `dev:ino:size:mtime:content` fingerprint re-read. Recovery itself is serialized by a
second `.reaper` lock. Release is token-guarded — never delete a lock you do not own
(`networkLifecycle.js:185-209`).

*Race this fixed:* parallel dependency-graph waves each ran their own reconciliation and died with
"already owned by pid N" (commit `e4d4f18`).

### 3.6 Ownership and GC `[load-bearing]`

Two label vocabularies. Networks carry **exactly 5** labels (exact-match ownership — same key set,
same values). Agent containers carry those minus `logical`, plus `network-contract`, `instance-id`,
`enable-generation`, and use **required-label** matching (superset allowed) so image-provided labels
like `org.opencontainers.image.title` do not make an agent foreign
(`networkLifecycle.js:17-26`, `:122-146`).

Every destructive operation targets the **immutable container ID**, never the name, and re-verifies
the ID has not changed (`networkLifecycle.js:1002-1005`).

Prune MUST NEVER remove: foreign-labelled networks, networks with ≥1 attached container, manual or
unlabelled containers, images, or named volumes. Prune MUST NOT disconnect attachments to make a
network removable (`networkLifecycle.js:1034-1053`).

Container replacement is a **one-way transaction**: stop → remove predecessor → create candidate →
verify → start → verify. On any failure the candidate is removed and the predecessor is **not**
restored or renamed back (`tests/unit/networkLifecycle.test.mjs:722-728`).

A failing liveness probe MUST NOT `podman restart` in place — it throws `PLOINKY_LIVENESS_FAILED`
and hands off to the managed replacement transaction, because in-place restart skips network
reconciliation (`cli/services/docker/healthProbes.js:213-218`).

### 3.7 Contract-hash transport binding `[load-bearing]`

The contract hash embeds a `runtimePolicy` string (currently `'box-host-gateway-v1'`). Changing the
transport changes the hash, making every container from the previous transport **foreign** —
refused, never adopted, never auto-recreated (`cli/services/networkContract.js:121-128`;
`cli/services/docker/agentServiceManager.js:1927-1929`).

---

## 4. Edge routing and publication

### 4.1 Data model `[load-bearing]`

Exactly four mutable source files plus the router host port, at fixed derived paths under
`<workspaceRoot>/.ploinky` (`cli/services/edgeGeneration.js:175-196`). Nothing else is an
authorization input.

`desired.json` accepts **exactly** the top-level keys `schemaVersion, hosts, cloudflare, media,
turn, security` and rejects any other key **by name** (`edgeGeneration.js:687-692`).

Written **only** by `edge apply <file>` or a coordinated apply staging a candidate. There is no
`--force` (`cli/commands/cli.js:458-465`; pinned by `tests/unit/edgeDesiredApplyCli.test.mjs:64-67`).

The consumer-facing artifact is `run/edge-topology/current.json` (schemaVersion 2) carrying **three
independent generation fields**: `configurationGeneration`, `authorizationGeneration`,
`publicationGeneration` (`edgeGeneration.js:1977-1987`).

Agents read it via a **read-only bind mount** at `/run/ploinky-edge-topology/current.json`, located
by `PLOINKY_EDGE_TOPOLOGY_FILE`. That env name is **reserved and un-overridable by any manifest**
(`edgeGeneration.js:2333-2348`; `cli/services/agentIdentityEnv.js:68-77`).

`[load-bearing]` The topology watcher MUST watch the **parent directory** and filter by basename,
never the file inode — `current.json` is replaced by rename, and watching the inode stops observing
after the first rename on Linux (`Agent/lib/edgeTopology.mjs:115-122`).

### 4.2 Generations `[load-bearing]`

A generation id is `sha256:` over a **length-prefixed, name-tagged concatenation of exact source
bytes**: routing.json, policy-state.json, edge-desired.json, agents.json, router host port, and
every enabled route's manifest.json (sorted). **Semantics are never hashed directly**
(`edgeGeneration.js:1187-1196`).

Loading an active generation **re-decodes stored sources, re-runs the compiler, and re-verifies both
the digest and the stored compiled semantics**. Stored `compiled` is never trusted
(`edgeGeneration.js:1880-1888`).

There MUST be **no previous-generation fallback**: a missing source is never substituted with an
empty default once any generation evidence exists (`edgeGeneration.js:243-253`).

### 4.3 Apply protocol `[load-bearing]`

Serialized by an on-disk lock created with **`link(2)` on a durable temp**, not `open(O_EXCL)`. An
unreadable lock is **never stolen**; only a lock whose PID is provably gone (ESRCH) with unchanged
dev/ino may be reclaimed, once (`edgeGeneration.js:1269-1285`).

Nested re-entry uses an **opaque WeakMap-keyed capability object** bound to the exact lock path — a
boolean flag cannot bypass the lock (`edgeGeneration.js:1299-1313`).

**Ordering** (the selector is the sole authorization commit point and is written **last**):
verify expected generation → assert preparation lease → capture previous → inactivate → stage
candidate → capture → install immutable generation file → re-capture and compare → select inactive
candidate → optional targeted restart → write topology → re-verify selector → remove preparation
lease → **write active selector** (`edgeGeneration.js:2176-2184`).

**There is no rollback-to-previous.** Failure after transaction start leaves the selector INACTIVE
with the candidate preserved — never restores an older active generation
(`edgeGeneration.js:2185-2196`).

Immutable artifacts install by `link(2)`: `EEXIST` with **different** bytes is corruption; with
**identical** bytes is idempotent success (`edgeGeneration.js:353-367`).

**Two-phase lifecycle** (`prepare` → physical mutation → `commit`): prepare installs an immutable
candidate with `activate:false` and a durable lease; only a later apply presenting the **exact**
lease may activate. An outstanding lease blocks every unrelated apply
(`edgeGeneration.js:2199-2213`, `:2115-2121`, `:1743-1750`).

### 4.4 Authorization-to-dial lease `[load-bearing]`

Every request captures `{generation, activationId}` at plan time and **re-verifies it synchronously
inside the connection factory, immediately before the first upstream byte / TCP dial**. A stale lease
returns **503 with zero target connections** (`cli/server/edgeRoutePlan.js:604-606`; end-to-end pin
`tests/unit/edgeDialLease.test.mjs:342-350`).

### 4.5 States and modes `[load-bearing]`

Exactly **four topology states** (`local-ready`, `cloudflare-reconciling`, `cloudflare-ready`,
`publication-error`) and **three publication modes** (`local-only`, `cloudflare`,
`publication-error`). **Mode is derived from desired state, never stored or chosen**
(`edgeGeneration.js:58-64`, `:971-980`).

Legal state-per-mode is enforced at commit; cross-mode states are impossible
(`edgeGeneration.js:1904-1918`). **Mode never auto-switches — a Cloudflare failure MUST NOT fall
back to local-only** (`cli/services/cloudflarePublicationRuntime.js:106-112`).

Non-ready topology MUST NOT contain any `activeBrowserUrl`; reading such a snapshot throws
(`edgeGeneration.js:2326-2329`).

### 4.6 `[OPEN]` DS004 Question #8 — THE BLOCKER

> Managed-bridge private-service activation is **fail-closed** on the observed rootless Podman
> topology. An exact `host.containers.internal:host-gateway` entry in the child resolves through the
> **outer container's outer-facing interface**, not box loopback and not an address owned by the
> managed inner bridge. Binding `8081` there would violate the approved interface boundary, while
> binding the inner bridge's IPAM gateway fails because that address is not assigned in the outer
> namespace.
>
> — `ploinky/docs/specs/DS004-runtime-execution-and-isolation.md:165-174`

The three enumerated options (`DS004:289-299`):

1. Require a rootless Podman/Netavark mechanism mapping `host-gateway` to box loopback or a genuinely
   assigned managed-interface address — keeps the approved listener model unchanged.
2. Add an explicitly isolated in-box forwarding namespace whose only destination is loopback `8081`
   — **requires a new architecture decision and security review**.
3. Bind the outer-facing interface and rely on an exact interface firewall — **changes the stated
   bind contract; must not be implemented implicitly**.

**Latest attempt** (`container-image-builds@main` `9fd2641`, 2026-07-18): the box entrypoint discovers
its own routable IPv4 and pins `host_containers_internal_ip` in `containers.conf`
(`images/ploinky-box/entrypoint.sh:99-101`). This makes the mapping deterministic but does **not**
move it to loopback. **Verified: zero consumers of `box-transport.json` exist in `ploinky` — the
ploinky side was never wired up.** Question #8 remains open.

---

## 5. Cloudflare publication

> **Workspace policy** (`CLAUDE.md`): Box v5 may operate only an explicitly selected **existing**
> tunnel and zone, through **separate** encrypted connector/API secret handles. Never create
> quick/new tunnels, never mutate Cloudflare/DNS without explicit authorization, never expose secret
> values in docs, logs, fixtures, or artifacts.

### 5.1 Permitted API surface `[load-bearing]` — verified exhaustive

| Method | Path |
| --- | --- |
| `GET` | `/user/tokens/verify` |
| `GET` | `/accounts/{a}/cfd_tunnel/{t}` |
| `GET` / `PUT` | `/accounts/{a}/cfd_tunnel/{t}/configurations` |
| `GET` | `/accounts/{a}/cfd_tunnel/{t}/connections` |
| `GET` | `/zones/{z}` |
| `GET`/`POST`/`PUT`/`DELETE` | `/zones/{z}/dns_records[/{id}]` |

**Independently verified**: no tunnel creation or deletion endpoint exists in
`cli/services/cloudflarePublicationApi.js`; the only `POST` is to `dns_records`.

Connector argv is **exactly** `tunnel --no-autoupdate run --token-file <absolute-path>` — no
`--token` in argv, no quick tunnel, no `create`, no origin override; a relative token path throws
(`cli/services/cloudflarePublicationConnector.js:13-28`; pinned by
`tests/unit/cloudflarePublicationInfrastructure.test.mjs:92-98`).

Tunnel and zone are validated as **existing and in-scope** before any mutation: tunnel id matches,
`account_tag` matches, `deleted_at` absent, zone id matches, zone account matches
(`cloudflarePublicationApi.js:124-141`).

### 5.2 Secret separation `[load-bearing]` + a real gap

Connector token and API token MUST be **distinct** credentials with separate handles, enforced at
`cloudflarePublicationPlan.js:217-222` and `cloudflarePublication.js:135-141`.

> ⚠️ **`[OPEN]` GAP — independently verified.** The separation rule is enforced **only in the
> publication layer, not at generation-compile time**. A `desired.json` with **identical** handles
> currently becomes an **ACTIVE generation** and only fails later at reconcile. `edgeGeneration.js`
> contains no separation check. **The reimplementation must enforce this inside `normalizeDesired`.**

> ⚠️ **`[OPEN]` GAP — dual normalizers.** `SECRET_HANDLE` and `normalizePublicHostname` are each
> implemented **twice with different rules** (`edgeGeneration.js:54-57` vs
> `cloudflarePublicationPlan.js:7-10`). One direction fails **open**: a 151-char lowercase handle is
> accepted by the generation layer and rejected by the plan layer — it activates, then fails at
> reconcile. **Exactly one normalizer per field, shared by both layers.** This is the same defect
> class recorded in workspace memory as the "N-1 dual-normalizer 503 defect".

### 5.3 Ingress, DNS, journal `[load-bearing]`

Ingress is exactly one rule per hostname → fixed origin `http://127.0.0.1:8080`, plus a terminal
`http_status:404`. DNS is exactly a **proxied CNAME** to `<tunnelId>.cfargotunnel.com`, ttl 1.
Neither is configurable (`cloudflarePublicationPlan.js:259-269`).

The journal is an **ownership ledger, not a lock**. Double-apply is prevented by recording every DNS
record id Ploinky created and refusing to touch a record whose id no longer matches
(`CLOUDFLARE_DNS_OWNERSHIP_LOST`). Idempotency comes from list-then-update, not blind create
(`cloudflarePublication.js:603-622`, `:646-655`).

The journal is written after **each individual** DNS mutation, so partial failure preserves the
reduced ownership set rather than falsely reclaiming already-deleted records
(`cloudflarePublication.js:534-549`). Phases are a closed set of ten; a corrupt or symlinked journal
fails closed, never silently reinitializes (`cloudflarePublicationJournal.js:12-23`).

Cloudflare → local-only transition **requires the previous Cloudflare credentials to still be
present** so ingress and owned DNS teardown can verify before the local-only commit
(`cloudflarePublication.js:347-356`).

### 5.4 Secret hygiene `[load-bearing]`

One redaction function at every artifact boundary: exact-token substring replacement **plus** pattern
redaction of Bearer values, `?token=/key=/secret=` params, and JWT-shaped strings
(`cloudflarePublicationPlan.js:77-87`).

Secrets are resolved lazily into a local variable and **nulled in `finally`** — never stored on the
controller instance (`cloudflarePublication.js:581-585`).

`cloudflared` receives a **minimal environment** (PATH plus at most `SSL_CERT_FILE`/`SSL_CERT_DIR`/
`TZ`); the parent env is not inherited. Output is line-buffered and redacted with both the token and
the token-file path (`cloudflarePublicationConnector.js:30-38`, `:58-64`).

Token file: `wx` mode `0600` in an ephemeral `mkdtemp` under a `0700` runtime dir, mode re-verified
after write, directory removed on exit **and** on parent `process.exit`
(`cloudflarePublicationConnector.js:152-159`).

JSON parse errors on desired state MUST NOT echo source text — desired state contains secret handles
(`edgeGeneration.js:198-207`).

---

## 6. Router, listeners, reachability

### 6.0 Three listeners, ONE process `[load-bearing]`

RoutingServer opens exactly three listeners in a single process
(`cli/server/RoutingServer.js:720-728`, `:897-905`):

| Listener | Bind | Purpose |
| --- | --- | --- |
| public / control | `0.0.0.0:8080` (wildcard) | the only listener reachable via the loopback publication and in-box cloudflared |
| private | `8081` on an **enumerated address set** | `{127.0.0.1} ∪ {exact current managed bridge gateways}` |
| detailed health | `.ploinky/run/router-health.sock`, mode `0600` | supervisor-only; **absent from both TCP listeners** |

`privateServer.listen()` MUST NEVER be called. The private HTTP server receives sockets only via
`emit('connection', socket)` from the exact-address listener set, with `pauseOnConnect` so request
bytes cannot race the parser (`cli/server/privateListenerSet.js:124-130`; pinned negatively at
`tests/unit/routerListener.test.mjs:34-43`).

Every accepted private socket is re-validated **at accept time** against both the record's expected
address and the live classifier verdict; a mismatch destroys the socket before any byte is parsed
(`privateListenerSet.js:104-123`). The interface classifier **fails closed**: any Podman failure,
malformed JSON, or ownership-label mismatch clears the entire gateway set rather than retaining a
stale one (`cli/server/listenerInterfaceClassifier.js:167-183`).

Startup is **strict**: a partial bind throws `PRIVATE_LISTENER_SET_INCOMPLETE`, closes every
already-bound address, and the router `process.exit(2)`s (`privateListenerSet.js:220-259`;
`RoutingServer.js:888-895`). Periodic reconciles are non-strict.

The inner router port is a **compile-time constant 8080**; `routerPort.js` is a *validator*, not a
chooser. There is no conflict-resolution path — `EADDRINUSE` on 8080 exits 2. Only the outer host
port varies, and it is a **digest input to the generation** (`cli/services/edgeGeneration.js:1191-1193`).

> **Footgun to fix in the reimplementation:** `Watchdog.js` requires `PORT` to be present and exactly
> `8080` (`Watchdog.js:37-39`), while `RoutingServer.js` treats `PORT` as *optional*
> (`RoutingServer.js:83-91`). Verified: `env -u PORT node -e "import('./cli/server/Watchdog.js')"` →
> `PLOINKY_ROUTER_PORT_INVALID`. That asymmetry is currently load-bearing for the boot path.

### 6.1 Host classification `[load-bearing]`

Happens **before path dispatch**, as a function of `(listener class, exact Host)`. A `private`
listener accepts only `host.containers.internal` or loopback names; a `managed` listener accepts
**only** `host.containers.internal`. **Source-IP provenance is NOT an authorization capability**
(`cli/server/edgeRoutePlan.js:119-140`, `:401-405`).

### 6.2 Public reachability `[load-bearing]`

An agent is publicly reachable only if **all** hold: (a) `<repo>/<agent>` resolves to exactly one
enabled non-disabled route; (b) a `desired.hosts[<fqdn>]` entry selects it; (c) the complete 5-field
Cloudflare tuple is present so mode is `cloudflare`; (d) the active selector's `publicationState ===
'cloudflare-ready'`; (e) the compiled policy decision is not `deny`; (f) a live target hostPort exists
and matches the compiled target. Failing (d) yields `HOST_SELECTOR_INACTIVE` **503, not 404**
(`edgeRoutePlan.js:437-441`, `:327-331`).

### 6.3 Private-only services `[load-bearing]`

A service in `security.internalServiceConsumers` MUST declare `access: 'authenticated'`, MUST NOT get
a `.localhost` alias, MUST NOT be publishable on a host, MUST NOT be mountable, and resolves **only**
on the private listener (`edgeGeneration.js:1005-1010`, `:1063-1072`;
`edgeRoutePlan.js:434-436`).

Local aliases are route-scoped `<slug>.<routeKey>.localhost` and work independently of publication
state (checked before the `cloudflare-ready` gate) (`edgeGeneration.js:982-988`).

### 6.4 Router surfaces `[load-bearing]`

Router-owned surfaces on a public host come from a **closed catalog of six**
(`agent-mcp`, `blob-transfer`, `browser-auth`, `marketplace-ui`, `topology-projection`,
`workspace-assets`), explicitly opted into per host; everything else on the reserved list 404s. A
dedicated-service host gets its service plus at most 4 auth-transaction paths — **never `/auth/token`
or `/auth/account`** (`edgeGeneration.js:29-38`; `edgeRoutePlan.js:16-26`).

### 6.5 Agent-card fanout `[load-bearing]`

Positive allowlist of exactly two caller headers (`accept-language`, `user-agent`) plus synthesized
`accept: application/json`; every credential/identity/forwarding/hop-by-hop header dropped
(`cli/server/agentCardFanout.js:3-12`).

Consistency is **all-or-nothing on the generation**: each fanout leg re-checks the lease before
dialing, and if any leg reports `generationChanged` the whole aggregate becomes 503 — partial results
are never returned. An individual agent being merely *unreachable* is a per-agent error entry and
still yields 200 (`cli/server/RoutingServer.js:279-295`).

### 6.6 Browser topology projection `[load-bearing]`

Returns exactly **one** locator, requires a non-guest authenticated user, re-resolves through the
full route plan against the service's own local alias, and verifies the **same** lease id +
activationId. It MUST NOT enumerate (`cli/server/edgeTopologyRoute.js:72-84`).

---

## 6B. Agent-side contract — what every agent must change

> **The branch has TWO phases and the commit titles describe phase 1.** Phase 1 (Jul 8–14) built
> `basic/web-publishing` and wired Explorer `qa`/`prod` profiles to it. Phase 2 (the Jul 16/17
> checkpoint) **deleted it** and moved edge publication into the box. A re-implementer following the
> commit list literally would rebuild a retired agent. Verified independently:
> `git -C basic ls-tree --name-only ploinky-box -- web-publishing cloudflared` → **empty**.

### 6B.1 Port declaration — exactly one style survives `[load-bearing]`

The branch migrates `profiles.*.openPorts` → `profiles.*.additionalServerPort` → `httpServices[].port`.
**Only the third exists at tip**; the first two are asserted absent by tests. Verified on
`onlyOffice/manifest.json`: all three profiles have neither field.

```json
"httpServices": [
  { "slug": "onlyoffice",        "port": 7000, "externalPrefix": "/services/onlyoffice/",
    "internalPrefix": "/control/", "access": "authenticated" },
  { "slug": "onlyoffice-editor", "port": 8080, "externalPrefix": "/public-services/onlyoffice-editor/",
    "internalPrefix": "/",         "access": "public" }
]
```

`externalPrefix` **encodes the access class**: `/services/` = authenticated, `/public-services/` =
public. `httpServices[]` MUST NOT carry the removed `auth`, `mode`, or `forceGuest` fields.

**Not a blanket migration:** only a *distinct in-container TCP listener* becomes `httpServices`.
Path-policy-only surfaces stay `routerAccess.httpRoutes` (`webAssist` is unchanged on the branch), and
`webmeetAgent` must have **zero** `httpServices`.

### 6B.2 Other manifest changes `[load-bearing]`

| Field | Change | Semantics |
| --- | --- | --- |
| `network` | `{name, aliases[]}` → `{mode, attachments[{name, primary?}]}` | Ploinky derives the DNS alias from the agent id |
| `health.readiness.script` | replaces `readiness.protocol: tcp` | a TCP-open check is insufficient — the script must prove listener host *and* socket owner |
| `container` | tag → `@sha256:` | immutable digest pin |
| `volumes` (Explorer) | added `.ploinky/repos` → `/workspace/.ploinky/repos` | cross-repo IDE-plugin discovery |
| `enable[]` | heavy media/office deps marked `no-wait` | `liveKitServerAgent`, `webmeetStt`, `webmeetAgent`, `onlyOffice`, `multimedia`, `webAssist` |
| `start` | raw interpreter → baked verifier entrypoint (`/usr/local/bin/webtty-v5-start`) | image self-verification before bind |

Explorer MUST have **exactly one profile, `default`** (verified) — no `qa`/`prod`, no per-profile
`enable`, no `configProviders`.

### 6B.3 Runtime topology resolution `[load-bearing]`

Browser-facing URLs MUST be resolved **per operation** from `PLOINKY_EDGE_TOPOLOGY_FILE` via
`${PLOINKY_AGENT_LIB_DIR}/lib/edgeTopology.mjs` with `requireActive: true`, and MUST fail closed on
generation drift. They MUST NOT be manifest env or startup-cached — the WebMeet manifest lost every
`WEBMEET_LIVEKIT_*`, `WEBMEET_TURN_*`, `WEBMEET_PUBLIC_LIVEKIT_URL`, `WEBMEET_STUN_URLS` entry.

Agent-to-agent calls MUST go to `PLOINKY_INTERNAL_ROUTER_URL` with a `Ploinky-Agent-Assertion` bound
to method+path+body. No fallback to the public Router and no direct-target path.

Long-lived credentials MUST NOT reach agent env — only short-lived brokered material, validated
against the *current* topology generation (a TURN URL outside the current generation is rejected).

### 6B.4 Nested rootless Podman breakages and their fixes `[load-bearing]`

| Symptom | Cause | Fix |
| --- | --- | --- |
| RabbitMQ aborts at boot | default `rss` memory strategy reads inner PIDs via procfs, unavailable through the outer container | `vm_memory_calculation_strategy = erlang` |
| RabbitMQ start hangs | Debian init's `rabbitmqctl wait` PID check, same procfs issue | `start-stop-daemon --background`; DS's own TCP loop becomes the gate |
| DocService binds wildcard | vendor binary has no bind-host setting | digest-pinned `LD_PRELOAD` interposer, verified before any `listen()` |
| Ephemeral control port unusable | `127.0.0.1:0:7000` can't be validated before mutation | stable port, then eliminated via `httpServices[].port` |

Every third-party-image patch MUST be **fail-closed**: applied exactly once, verified, nonzero exit
otherwise (`exit 42` / `exit 43` on patch-count mismatch). Every bundled support service binds
loopback and each write is re-verified.

### 6B.5 Digests that move in lockstep `[load-bearing]`

`assistos/onlyoffice-agent@sha256:eb9ec11b…`, `assistos/webtty-agent@sha256:8ff65bb7…`, plus three
OnlyOffice literals (`documentserver_index_sha256`, `ubuntu_snapshot`, `docservice_bind_scope`)
**duplicated across `onlyOffice/src/index.mjs` and `onlyOffice/scripts/configure-document-server-v5.sh`**
— a real footgun. Cloudflared is pinned in **five** places across `container-image-builds`.

---

## 7. Do not carry forward — dead ends

These were built, iterated, and then **deleted** on the branch. Reimplementing them wastes the effort
twice.

| # | Dead end | Evidence |
| --- | --- | --- |
| DE-1 | **The managed gateway container.** ~600 lines of exact-record assertions, a Go binary, an image + publish workflow, a socket-inode ownership label, two namespace-entry probes. | ploinky `c167bcf`; container-image-builds `4133cb9` deleted `images/ploinky-network-gateway/` |
| DE-2 | **`container/ploinky-box.mjs` wrapper** — 11 commits, then deleted | added `8e44068`, deleted `dca1ee4` |
| DE-3 | **`container/wrapper-tests.mjs`** — 13 commits, then deleted | same era |
| DE-4 | **Publish-planner subsystem** (`box-publish-planner.mjs`, `cli/services/boxStartPublishPlan.js` −793, `container/box-start-publish-plan.mjs`) — a whole authoritative-planner architecture from the 07-11 plan | deleted inside checkpoint `f428dd4` |
| DE-5 | **`cloudflared/` agent + web-publishing agent** — full implementations plus ~1,800 lines of design docs, deleted from `basic/`. Replaced by ploinky-internal `cloudflarePublication*.js`. | `basic` `738b9a3` deleted `cloudflared/{manifest,lib,runtime,tools,mcp-config}`, `docs/specs/DS004-web-publishing-agent.md` |
| DE-6 | **`slirp4netns:allow_host_loopback=true` + `--replace`** — punched a hole to box loopback for all agents | added `44b72ab`; now forbidden by source-absence test |
| DE-7 | **Three successive `/etc/hosts` mechanisms**: `--hosts-file <generatedFile>` → `--no-hosts` + `-v managed-hosts:/etc/hosts:ro` → `--hosts-file=none --add-host`. Only the third survives. | `b12b606`, `c167bcf` |
| DE-8 | **`CreateCommand`-based policy validation** — Podman normalizes it inconsistently | replaced by `HostConfig` validation |
| DE-9 | **Hardcoded `podman machine ssh podman` fallbacks** | removed with the gateway |
| DE-10 | **In-place `podman restart` on liveness failure** — silently skipped network reconciliation | `c167bcf` |
| DE-11 | **`profileServer.js` / `profileServerProxy.js`** and the standalone dashboard/status `login.html`+`login.js` | deleted in `f428dd4` |

### 7.1 Forbidden source — enforced by tests `[load-bearing]`

`tests/unit/networkHardCutSourceAbsence.test.mjs:52-69` forbids these from ever reappearing under
`Agent/`, `bin/`, `cli/`, `container/runtime-contract.mjs`, `container/runtime-supervisor.mjs`:

`ploinky-network-gateway`, `NETWORK_GATEWAY_IMAGE`, `gatewayContainerName`, `ensureGateway`,
`reconcileManagedControlPlane`, `io.assistos.ploinky.resource…gateway`, `router.sock`,
`managed-hosts`, `http://ploinky-router:8080`, `slirp4netns:allow_host_loopback=true`,
`remoteShellCommand`, `executeInRootlessNamespace`.

`tests/unit/runtimeV5SourceAbsence.test.mjs` additionally forbids `web-publishing`,
`basic/cloudflared`, `cloudflared-agent`, `standalone cloudflared`, `WEB_PUBLISHING_*`,
`ONLYOFFICE_PUBLIC_URL`, `ONLYOFFICE_INTERNAL_URL`, `ONLYOFFICE_CALLBACK_BASE_URL`,
`WEBMEET_*LIVEKIT`, `WEBMEET_TURN_`, `WEBMEET_TLS_HOSTNAME`, `WEBMEET_CERT_EMAIL`,
`WEBDASHBOARD_TOKEN`.

**Port both source-absence suites early** — they are the cheapest guard against re-growing the dead ends.

> ⚠️ **But fix their scope first.** `tests/unit/runtimeV5SourceAbsence.test.mjs:20` sets
> `const normativeRoots = ['docs'];`, so the gate scans **design documents** as well as executable
> paths. That makes it structurally unsatisfiable: a design doc cannot describe what it removed
> without tripping its own gate. Verified — the suite currently reports 39 violations, **all** in
> `docs/superpowers/`, while the CI workflow demands an exact `pass 7` summary. **Scan executable
> paths only.** Also: both suites obfuscate their own forbidden strings
> (`['additional','ServerPort'].join('')`) to avoid self-matching — a ban list that must hide its
> terms from itself belongs in review policy, not a grep test.

---

## 8. Structural lessons — what made this unmaintainable

Not design defects; process defects. The new plan should encode countermeasures.

| # | Problem | Countermeasure for the new branch |
| --- | --- | --- |
| S-1 | **Opaque mega-commits.** `f428dd4` = 210 files / +31,290, no rationale. Zero bisect surface. | Enforce reviewable increments. No commit may create and delete subsystems simultaneously. |
| S-2 | **Duplicated validators.** Three parallel copies of "is this a valid managed bridge?" (`networkLifecycle.js:514-549`, `listenerInterfaceClassifier.js:67-113`, `container/listener-network-inventory.mjs:84-160`), three copies of `NETWORK_LABELS`; two `SECRET_HANDLE`/`normalizePublicHostname`/`isPlainObject`/`deepFreeze`/`stableStringify`. | One shared validation module. No second implementation of any normalizer. |
| S-3 | **Test-only control flow in production paths.** Four named `testHooks` crash-injection points plus a `preserveCrashArtifact` flag inside the security-critical commit path (`edgeGeneration.js:1228, 1995, 2057, 2173`). | Process-level fault injection instead. |
| S-4 | **Source-text regex assertions.** `routeModeTransitions.test.mjs:21-24` greps `noWaitWorker.js` as a string. Breaks on rename; passes on semantically broken code. | Behavioral assertions. (Source-*absence* gates in §7.1 are a deliberate, separate exception.) |
| S-5 | **Leaked two-phase protocol.** `prepare`/`abort` lease API referenced from 6 modules, ~25 call sites, each re-implementing try/catch. | One transaction runner taking a closure. |
| S-6 | **Publication cycle.** Publication commits back into the generation it polls, guarded by four overlapping mechanisms (a 256-entry `handledActivations` Set, a poll interval, a mutation lease, a revision counter) plus an `adoptSelectedLocalState` special case to break self-triggering. | One-directional state machine; publication never writes the generation it reads. |
| S-7 | **Two independent restart/backoff schedulers** that can both arm timers for the same failure (`cloudflarePublication.js:736-782`, `cloudflarePublicationRuntime.js:252-325`). | Pick one. |
| S-8 | **Indirection with no content.** `coordinatedEdgeApply.js` is 28 lines that only default two DI options. | Fold into the composition root. |
| S-9 | **Dead enum members.** `hostSelection.kind === 'private'` is never read; the private path branches on `listener === 'private'` instead. | Prune the discriminator. |
| S-10 | **Contract version churn** 1→2→3→4→5 in ~2 weeks, each a destroy/recreate hard cut. Commit titles are unreliable — `4f33c1b "Publish contract-3"` did not bump the label; `9f46113` did. | Pin once. The Dockerfile `LABEL` is the only authority. |
| S-11 | **Three of five image test suites run in NO workflow.** `image-definitions.test.mjs` (743 lines), `box-transport-entrypoint.test.mjs`, `livekit-egress-loopback.test.mjs` are referenced by zero workflows — every invariant they encode can be broken by a push without CI noticing. | Wire every suite into CI, or delete it. |
| S-12 | **Silent total-outage mode.** `httpRouteAccessPolicy.bindProviders(...)` failure is swallowed into a log line inside `server.listen`; `evaluate()` then returns `POLICY_PROVIDERS_UNBOUND` (503) forever (`RoutingServer.js:927-936`). | Fail startup loudly. |
| S-13 | **Dual route-default normalizers.** `edgeGeneration.routeDefaultDecision` (compile-time, reads `agents.json`) and `authContext.resolveRouteDefaultHttpAccess` (runtime provider, reads auth context) implement the same rule twice with different inputs. Divergence silently changes admission. | One function. |
| S-14 | **Operator-precedence bug in the private guard.** `!plan?.ok \|\| plan.listener !== 'private' && plan.kind !== 'private-operation'` parses as `!ok \|\| (A && B)` (`privateRouter.js:121`). Not reachable today — but only by accident of how plans are emitted. | Explicit parens / allowlist. |

---

## 9. Verification criteria

Runnable commands, not adjectives.

```bash
# ploinky unit suite — baseline to match or beat (branch: 1445 pass / 6 fail / 1453 total)
cd ploinky && node --test tests/unit/*.test.mjs tests/unit/*.test.js

# the two hard-cut gates — must pass with zero findings
cd ploinky && node --test tests/unit/networkHardCutSourceAbsence.test.mjs
cd ploinky && node --test tests/unit/runtimeV5SourceAbsence.test.mjs

# core box subsystems
cd ploinky && node --test tests/unit/runtimeSupervisor.test.mjs        # branch: 145 pass
cd ploinky && node --test tests/unit/networkContract.test.mjs tests/unit/networkLifecycle.test.mjs
cd ploinky && node --test tests/unit/edgeDialLease.test.mjs tests/unit/edgeRoutePlanInterface.test.mjs
cd ploinky && node --test tests/unit/cloudflarePublicationPlan.test.mjs

# image contract statics
cd container-image-builds && node --test tests/image-definitions.test.mjs
```

**Acceptance gates that have NEVER passed on the branch** — the new plan must treat these as the real
finish line, not as regression checks:

| Gate | Status |
| --- | --- |
| Fresh full Explorer graph on managed bridges | **BLOCKED** on DS004 Q#8 — the graph never launched |
| Two-account WebMeet screen-share | **BLOCKED** |
| Native cross-network media matrix | **BLOCKED** (requires Linux amd64/arm64; the run host was darwin/arm64) |
| External TURN UDP + TLS fallback, credential-expiry rejoin | **BLOCKED** |
| Any live Cloudflare API call | **NEVER EXECUTED** — unit-tested against fakes only |
| Real-browser OnlyOffice / Umami / GPTResearcher routing | **BLOCKED** |

### 9.1 Review-findings closure status — the number that matters

The 2026-07-15 review raised **15 findings** (11 × P1, 4 × P2). All 15 were addressed *at design
level* (14 `Accepted` / `Accepted with modification`; P1-2 disposed as "not a missing design
decision"). But:

**Zero of the 15 are confirmed closed at the live-system level.** Four have passing unit/static lanes
(P2-1 static runtime contract, P1-11 web-publishing hard cut, P1-4 stale-policy, P2-2 Egress port
split). The other eleven are gated behind DS004 Q#8 or behind absent hardware/credentials.

Two methodological caveats that a reimplementer must not paper over:

| Caveat | Consequence |
| --- | --- |
| The review examined an **earlier revision** of the design — its line citations no longer resolve against the file on disk | "Was this fixed?" cannot be answered from the review's line numbers |
| The verification document **never references a finding ID** — it reports *gates*, not closures | Every finding→verification mapping is inference, not record |

The evidence dossier the design cites (`REVIEW_FINDINGS_2026-07-15-box-edge-routing-EVIDENCE.md` at
`ploinky/docs/superpowers/specs/`) is **absent from disk and from git history** at that path — its
content is unverifiable beyond the design's own summary table. (A file of that name exists at the
*workspace root*; treat the two as different artifacts until reconciled.)

---

## 10. Open questions the new plan MUST settle before coding

| # | Question | Why it blocks |
| --- | --- | --- |
| Q1 | **DS004 Question #8** — how does a rootless managed bridge reach private Router `8081`? Choose among the three options in §4.6. **State it precisely: the design asserts two requirements that are jointly unsatisfiable on rootless Podman** — (a) bridge agents reach the router via `--add-host host.containers.internal:host-gateway`, and (b) the private listener binds only loopback + *assigned* managed-bridge interfaces. On the observed topology `host-gateway` resolved to `169.254.1.2` while the advertised bridge gateway `10.89.0.1` was **not assigned in the outer namespace**, so the router threw `PRIVATE_LISTENER_SET_INCOMPLETE` rather than widen the bind. | Blocks the entire private-lane release slice. Everything else is downstream. |
| Q2 | How do `startupConfigProviders` (DS015, box branch) and `manifestStartup.js` (upstream `2c11a07`) reconcile? | 18-file merge collision; both claim startup configuration. |
| Q3 | **Is UDP `7882` binding `0.0.0.0` acceptable?** The mapping is created **unconditionally — even in `local-only` mode and even when LiveKit is absent**. The design acknowledges the exposure and its only mitigation is "let an operator firewall `7882`" — a manual, out-of-band step with **no runtime enforcement and no acceptance criterion**. | This is the single place the design's fail-closed posture degrades to operator discipline, and it contradicts the loopback-only TCP boundary. |
| Q4 | Which contract number does the new implementation start at, and is contract 5 frozen? | Determines whether existing published images are reusable. |
| Q5 | **Which tip is authoritative — `ploinky-box` or `ploinky-phase1-http-router-proxy-mvp` (+26 commits)?** | Changes the entire extraction baseline. See §0.0. |
| Q6 | Does profile-level `configProviders` **replace** or **concatenate** with manifest-level? | DS015 says "replaces"; the collector concatenates (verified: `[{agent:'r/top'},{agent:'r/qa'}]`). Doc and code disagree. |
| Q7 | Should `slirp4netns` stay in the image? | Still installed (`Dockerfile:19`) but no consumer found; entrypoint requires netavark + pasta. Likely vestigial. |
| Q8 | Is `PLOINKY_BOX_ENTRYPOINT_TRANSPORT_ONLY=1` acceptable? | It bypasses the **entire** boot self-check — identity, mounts, devices, privilege, Podman, managed state (`entrypoint.sh:195-198`). |

---

## 11. Explicitly out of scope — exclude from the new branches

| Item | Evidence |
| --- | --- |
| Explorer commits `9dce99b` (tasks dark theme), `af76bfe` (skill actions layout), `63cb1b2` (custom-select rollout) | **Provably already on `origin/main`** — unrelated UI work that rode along |
| `d07ba5a` (smoke test for custom selects) | follow-up to `63cb1b2` |
| `e7e4a03` "Fix standalone WebMeet shared component route" | listed as box-relevant but is not — a custom-select leading-slash change, **fully reverted** by the checkpoint (`git diff 1cea936..ploinky-box` on the test file returns empty) |
| `b886a35` + `0e81d90` (cloudflared production dashboard, add + revert) | net zero: `git diff --stat b886a35^ 0e81d90` returns empty |
| `d36252c`, `5f45a76` | doc deletions only |
| Explorer `qa` / `prod` profiles, `deploy-explorer-qa.yml`, `deploy-skills-explorer.yml` | deleted (1,682 lines of workflow); Explorer is single-profile now |
| `copilot-agents` `837a7d2` | Empty diff |
| `proxies` Soul Gateway plan deletions | Unrelated to box |
| Any `cloudflared` / `web-publishing` agent | Deleted; forbidden by source-absence test (§7.1) |
| Migration paths from earlier contracts | Established policy is hard cut, no migration |

---

*Sections 2–7 synthesize delegated subsystem analyses; every claim carries a file:line pointer.
Claims marked "independently verified" were re-checked in the main session against the working tree.*
