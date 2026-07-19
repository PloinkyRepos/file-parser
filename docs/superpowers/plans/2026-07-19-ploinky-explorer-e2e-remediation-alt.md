# Ploinky Explorer E2E / Release-Gate Remediation Implementation Plan (alt)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

> **Note:** A concurrently authored plan for the same remediation exists at `docs/superpowers/plans/2026-07-19-ploinky-explorer-e2e-remediation.md`. This file is an independently derived alternative; the design differences are summarized in "Design alternatives" near the end. Execute one plan, not both.

**Goal:** Make the full Explorer runtime release gate startable with explicit operator-owned edge/media inputs and topology-aware private-listener validation, so browser E2E runs against the gated graph and `docker.io/assistos/ploinky-box:runtime` promotes only on a fully green gate.

**Architecture:** Two independent blockers share one gate (`container/smoke-runtime.mjs`, ploinky repo). Blocker 1 (missing operator inputs) is fixed by defining the operator-candidate contract in DS005 first, then adding a deterministic renderer (`render-smoke-edge-desired.mjs`) that both local operators and the `container-image-builds` publish workflow use to supply `SMOKE_EDGE_DESIRED_FILE` + `SMOKE_MEDIA_PUBLIC_IPV4`. Blocker 2 (listener-profile mismatch) is fixed by making the `dynamicBindSet` validator topology-aware: the expected exact bind set becomes box loopback plus only those managed bridge gateways whose addresses are actually assigned in the box outer namespace, with missing topology evidence failing closed. Runtime router code (`cli/server/*`) is not changed; DS004 Question #8 stays open.

**Tech Stack:** Node 24 (in-box) / Node 20+ (host), `node:test`, rootless Podman ≥ 5.4 + netavark + pasta, GitHub Actions (`workflow_dispatch`), Playwright 1.60 (Explorer smoke suite).

**Classification:** **Consequential.** This touches release gates, runtime topology validation, E2E smoke behavior, and two repositories (`ploinky`, `container-image-builds`), and its final verification can move the mutable `docker.io/assistos/ploinky-box:runtime` tag. Every task therefore has its own test cycle, commit checkpoint, and rollback path, and the externally visible steps (branch pushes, CI dispatch) require explicit operator confirmation.

## Root-Cause Evidence (verified 2026-07-19)

| # | Fact | Source |
| --- | --- | --- |
| 1 | GitHub run `29658478054` (`AssistOS-AI/container-image-builds`): both arch jobs failed only at step "Gate exact fixed outer publications and lifecycle"; "Publish mutable multiarchitecture runtime" was skipped | `gh run view 29658478054 --json jobs` |
| 2 | The step log aggregates exactly two failures: `runtime-v5 release gates failed (2)` | run log (`--log-failed`) |
| 3 | Failure A: `routing listener profile 'routing-graph-v5' did not converge in 30000ms: listener rule 'router-private' expected exact bind set 10.89.0.1,127.0.0.1, found 127.0.0.1` | run log |
| 4 | Failure B: `FULL_EXPLORER_GRAPH requires both SMOKE_EDGE_DESIRED_FILE and SMOKE_MEDIA_PUBLIC_IPV4; no public-IP discovery or host-capability default is permitted` | run log |
| 5 | The workflow supplies `SMOKE_FULL_GRAPH_ARGS_JSON` + `SMOKE_FULL_GRAPH_REPOSITORIES_JSON` but neither operator input | `container-image-builds/.github/workflows/publish-ploinky-box-image.yml:359-373` |
| 6 | The gate's operator-input checks: absolute readable file; valid JSON; `media.publicIPv4 === normalizePublicMediaIPv4(SMOKE_MEDIA_PUBLIC_IPV4)`; no `cloudflare` key; empty `hosts`; exactly one `security.hostNetworkAllowedInstances` entry | `ploinky container/smoke-runtime.mjs:530-562` |
| 7 | `normalizePublicMediaIPv4` rejects every non-globally-routable IPv4 (private/loopback/special ranges) — "no synthetic public IPs" is mechanically enforced | `ploinky cli/services/edgeGeneration.js:120-134` |
| 8 | Desired-state contract: top-level keys `schemaVersion(=1)`, `hosts` (required object), `security` (required; only `hostNetworkAllowedInstances` + `internalServiceConsumers`), `media` optional (`{publicIPv4, addressMode: 'direct'\|'nat-forward'}` exactly), `turn`/`cloudflare` optional; host-network entries are `<repo>/<agent>` | `edgeGeneration.js:802-943, 758-765` |
| 9 | Validator demands the actual 8081 bind set EXACTLY equal `{127.0.0.1} ∪ managedGateways`, with gateways read from nested `podman network inspect` IPAM | `ploinky container/listener-inventory.mjs:542-550`, `container/listener-collector.mjs:137-174` |
| 10 | Runtime deliberately tolerates `EADDRNOTAVAIL` on managed-gateway binds (inactive lane), strict-fails only loopback/non-managed bind errors | `ploinky cli/server/privateListenerSet.js:16-18, 229-237` |
| 11 | Specs already document the observed topology: "binding the inner bridge's IPAM gateway fails because that address is not assigned in the outer namespace … remains blocked pending Question #8"; "Startup must not widen the listener or install a compatibility forwarder" | `DS004:165-173`, `DS005:24-36`, `DS007:108-119`, `DS011:40-45` |
| 12 | Runtime gateway discovery (`listenerInterfaceClassifier.js:139-175`) and gate discovery use the same source (nested podman network IPAM), so only unbindable-gateway treatment differs | code read |
| 13 | No file under `ploinky docs/specs/` mentions `publicIPv4`, `edge-routing`, or `desired.json` — the operator-candidate contract is spec-undocumented | `grep` across `docs/specs/*.md` |
| 14 | `smoke-runtime.mjs` unconditionally tears the box down in `finally`, so browser E2E has no live target after a passing gate | `smoke-runtime.mjs:792-799` |
| 15 | Explorer browser harness reads `SMOKE_BASE_URL`; target spec `specs/00-router-auth.spec.mjs` exists (2 tests) | `AssistOSExplorer/tests/smoke/scripts/run-playwright.mjs:80`, `specs/00-router-auth.spec.mjs` |
| 16 | Local full-graph runs need 7 exact git checkouts; `webmeetInfra` and `AchillesCLI` are NOT present in the workspace; `UmamiAgent`, `basic`, `proxies`, `AssistOSExplorer`, `container-image-builds` are | filesystem check |
| 17 | The focused unit gate is `node --test` over `tests/unit/*.test.{js,mjs,cjs}` (316/316 green on the branch); `container/listener-inventory-tests.mjs` is a `node:test` file NOT covered by that glob and not referenced by any automation | `tests/test_all.sh:192-210`, `grep` |

## Repo Ownership (who owns each fix)

| Fix | Owner repo | Why |
| --- | --- | --- |
| Operator-candidate contract documentation | `ploinky` (`docs/specs/DS005`, `container/README.md`) | DS005 owns routing/edge surfaces; the gate and its docs ship together |
| Desired-state renderer + `normalizeEdgeDesiredState` export | `ploinky` (`container/`, `cli/services/edgeGeneration.js`) | Schema authority lives in `edgeGeneration.js`; renderer must evolve in lockstep with the smoke |
| Topology-aware listener validation + evidence collection + profile rationale text | `ploinky` (`container/listener-inventory.mjs`, `container/listener-collector.mjs`, `container/smoke-runtime.mjs`, `container/profiles/*.json`) | Validator, collector, profiles, and smoke are one atomic in-repo unit consumed at the same commit |
| Post-gate hold for browser E2E | `ploinky` (`container/smoke-runtime.mjs`) | Teardown behavior belongs to the smoke harness |
| Workflow operator input, validation, render, env plumbing, promotion-shape regression test | `container-image-builds` (`.github/workflows/publish-ploinky-box-image.yml`, `tests/`, `README.md`) | The publish workflow is the CI supply path for operator inputs |
| Browser E2E | `AssistOSExplorer` — **no code change** | `tests/smoke` already accepts `SMOKE_BASE_URL`; only the runbook below is needed |
| DS004 Question #8 | **out of scope** | The private-lane architecture choice stays open; nothing here resolves or works around it |

**Do DS004/DS005/docs need clarification before code changes? Yes, narrowly:** DS005 gains the (currently spec-absent) operator-candidate contract and one release-gate topology-evidence subsection (Task 1, first commit). DS004/DS007/DS011 need **no** edits — they already state the fail-closed behavior this plan encodes into the gate. Question #8 is not touched.

## Global Constraints

- ploinky work happens in the existing worktree `/Users/danielsava/work/file-parser/ploinky/.worktrees/ploinky-phase1-http-router-proxy-mvp` on branch `ploinky-phase1-http-router-proxy-mvp` (HEAD `3dc135c` at plan time). Do not create a new worktree.
- `container-image-builds` work happens at `/Users/danielsava/work/file-parser/container-image-builds` on a new branch `full-gate-operator-inputs` cut from pushed `main` commit `9fd2641`.
- Commit messages: present-tense imperative, grouped by concern. **Never add `Co-Authored-By`, `Generated with`, or any AI/agent attribution** (workspace commit policy; it overrides any tool default).
- Pushing branches and dispatching the publish workflow (Task 8) can publish images / move `docker.io/assistos/ploinky-box:runtime`. **Both require explicit operator confirmation at execution time.**
- Never weaken these existing negative guarantees (they must all still hold and stay tested): exact two outer publications `127.0.0.1:<port>→8080/tcp` + `0.0.0.0:7882→7882/udp` (`EXPECTED_BINDINGS`), `FORBIDDEN_TARGETS` (no `8081/tcp`, no service ports), wildcard-bind rejection, physical-interface bind rejection, `rejectAdditionalContainers`, "no public-IP discovery or host-capability default is permitted", local-only candidate (no `cloudflare` key, empty `hosts`), exactly one host-network capability owner.
- `SMOKE_MEDIA_PUBLIC_IPV4` at gate runtime is always an operator-owned, globally routable unicast IPv4. Literals such as `8.8.8.8` below appear **only** inside unit tests of the validator itself, never as a gate input or default.
- No Cloudflare tunnel/DNS operations anywhere in this plan; the candidate file contains no secret values; candidate files are written mode `0600`.
- `cli/server/*` runtime listener behavior is unchanged. The only `cli/` edit is one additive export in `cli/services/edgeGeneration.js`.
- Coding style: 4-space JS indent, ES modules, `node:` prefixed core imports, trailing commas on multi-line, match surrounding idiom.

## File Structure

| File | Action | Responsibility |
| --- | --- | --- |
| `ploinky docs/specs/DS005-routing-and-web-surfaces.md` | Modify (additive) | Operator-candidate contract + release-gate topology-evidence language |
| `ploinky container/README.md` | Modify (additive) | Operator runbook: inputs table, renderer usage, hold flag |
| `ploinky tests/unit/smokeOperatorInputsDocumentation.test.mjs` | Create | Pins the doc contract (regex, style precedent: `smokeFullGraphPrerequisites.test.mjs`) |
| `ploinky cli/services/edgeGeneration.js` | Modify (one export) | Expose `normalizeEdgeDesiredState` (alias of internal `normalizeDesired`) |
| `ploinky container/render-smoke-edge-desired.mjs` | Create | Deterministic local-only candidate builder + CLI |
| `ploinky tests/unit/renderSmokeEdgeDesired.test.mjs` | Create | Shape, rejection, and round-trip tests for the renderer |
| `ploinky container/listener-collector.mjs` | Modify | `collectOuterAddressInventory` + `assertOuterAddressInventoryCurrent`; wire into `collectBoxListenerInventory` |
| `ploinky tests/unit/listenerCollectorOuterAddresses.test.mjs` | Create | Stubbed-run tests for the new collectors |
| `ploinky container/listener-inventory.mjs` | Modify | Topology-aware `dynamicBindSet` evaluation; evidence-required fail-closed |
| `ploinky tests/unit/listenerInventoryTopology.test.mjs` | Create | Assigned/unassigned/missing-evidence/wildcard/foreign-bind matrix |
| `ploinky container/smoke-runtime.mjs` | Modify | Pass outer-address evidence in the routing gate; `SMOKE_HOLD_BOX` |
| `ploinky container/profiles/routing-graph-listeners.json`, `full-explorer-listeners.json` | Modify (rationale text only) | Align `router-private` rationale with DS004/DS005 topology language |
| `ploinky tests/unit/smokeFullGraphPrerequisites.test.mjs` | Modify (additive tests) | Pin hold-flag fail-closed shape |
| `cib .github/workflows/publish-ploinky-box-image.yml` | Modify | `media_public_ipv4` input, early normalizer validation, render step, gate env |
| `cib tests/publish-ploinky-box-workflow.test.mjs` | Create | Workflow-contract regression test (inputs, ordering, promotion gating) |
| `cib README.md` | Modify (additive) | Dispatch documentation for the new required input |

---

### Task 1: Spec + operator docs for the gate contract (docs land before code)

**Files:**
- Modify: `/Users/danielsava/work/file-parser/ploinky/.worktrees/ploinky-phase1-http-router-proxy-mvp/docs/specs/DS005-routing-and-web-surfaces.md`
- Modify: `/Users/danielsava/work/file-parser/ploinky/.worktrees/ploinky-phase1-http-router-proxy-mvp/container/README.md`
- Test: `/Users/danielsava/work/file-parser/ploinky/.worktrees/ploinky-phase1-http-router-proxy-mvp/tests/unit/smokeOperatorInputsDocumentation.test.mjs`

**Interfaces:**
- Consumes: nothing (first task).
- Produces: the documented contract that Tasks 2–5 and 7 implement verbatim — env names `SMOKE_EDGE_DESIRED_FILE`, `SMOKE_MEDIA_PUBLIC_IPV4`, `SMOKE_HOLD_BOX`; renderer path `container/render-smoke-edge-desired.mjs`; host-network owner literal `webmeetInfra/liveKitServerAgent`; the topology-evidence rule for the private bind set.

All commands below run from the ploinky worktree root unless stated otherwise:
`cd /Users/danielsava/work/file-parser/ploinky/.worktrees/ploinky-phase1-http-router-proxy-mvp`

- [ ] **Step 1: Write the failing doc-contract test**

Create `tests/unit/smokeOperatorInputsDocumentation.test.mjs`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const ds005 = fs.readFileSync(
    new URL('../../docs/specs/DS005-routing-and-web-surfaces.md', import.meta.url),
    'utf8',
);
const readme = fs.readFileSync(
    new URL('../../container/README.md', import.meta.url),
    'utf8',
);

test('DS005 documents the release-gate edge desired-state operator candidate', () => {
    assert.match(ds005, /### Release-gate edge desired-state operator candidate/);
    assert.match(ds005, /SMOKE_EDGE_DESIRED_FILE/);
    assert.match(ds005, /SMOKE_MEDIA_PUBLIC_IPV4/);
    assert.match(ds005, /render-smoke-edge-desired\.mjs/);
    assert.match(ds005, /webmeetInfra\/liveKitServerAgent/);
    assert.match(ds005, /never dials the advertised address/);
    assert.match(ds005, /no `cloudflare` section/);
});

test('DS005 documents topology-aware private-listener release-gate evidence', () => {
    assert.match(ds005, /### Release-gate private-listener topology evidence/);
    assert.match(ds005, /assigned in the box outer namespace/);
    assert.match(ds005, /Unassigned managed gateways stay inactive and fail-closed/);
    assert.match(ds005, /absent topology\nevidence fails the gate closed/);
});

test('container README documents the full-graph operator inputs and renderer', () => {
    for (const token of [
        'SMOKE_EDGE_DESIRED_FILE',
        'SMOKE_MEDIA_PUBLIC_IPV4',
        'render-smoke-edge-desired.mjs',
        '--media-public-ipv4',
    ]) {
        assert.ok(readme.includes(token), `container/README.md must document ${token}`);
    }
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test tests/unit/smokeOperatorInputsDocumentation.test.mjs`
Expected: FAIL — all three tests, regex mismatches (the doc sections do not exist yet).

- [ ] **Step 3: Add the two DS005 subsections**

In `docs/specs/DS005-routing-and-web-surfaces.md`, inside the `## Core Content` section, insert the following two subsections immediately **before** the next `##`-level heading that follows Core Content. Do not renumber or edit any existing "Question #N" entries.

```markdown
### Release-gate edge desired-state operator candidate

The full Explorer release gate (`container/smoke-runtime.mjs`) refuses to start
the graph without two operator-owned inputs: `SMOKE_EDGE_DESIRED_FILE`, an
absolute path to a local-only edge desired-state candidate, and
`SMOKE_MEDIA_PUBLIC_IPV4`, the exact globally routable unicast IPv4 that the
staged candidate advertises for media. Discovery, host-capability defaults, and
non-global or synthetic addresses are rejected through
`normalizePublicMediaIPv4`; the gate never dials the advertised address.

The only approved candidate shape for this gate is produced by
`container/render-smoke-edge-desired.mjs`: `schemaVersion` 1, empty `hosts`,
no `cloudflare` section, `media.publicIPv4` equal to the operator input,
`media.addressMode` of `nat-forward` by default (`direct` only when the
operator attests direct assignment), and
`security.hostNetworkAllowedInstances` naming exactly one host-network
capability owner — `webmeetInfra/liveKitServerAgent` for the Explorer graph.
Cloudflare host/DNS mutation belongs to the separately authorized external
gate and must never appear in this candidate.

### Release-gate private-listener topology evidence

Release listener gates must validate the private `8081` bind set against
topology evidence instead of assuming every managed gateway is bindable: the
expected exact set is box loopback plus each exact current managed bridge
gateway whose address is assigned in the box outer namespace, with the
assignment evidence collected in the same generation as the listener
inventory. Unassigned managed gateways stay inactive and fail-closed exactly
as this document and DS004 Question #8 record. A bind on any other address, a
wildcard bind, or a missing loopback bind remains a release-gate failure, and
absent topology
evidence fails the gate closed.
```

- [ ] **Step 4: Add the operator-inputs section to `container/README.md`**

Append at the end of `container/README.md`:

```markdown
## Full Explorer release-gate operator inputs

`container/smoke-runtime.mjs` runs the full Explorer graph gate only with
explicit operator inputs; nothing is discovered or defaulted:

| Input | Meaning |
| --- | --- |
| `SMOKE_FULL_GRAPH_ARGS_JSON` | Exact JSON argv for the fresh graph, e.g. `["start","AssistOSExplorer/explorer","18080"]` |
| `SMOKE_FULL_GRAPH_REPOSITORIES_JSON` | Repository name to absolute exact-git-checkout path map |
| `SMOKE_EDGE_DESIRED_FILE` | Absolute path to the local-only candidate rendered by `render-smoke-edge-desired.mjs` |
| `SMOKE_MEDIA_PUBLIC_IPV4` | Operator-owned globally routable unicast IPv4; must equal the candidate's `media.publicIPv4` |

Render the candidate with:

```bash
node container/render-smoke-edge-desired.mjs \
  --media-public-ipv4 <operator-ipv4> \
  --out /absolute/path/smoke-edge-desired.json
```

The gate stays fail-closed: a missing or non-global address, a candidate with
a `cloudflare` section or non-empty `hosts`, or more or fewer than one
`security.hostNetworkAllowedInstances` entry fails the release gate before
graph startup.
```

- [ ] **Step 5: Run the doc test and the existing documentation pin**

Run: `node --test tests/unit/smokeOperatorInputsDocumentation.test.mjs`
Expected: PASS (3 tests).

Run: `node --test tests/unit/runtimeDocumentation.test.mjs`
Expected: PASS. If it fails, the additions collided with an existing documentation pin — reconcile by adjusting the inserted text (never by deleting existing pinned language) inside this same task before committing.

- [ ] **Step 6: Commit**

```bash
git add docs/specs/DS005-routing-and-web-surfaces.md container/README.md tests/unit/smokeOperatorInputsDocumentation.test.mjs
git commit -m "Document full-gate operator inputs and topology-aware private listener gate"
```

---

### Task 2: Desired-state renderer (`render-smoke-edge-desired.mjs`)

**Files:**
- Modify: `/Users/danielsava/work/file-parser/ploinky/.worktrees/ploinky-phase1-http-router-proxy-mvp/cli/services/edgeGeneration.js` (one additive export, immediately after the `normalizeDesired` function body ends, before the next `function` declaration)
- Create: `/Users/danielsava/work/file-parser/ploinky/.worktrees/ploinky-phase1-http-router-proxy-mvp/container/render-smoke-edge-desired.mjs`
- Test: `/Users/danielsava/work/file-parser/ploinky/.worktrees/ploinky-phase1-http-router-proxy-mvp/tests/unit/renderSmokeEdgeDesired.test.mjs`

**Interfaces:**
- Consumes: `normalizePublicMediaIPv4(value)` (already exported, `edgeGeneration.js:120`); internal `normalizeDesired(desired)` (`edgeGeneration.js:802`).
- Produces: `export function normalizeEdgeDesiredState(desired)` from `cli/services/edgeGeneration.js`; `export function buildLocalEdgeDesiredCandidate({ mediaPublicIPv4, addressMode })` and `export const LOCAL_FULL_GRAPH_HOST_NETWORK_OWNER = 'webmeetInfra/liveKitServerAgent'` from `container/render-smoke-edge-desired.mjs`; the CLI contract `node container/render-smoke-edge-desired.mjs --media-public-ipv4 <ipv4> [--address-mode direct|nat-forward] --out <absolute path>` used by Task 6 (CI) and Task 7 (local runbook).

- [ ] **Step 1: Write the failing test**

Create `tests/unit/renderSmokeEdgeDesired.test.mjs`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import {
    LOCAL_FULL_GRAPH_HOST_NETWORK_OWNER,
    buildLocalEdgeDesiredCandidate,
} from '../../container/render-smoke-edge-desired.mjs';
import { normalizeEdgeDesiredState } from '../../cli/services/edgeGeneration.js';

test('local edge desired candidate is exactly the local-only release-gate shape', () => {
    const candidate = buildLocalEdgeDesiredCandidate({ mediaPublicIPv4: '8.8.8.8' });
    assert.deepEqual(candidate, {
        schemaVersion: 1,
        hosts: {},
        media: { publicIPv4: '8.8.8.8', addressMode: 'nat-forward' },
        security: {
            hostNetworkAllowedInstances: [LOCAL_FULL_GRAPH_HOST_NETWORK_OWNER],
            internalServiceConsumers: {},
        },
    });
    assert.equal(LOCAL_FULL_GRAPH_HOST_NETWORK_OWNER, 'webmeetInfra/liveKitServerAgent');
    // The canonical validator must accept the rendered candidate unchanged.
    normalizeEdgeDesiredState(candidate);
});

test('local edge desired candidate rejects non-global and malformed IPv4 inputs', () => {
    for (const value of ['10.0.0.1', '127.0.0.1', '0.0.0.0', '256.1.1.1', 'not-an-ip', '', undefined]) {
        assert.throws(
            () => buildLocalEdgeDesiredCandidate({ mediaPublicIPv4: value }),
            undefined,
            `must reject '${value}'`,
        );
    }
});

test('local edge desired candidate supports direct mode and rejects unknown modes', () => {
    const direct = buildLocalEdgeDesiredCandidate({ mediaPublicIPv4: '8.8.8.8', addressMode: 'direct' });
    assert.equal(direct.media.addressMode, 'direct');
    assert.throws(() => buildLocalEdgeDesiredCandidate({ mediaPublicIPv4: '8.8.8.8', addressMode: 'wildcard' }));
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test tests/unit/renderSmokeEdgeDesired.test.mjs`
Expected: FAIL — `Cannot find module .../container/render-smoke-edge-desired.mjs` (and `normalizeEdgeDesiredState` is not exported).

- [ ] **Step 3: Add the additive export in `edgeGeneration.js`**

Immediately after the closing brace of `function normalizeDesired(desired) { ... }` (the function starting at line 802), insert:

```js
export function normalizeEdgeDesiredState(desired) {
    return normalizeDesired(desired);
}
```

- [ ] **Step 4: Create `container/render-smoke-edge-desired.mjs`**

```js
#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
    normalizeEdgeDesiredState,
    normalizePublicMediaIPv4,
} from '../cli/services/edgeGeneration.js';

export const LOCAL_FULL_GRAPH_HOST_NETWORK_OWNER = 'webmeetInfra/liveKitServerAgent';
const ADDRESS_MODES = new Set(['direct', 'nat-forward']);

/**
 * Build the only approved local-only edge desired-state candidate for the
 * full Explorer release gate. The operator supplies the exact globally
 * routable media IPv4; nothing is discovered or defaulted, and the candidate
 * never carries Cloudflare state, hostnames, or secret values.
 */
export function buildLocalEdgeDesiredCandidate({ mediaPublicIPv4, addressMode = 'nat-forward' } = {}) {
    const publicIPv4 = normalizePublicMediaIPv4(String(mediaPublicIPv4 ?? '').trim());
    const mode = String(addressMode || '').trim();
    if (!ADDRESS_MODES.has(mode)) {
        throw new Error("edge desired candidate addressMode must be 'direct' or 'nat-forward'");
    }
    const candidate = {
        schemaVersion: 1,
        hosts: {},
        media: { publicIPv4, addressMode: mode },
        security: {
            hostNetworkAllowedInstances: [LOCAL_FULL_GRAPH_HOST_NETWORK_OWNER],
            internalServiceConsumers: {},
        },
    };
    // Refuse to emit anything the canonical desired-state validator rejects.
    normalizeEdgeDesiredState(candidate);
    return candidate;
}

function parseArgs(argv) {
    const values = { addressMode: 'nat-forward' };
    for (let index = 0; index < argv.length; index += 2) {
        const flag = argv[index];
        const value = argv[index + 1];
        if (value === undefined) throw new Error(`missing value for ${flag}`);
        if (flag === '--media-public-ipv4') values.mediaPublicIPv4 = value;
        else if (flag === '--address-mode') values.addressMode = value;
        else if (flag === '--out') values.out = value;
        else throw new Error(`unknown flag '${flag}'`);
    }
    if (!values.mediaPublicIPv4) {
        throw new Error('--media-public-ipv4 is required; no discovery or default is permitted');
    }
    if (!values.out || !path.isAbsolute(values.out)) {
        throw new Error('--out must be an absolute path');
    }
    return values;
}

const invokedDirectly = process.argv[1]
    && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invokedDirectly) {
    const { mediaPublicIPv4, addressMode, out } = parseArgs(process.argv.slice(2));
    const candidate = buildLocalEdgeDesiredCandidate({ mediaPublicIPv4, addressMode });
    fs.writeFileSync(out, `${JSON.stringify(candidate, null, 2)}\n`, { mode: 0o600 });
    process.stdout.write(
        `SMOKE_EDGE_DESIRED_CANDIDATE ${out} publicIPv4=${candidate.media.publicIPv4} addressMode=${candidate.media.addressMode}\n`,
    );
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `node --test tests/unit/renderSmokeEdgeDesired.test.mjs`
Expected: PASS (3 tests).

- [ ] **Step 6: Verify the CLI writes a `0600` file**

```bash
node container/render-smoke-edge-desired.mjs --media-public-ipv4 8.8.8.8 --out /tmp/plan-check-desired.json \
  && stat -f '%Lp' /tmp/plan-check-desired.json && cat /tmp/plan-check-desired.json && rm /tmp/plan-check-desired.json
```
Expected: `SMOKE_EDGE_DESIRED_CANDIDATE ... publicIPv4=8.8.8.8 addressMode=nat-forward`, mode `600`, and the exact JSON shape from Step 1. (On Linux use `stat -c '%a'`.)

- [ ] **Step 7: Commit**

```bash
git add cli/services/edgeGeneration.js container/render-smoke-edge-desired.mjs tests/unit/renderSmokeEdgeDesired.test.mjs
git commit -m "Add local-only edge desired-state renderer for the full-graph gate"
```

---

### Task 3: Outer-namespace address evidence collectors

**Files:**
- Modify: `/Users/danielsava/work/file-parser/ploinky/.worktrees/ploinky-phase1-http-router-proxy-mvp/container/listener-collector.mjs`
- Test: `/Users/danielsava/work/file-parser/ploinky/.worktrees/ploinky-phase1-http-router-proxy-mvp/tests/unit/listenerCollectorOuterAddresses.test.mjs`

**Interfaces:**
- Consumes: existing `requireCommand(result, label, remediation)` helper inside `listener-collector.mjs`.
- Produces: `export function collectOuterAddressInventory({ run, outerContainer })` → frozen sorted array of IPv4 strings; `export function assertOuterAddressInventoryCurrent({ run, outerContainer, expected })` → re-collects and throws on drift. Task 4 wires these into `collectBoxListenerInventory` and `smoke-runtime.mjs`. This task is purely additive — nothing calls the new functions yet, so the tree stays green.

Evidence is collected with the already-required `node` collector tool (no new binary in the box; the existing tool contract probes binaries with `--version`, which `ip` from iproute2 does not support, so `node -e` + `os.networkInterfaces()` is deliberately chosen — it also matches `bind()`/`EADDRNOTAVAIL` semantics exactly).

- [ ] **Step 1: Write the failing test**

Create `tests/unit/listenerCollectorOuterAddresses.test.mjs`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import {
    assertOuterAddressInventoryCurrent,
    collectOuterAddressInventory,
} from '../../container/listener-collector.mjs';

function stubRun(stdout, status = 0) {
    return (args) => {
        assert.deepEqual(args.slice(0, 4), ['exec', '--user', '0', 'box-under-test']);
        assert.equal(args[4], 'node');
        return { status, stdout, stderr: '' };
    };
}

test('collects sorted outer-namespace IPv4 addresses through box-root node', () => {
    const addresses = collectOuterAddressInventory({
        run: stubRun('["10.0.2.100","127.0.0.1"]'),
        outerContainer: 'box-under-test',
    });
    assert.deepEqual([...addresses], ['10.0.2.100', '127.0.0.1']);
    assert.ok(Object.isFrozen(addresses));
});

test('rejects malformed outer-address inventories', () => {
    for (const stdout of ['not-json', '{"a":1}', '[42]', '']) {
        assert.throws(
            () => collectOuterAddressInventory({
                run: stubRun(stdout),
                outerContainer: 'box-under-test',
            }),
            undefined,
            `must reject stdout '${stdout}'`,
        );
    }
});

test('rejects a failing collection command', () => {
    assert.throws(() => collectOuterAddressInventory({
        run: stubRun('[]', 1),
        outerContainer: 'box-under-test',
    }));
});

test('assertOuterAddressInventoryCurrent fails closed on drift', () => {
    assert.deepEqual([...assertOuterAddressInventoryCurrent({
        run: stubRun('["127.0.0.1"]'),
        outerContainer: 'box-under-test',
        expected: ['127.0.0.1'],
    })], ['127.0.0.1']);
    assert.throws(() => assertOuterAddressInventoryCurrent({
        run: stubRun('["127.0.0.1","10.89.0.1"]'),
        outerContainer: 'box-under-test',
        expected: ['127.0.0.1'],
    }), /changed while its listener generation was collected/);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test tests/unit/listenerCollectorOuterAddresses.test.mjs`
Expected: FAIL — the two functions are not exported.

- [ ] **Step 3: Implement the collectors in `container/listener-collector.mjs`**

Add after the existing `PID_NAMESPACE_SCRIPT` constant:

```js
const OUTER_ADDRESS_SCRIPT = String.raw`
const os = require('node:os');
const addresses = new Set();
for (const records of Object.values(os.networkInterfaces() || {})) {
    for (const record of records || []) {
        if (record && record.family === 'IPv4' && record.address) addresses.add(record.address);
    }
}
process.stdout.write(JSON.stringify([...addresses].sort()));
`;
```

Add after `assertBoxListenerCollectorContract`:

```js
export function collectOuterAddressInventory({ run, outerContainer } = {}) {
    const name = String(outerContainer || '').trim();
    if (!name) throw new Error('outerContainer is required for outer-address collection');
    if (typeof run !== 'function') {
        throw new Error('outer-address collection run(args) function is required');
    }
    const result = requireCommand(
        run(['exec', '--user', '0', name, 'node', '-e', OUTER_ADDRESS_SCRIPT]),
        'outer-namespace IPv4 address inventory',
        'The Ploinky box must let box root read its outer network namespace addresses for topology-aware listener validation',
    );
    let parsed;
    try {
        parsed = JSON.parse(String(result.stdout || ''));
    } catch (error) {
        throw new Error(`outer-namespace address inventory is invalid JSON: ${error.message}`);
    }
    if (!Array.isArray(parsed) || !parsed.every((value) => typeof value === 'string' && value.trim())) {
        throw new Error('outer-namespace address inventory must be an array of IPv4 strings');
    }
    return Object.freeze([...parsed].sort());
}

export function assertOuterAddressInventoryCurrent({ run, outerContainer, expected } = {}) {
    const current = collectOuterAddressInventory({ run, outerContainer });
    if (JSON.stringify([...current]) !== JSON.stringify([...expected].sort())) {
        throw new Error('outer-namespace address set changed while its listener generation was collected');
    }
    return current;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `node --test tests/unit/listenerCollectorOuterAddresses.test.mjs`
Expected: PASS (4 tests).

Run: `node --test container/listener-inventory-tests.mjs`
Expected: PASS (no existing behavior changed).

- [ ] **Step 5: Commit**

```bash
git add container/listener-collector.mjs tests/unit/listenerCollectorOuterAddresses.test.mjs
git commit -m "Collect outer-namespace address evidence for listener gates"
```

---

### Task 4: Topology-aware private-listener validation (validator + wiring + profiles, one atomic commit)

**Files:**
- Modify: `/Users/danielsava/work/file-parser/ploinky/.worktrees/ploinky-phase1-http-router-proxy-mvp/container/listener-inventory.mjs`
- Modify: `/Users/danielsava/work/file-parser/ploinky/.worktrees/ploinky-phase1-http-router-proxy-mvp/container/listener-collector.mjs` (wire into `collectBoxListenerInventory`)
- Modify: `/Users/danielsava/work/file-parser/ploinky/.worktrees/ploinky-phase1-http-router-proxy-mvp/container/smoke-runtime.mjs` (routing-gate wiring)
- Modify: `/Users/danielsava/work/file-parser/ploinky/.worktrees/ploinky-phase1-http-router-proxy-mvp/container/profiles/routing-graph-listeners.json`
- Modify: `/Users/danielsava/work/file-parser/ploinky/.worktrees/ploinky-phase1-http-router-proxy-mvp/container/profiles/full-explorer-listeners.json`
- Test: `/Users/danielsava/work/file-parser/ploinky/.worktrees/ploinky-phase1-http-router-proxy-mvp/tests/unit/listenerInventoryTopology.test.mjs`

**Interfaces:**
- Consumes: `collectOuterAddressInventory` / `assertOuterAddressInventoryCurrent` (Task 3); existing `validateListenerInventory({ listeners, containers, managedNetworks }, profile)` and `collectBoxListenerInventory(...)`.
- Produces: `validateListenerInventory({ listeners, containers, managedNetworks, outerAddresses }, profile)` — new optional `outerAddresses` array; when any rule uses `dynamicBindSet: "loopback-and-managed-gateways"`, absent evidence adds a validation error (fail-closed) and the expected exact bind set becomes `['127.0.0.1', ...gateways assigned in outerAddresses]`. `collectBoxListenerInventory` returns `{ listeners, containers, managedNetworks, outerAddresses }`. Semantics of the existing `dynamicBindSet` name change atomically in this commit — profiles, validator, collectors, and smoke are consumed from the same checkout by both the local gate and the CI workflow, so no schema bump is needed; a stale caller that omits evidence now fails closed instead of passing loosely.

- [ ] **Step 1: Write the failing topology-matrix test**

Create `tests/unit/listenerInventoryTopology.test.mjs`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { validateListenerInventory } from '../../container/listener-inventory.mjs';

const PROFILE = {
    schemaVersion: 1,
    id: 'topology-test',
    description: 'router-private topology-aware bind-set behavior',
    requireManagedContainers: true,
    rejectAdditionalContainers: true,
    requireProcessOwners: true,
    controlPorts: [8081],
    requiredContainers: [],
    forbiddenSockets: [],
    rules: [{
        id: 'router-private',
        namespacePattern: '^outer$',
        protocols: ['tcp'],
        ports: [8081],
        dynamicBindSet: 'loopback-and-managed-gateways',
        ownerPattern: '^node$',
        reviewedSensitive: true,
        minMatches: 1,
        rationale: 'private Router binds loopback always and each managed gateway only while assigned in the outer namespace',
    }],
};

function listener(bindAddress) {
    const bindClass = bindAddress === '127.0.0.1'
        ? 'loopback'
        : (bindAddress === '0.0.0.0' || bindAddress === '*') ? 'wildcard' : 'specific';
    return {
        namespace: 'outer',
        containerName: null,
        protocol: 'tcp',
        state: 'LISTEN',
        bindAddress,
        bindClass,
        port: 8081,
        ownerProcesses: ['node'],
        ownerPids: [42],
        processDetails: 'users:(("node",pid=42,fd=20))',
        raw: `tcp LISTEN 0 511 ${bindAddress}:8081 users:(("node",pid=42,fd=20))`,
    };
}

const NETWORK = { name: 'ploinky-nw-aaaaaaaaaaaa-bbbbbbbbbbbb', gateway: '10.89.0.1' };

function validate({ listeners, outerAddresses }) {
    const inventory = { listeners, containers: [], managedNetworks: [NETWORK] };
    if (outerAddresses !== undefined) inventory.outerAddresses = outerAddresses;
    return validateListenerInventory(inventory, PROFILE);
}

test('unassigned managed gateway: loopback-only bind set passes (observed rootless topology)', () => {
    const validation = validate({
        listeners: [listener('127.0.0.1')],
        outerAddresses: ['127.0.0.1', '10.0.2.100'],
    });
    assert.deepEqual([...validation.errors], []);
    assert.equal(validation.ok, true);
});

test('assigned managed gateway: the gateway bind is required (rootful-like topology)', () => {
    const validation = validate({
        listeners: [listener('127.0.0.1')],
        outerAddresses: ['127.0.0.1', '10.0.2.100', '10.89.0.1'],
    });
    assert.equal(validation.ok, false);
    assert.match(validation.errors.join('\n'), /expected exact bind set 10\.89\.0\.1,127\.0\.0\.1/);
});

test('assigned managed gateway bound alongside loopback passes', () => {
    const validation = validate({
        listeners: [listener('127.0.0.1'), listener('10.89.0.1')],
        outerAddresses: ['127.0.0.1', '10.89.0.1'],
    });
    assert.equal(validation.ok, true);
});

test('a bind on an unassigned gateway address fails closed', () => {
    const validation = validate({
        listeners: [listener('127.0.0.1'), listener('10.89.0.1')],
        outerAddresses: ['127.0.0.1', '10.0.2.100'],
    });
    assert.equal(validation.ok, false);
});

test('a missing loopback bind fails even when the assigned gateway is bound', () => {
    const validation = validate({
        listeners: [listener('10.89.0.1')],
        outerAddresses: ['127.0.0.1', '10.89.0.1'],
    });
    assert.equal(validation.ok, false);
});

test('missing outer-namespace evidence fails closed when the profile uses dynamicBindSet', () => {
    const validation = validate({ listeners: [listener('127.0.0.1')] });
    assert.equal(validation.ok, false);
    assert.match(validation.errors.join('\n'), /no outer-namespace address evidence/);
});

test('wildcard and physical-interface binds on the private port stay rejected', () => {
    for (const address of ['0.0.0.0', '10.0.2.100']) {
        const validation = validate({
            listeners: [listener('127.0.0.1'), listener(address)],
            outerAddresses: ['127.0.0.1', '10.0.2.100'],
        });
        assert.equal(validation.ok, false, `bind on ${address} must fail`);
    }
});
```

- [ ] **Step 2: Run the test to verify current failures**

Run: `node --test tests/unit/listenerInventoryTopology.test.mjs`
Expected: FAIL — at minimum "unassigned managed gateway ... passes" (current validator demands the gateway bind) and "missing outer-namespace evidence" (no such error exists yet). The strict-rejection cases may already pass; that is fine.

- [ ] **Step 3: Implement the validator change in `container/listener-inventory.mjs`**

3a. Add `import net from 'node:net';` as the first import (the file currently imports only `node:fs`).

3b. Change the `validateListenerInventory` signature (currently `({ listeners, containers, managedNetworks = [] }, inputProfile)`) to:

```js
export function validateListenerInventory({
    listeners,
    containers,
    managedNetworks = [],
    outerAddresses = null,
}, inputProfile) {
```

3c. After the existing `managedGateways` construction loop (the block ending with `managedGateways.add(gateway);`), insert:

```js
    const hasDynamicBindRules = profile.rules.some(
        (rule) => rule.dynamicBindSet === 'loopback-and-managed-gateways',
    );
    let normalizedOuterAddresses = null;
    if (outerAddresses !== null && outerAddresses !== undefined) {
        normalizedOuterAddresses = new Set();
        for (const value of outerAddresses) {
            const address = String(value || '').trim();
            if (net.isIP(address) !== 4) {
                errors.push(`outer-namespace address evidence contains non-IPv4 entry '${value}'`);
                continue;
            }
            normalizedOuterAddresses.add(address);
        }
    }
    if (hasDynamicBindRules && normalizedOuterAddresses === null) {
        errors.push(
            'listener profile uses dynamicBindSet but the inventory has no outer-namespace address evidence',
        );
    }
```

3d. Replace the exact-set block inside the per-rule loop (currently):

```js
        if (rule.dynamicBindSet === 'loopback-and-managed-gateways') {
            const expected = ['127.0.0.1', ...managedGateways].sort();
            const actual = matches.map(record => record.bindAddress).sort();
            if (!exactStringSet(actual, expected)) {
                errors.push(
                    `listener rule '${rule.id}' expected exact bind set ${expected.join(',')}, found ${actual.join(',') || '<none>'}`,
                );
            }
        }
```

with:

```js
        if (rule.dynamicBindSet === 'loopback-and-managed-gateways') {
            const assignedGateways = normalizedOuterAddresses === null
                ? []
                : [...managedGateways].filter((gateway) => normalizedOuterAddresses.has(gateway));
            const inactiveGateways = [...managedGateways]
                .filter((gateway) => !assignedGateways.includes(gateway));
            const expected = ['127.0.0.1', ...assignedGateways].sort();
            const actual = matches.map(record => record.bindAddress).sort();
            if (!exactStringSet(actual, expected)) {
                errors.push(
                    `listener rule '${rule.id}' expected exact bind set ${expected.join(',')} `
                    + `(loopback plus outer-assigned managed gateways; inactive unassigned gateways: `
                    + `${inactiveGateways.join(',') || '<none>'}), found ${actual.join(',') || '<none>'}`,
                );
            }
        }
```

Note the matching-side rule at `listenerMatchesRule` (bindAddress must be `127.0.0.1` or a managed gateway) is intentionally unchanged: a bind on an unassigned gateway still matches the rule and then fails the exact-set comparison with a precise message, while wildcard/physical binds keep failing as unreviewed/control listeners.

- [ ] **Step 4: Run the topology matrix to verify it passes**

Run: `node --test tests/unit/listenerInventoryTopology.test.mjs`
Expected: PASS (7 tests).

Run: `node --test container/listener-inventory-tests.mjs`
Expected: FAIL is acceptable ONLY if an existing test constructed a `dynamicBindSet` inventory without evidence; update any such fixture in that file to pass `outerAddresses` including its gateway (preserving its original pass/fail intent) and re-run until PASS. Do not delete assertions.

- [ ] **Step 5: Wire evidence into `collectBoxListenerInventory` (`container/listener-collector.mjs`)**

Inside `collectBoxListenerInventory`, immediately after the `managedNetworks` collection:

```js
    const outerAddresses = collectOuterAddressInventory({ run, outerContainer: name });
```

Immediately before the function's final `return`, alongside the existing end-of-collection currency assertions, add:

```js
    assertOuterAddressInventoryCurrent({ run, outerContainer: name, expected: outerAddresses });
```

and include `outerAddresses` in the returned inventory object next to `managedNetworks`.

- [ ] **Step 6: Wire evidence into the routing gate (`container/smoke-runtime.mjs`)**

6a. Extend the import from `./listener-collector.mjs` with `assertOuterAddressInventoryCurrent` and `collectOuterAddressInventory`.

6b. In `collectRoutingListenerInventory`, inside the retry loop where `managedNetworks` is collected, collect the evidence with the same `run` shape:

```js
            const outerAddresses = collectOuterAddressInventory({
                outerContainer: INSTANCE,
                run: args => invoke('podman', args),
            });
```

6c. After the existing `assertManagedNetworkInventoryCurrent(...)` call add:

```js
            assertOuterAddressInventoryCurrent({
                outerContainer: INSTANCE,
                run: args => invoke('podman', args),
                expected: outerAddresses,
            });
```

6d. Pass the evidence into validation:

```js
            lastValidation = validateListenerInventory({
                listeners: parseSsOutput(result.stdout, { namespace: 'outer' }),
                containers: [],
                managedNetworks,
                outerAddresses,
            }, profile);
```

(`validateFullGraphListeners` and `collectFullGraphListenerSnapshot` need no edits — they consume `collectBoxListenerInventory`, which now carries `outerAddresses`.)

- [ ] **Step 7: Update both profile rationale strings**

In `container/profiles/routing-graph-listeners.json`, replace the `router-private` rule's `rationale` value with:

```
RoutingServer private listener is bound exactly once on loopback and on each exact current managed bridge gateway only while that gateway address is assigned in the box outer namespace; unassigned gateways stay inactive and fail-closed per DS004 Question #8.
```

In `container/profiles/full-explorer-listeners.json`, replace the `router-private` rule's `rationale` value with:

```
RoutingServer private listener is bound exactly once on box loopback and on each exact current managed bridge gateway only while that gateway address is assigned in the box outer namespace; unassigned gateways stay inactive and fail-closed per DS004 Question #8, and it has no wildcard bind or outer publication.
```

- [ ] **Step 8: Run the focused suites**

Run: `node --test tests/unit/listenerInventoryTopology.test.mjs tests/unit/listenerCollectorOuterAddresses.test.mjs tests/unit/smokeFullGraphPrerequisites.test.mjs`
Expected: PASS.

Run: `node --test container/listener-inventory-tests.mjs`
Expected: PASS.

Run: `node --test tests/unit`
Expected: PASS — previous 316 tests plus the new files, zero failures.

- [ ] **Step 9: Commit**

```bash
git add container/listener-inventory.mjs container/listener-collector.mjs container/smoke-runtime.mjs container/profiles/routing-graph-listeners.json container/profiles/full-explorer-listeners.json tests/unit/listenerInventoryTopology.test.mjs
git commit -m "Validate private-listener bind set against outer-namespace topology"
```

---

### Task 5: `SMOKE_HOLD_BOX` — explicit post-gate hold for browser E2E

**Files:**
- Modify: `/Users/danielsava/work/file-parser/ploinky/.worktrees/ploinky-phase1-http-router-proxy-mvp/container/smoke-runtime.mjs`
- Modify: `/Users/danielsava/work/file-parser/ploinky/.worktrees/ploinky-phase1-http-router-proxy-mvp/container/README.md` (one table row)
- Test: `/Users/danielsava/work/file-parser/ploinky/.worktrees/ploinky-phase1-http-router-proxy-mvp/tests/unit/smokeFullGraphPrerequisites.test.mjs` (additive test block)
- Test: `/Users/danielsava/work/file-parser/ploinky/.worktrees/ploinky-phase1-http-router-proxy-mvp/tests/unit/smokeOperatorInputsDocumentation.test.mjs` (additive assertion)

**Interfaces:**
- Consumes: existing `INSTANCE`, `VOLUMES`, `TMP`, `PORT`, `UDP_CONFLICT`, `containerExists`, `invoke`, `volumeExists` in `smoke-runtime.mjs`.
- Produces: env contract `SMOKE_HOLD_BOX=1` — after **all** gates pass, the box, its volumes, and `TMP` are retained and exact cleanup commands are printed; on any failure, teardown is unchanged. Task 7's runbook depends on this flag and on the printed `SMOKE_HOLD_BOX router: http://127.0.0.1:<port>` line.

- [ ] **Step 1: Write the failing source-shape tests**

Append to `tests/unit/smokeFullGraphPrerequisites.test.mjs`:

```js
test('smoke teardown stays fail-closed unless SMOKE_HOLD_BOX=1 and every gate passed', () => {
    assert.match(source, /const HOLD_BOX = process\.env\.SMOKE_HOLD_BOX === '1';/);
    assert.match(source, /let holdBoxAfterPass = false;/);
    const passMarker = source.indexOf('runtime smoke passed (podman, ${INSTANCE})');
    const holdActivation = source.indexOf('holdBoxAfterPass = true;');
    assert.ok(passMarker > 0, 'smoke must keep its pass marker');
    assert.ok(holdActivation > passMarker, 'hold may activate only after the pass marker');
    assert.match(source, /if \(!holdBoxAfterPass\) \{/);
    assert.match(source, /SMOKE_HOLD_BOX cleanup:/);
    assert.match(source, /podman rm -f --volumes \$\{INSTANCE\}/);
});
```

Append to `tests/unit/smokeOperatorInputsDocumentation.test.mjs`:

```js
test('container README documents the SMOKE_HOLD_BOX operator flag', () => {
    assert.ok(readme.includes('SMOKE_HOLD_BOX'), 'container/README.md must document SMOKE_HOLD_BOX');
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --test tests/unit/smokeFullGraphPrerequisites.test.mjs tests/unit/smokeOperatorInputsDocumentation.test.mjs`
Expected: FAIL — the two new tests only.

- [ ] **Step 3: Implement the hold flag in `container/smoke-runtime.mjs`**

3a. Next to the other top-level constants (after the `PORT` declaration), add:

```js
const HOLD_BOX = process.env.SMOKE_HOLD_BOX === '1';
```

3b. Immediately before the top-level `try {`, add:

```js
let holdBoxAfterPass = false;
```

3c. Immediately **after** the existing pass marker line

```js
    process.stdout.write(`runtime smoke passed (podman, ${INSTANCE})\n`);
```

add:

```js
    if (HOLD_BOX) {
        holdBoxAfterPass = true;
        process.stdout.write(`SMOKE_HOLD_BOX active: retaining ${INSTANCE} for operator browser E2E\n`);
        process.stdout.write(`SMOKE_HOLD_BOX router: http://127.0.0.1:${PORT}\n`);
        process.stdout.write('SMOKE_HOLD_BOX cleanup:\n');
        process.stdout.write(`  podman rm -f --volumes ${INSTANCE}\n`);
        for (const name of Object.values(VOLUMES)) {
            process.stdout.write(`  podman volume rm ${name}\n`);
        }
        process.stdout.write(`  rm -rf ${TMP}\n`);
    }
```

3d. Replace the `finally` block body (currently unconditional teardown) with:

```js
} finally {
    if (containerExists(UDP_CONFLICT)) invoke('podman', ['rm', '-f', UDP_CONFLICT]);
    if (!holdBoxAfterPass) {
        if (containerExists()) invoke('podman', ['rm', '-f', '--volumes', INSTANCE]);
        for (const name of Object.values(VOLUMES)) {
            if (volumeExists(name)) invoke('podman', ['volume', 'rm', name]);
        }
        fs.rmSync(TMP, { recursive: true, force: true });
    }
}
```

3e. In `container/README.md`, add this row to the operator-inputs table from Task 1:

```markdown
| `SMOKE_HOLD_BOX` | Optional; `1` retains the passed box for operator browser E2E and prints exact cleanup commands. Any failure still tears down. |
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `node --test tests/unit/smokeFullGraphPrerequisites.test.mjs tests/unit/smokeOperatorInputsDocumentation.test.mjs`
Expected: PASS.

Run: `node --test tests/unit`
Expected: PASS, zero failures.

- [ ] **Step 5: Commit**

```bash
git add container/smoke-runtime.mjs container/README.md tests/unit/smokeFullGraphPrerequisites.test.mjs tests/unit/smokeOperatorInputsDocumentation.test.mjs
git commit -m "Add explicit operator hold for post-gate browser E2E"
```

---

### Task 6: Workflow operator input + promotion-shape regression test (`container-image-builds`)

**Files:**
- Create branch: `full-gate-operator-inputs` from `main` (`9fd2641`) in `/Users/danielsava/work/file-parser/container-image-builds`
- Modify: `/Users/danielsava/work/file-parser/container-image-builds/.github/workflows/publish-ploinky-box-image.yml`
- Modify: `/Users/danielsava/work/file-parser/container-image-builds/README.md` (additive note)
- Test: `/Users/danielsava/work/file-parser/container-image-builds/tests/publish-ploinky-box-workflow.test.mjs`

**Interfaces:**
- Consumes: `container/render-smoke-edge-desired.mjs` CLI and `normalizePublicMediaIPv4` from the ploinky source checked out at `sources/ploinky` (Task 2; the dispatched `source_ref` must contain them).
- Produces: required `workflow_dispatch` input `media_public_ipv4`; gate-step env `SMOKE_EDGE_DESIRED_FILE` + `SMOKE_MEDIA_PUBLIC_IPV4`; a regression test pinning that `docker.io/assistos/ploinky-box:runtime` promotion stays behind the full gate.

All commands run from `/Users/danielsava/work/file-parser/container-image-builds`.

- [ ] **Step 1: Create the branch**

```bash
git switch -c full-gate-operator-inputs 9fd2641
```

- [ ] **Step 2: Write the failing workflow-contract test**

Create `tests/publish-ploinky-box-workflow.test.mjs`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const workflow = fs.readFileSync(
    path.join(repoRoot, '.github/workflows/publish-ploinky-box-image.yml'),
    'utf8',
);

test('publish workflow requires the operator media IPv4 input', () => {
    assert.match(
        workflow,
        /media_public_ipv4:\n\s+description: Operator-owned globally routable unicast IPv4[^\n]*\n\s+required: true\n\s+type: string/,
    );
});

test('the operator media IPv4 is validated by the Ploinky normalizer before any build', () => {
    const validation = workflow.indexOf('normalizePublicMediaIPv4(process.env.MEDIA_PUBLIC_IPV4)');
    const build = workflow.indexOf('Build and push candidate by digest');
    assert.ok(validation > 0, 'workflow must validate through normalizePublicMediaIPv4');
    assert.ok(build > 0, 'workflow must keep the candidate build step');
    assert.ok(validation < build, 'validation must precede the candidate build');
});

test('the full-graph gate receives rendered operator inputs', () => {
    assert.match(workflow, /render-smoke-edge-desired\.mjs/);
    assert.match(workflow, /SMOKE_EDGE_DESIRED_FILE: \$\{\{ runner\.temp \}\}\/smoke-edge-desired\.json/);
    assert.match(workflow, /SMOKE_MEDIA_PUBLIC_IPV4: \$\{\{ inputs\.media_public_ipv4 \}\}/);
    const render = workflow.indexOf('Render operator edge desired-state candidate');
    const gate = workflow.indexOf('Gate exact fixed outer publications and lifecycle');
    assert.ok(render > 0 && gate > 0 && render < gate, 'render must precede the runtime gate');
});

test('runtime promotion stays behind the full gate', () => {
    const gate = workflow.indexOf('Gate exact fixed outer publications and lifecycle');
    const digestExport = workflow.indexOf('Export gated candidate digest');
    assert.ok(gate > 0 && digestExport > 0 && gate < digestExport, 'digest export must follow the gate');
    assert.match(workflow, /needs:\n\s+- resolve-source\n\s+- build/);
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `node --test tests/publish-ploinky-box-workflow.test.mjs`
Expected: FAIL — first three tests (input, validation, render/env missing); the fourth ("promotion stays behind the full gate") already passes against the current yml.

- [ ] **Step 4: Edit `.github/workflows/publish-ploinky-box-image.yml`**

4a. In `on.workflow_dispatch.inputs`, after the `basic_ref` entry, add (8 inputs total — under GitHub's 10-input limit):

```yaml
      media_public_ipv4:
        description: Operator-owned globally routable unicast IPv4 advertised by the full-graph gate for media; never discovered or defaulted
        required: true
        type: string
```

4b. In the `resolve-source` job, after the "Verify immutable Ploinky commit" step, add:

```yaml
      - name: Validate operator media IPv4 with the Ploinky normalizer
        env:
          MEDIA_PUBLIC_IPV4: ${{ inputs.media_public_ipv4 }}
        run: |
          set -euo pipefail
          node --input-type=module <<'NODE'
          import path from 'node:path';
          import { pathToFileURL } from 'node:url';

          const moduleHref = pathToFileURL(
            path.resolve('sources/ploinky/cli/services/edgeGeneration.js'),
          ).href;
          const { normalizePublicMediaIPv4 } = await import(moduleHref);
          normalizePublicMediaIPv4(process.env.MEDIA_PUBLIC_IPV4);
          NODE
```

(`sources/ploinky` is already checked out in this job; `smoke-runtime.mjs` already imports `edgeGeneration.js` host-side in CI, so the import resolves without an npm install — observed in run `29658478054`, which reached the gate's own error message from that module.)

4c. In the `build` job, immediately before the "Gate exact fixed outer publications and lifecycle" step, add:

```yaml
      - name: Render operator edge desired-state candidate
        env:
          MEDIA_PUBLIC_IPV4: ${{ inputs.media_public_ipv4 }}
        run: |
          set -euo pipefail
          node sources/ploinky/container/render-smoke-edge-desired.mjs \
            --media-public-ipv4 "$MEDIA_PUBLIC_IPV4" \
            --out "$RUNNER_TEMP/smoke-edge-desired.json"
```

4d. In the "Gate exact fixed outer publications and lifecycle" step's `env:` block, after `SMOKE_FULL_GRAPH_REPOSITORIES_JSON`, add:

```yaml
          SMOKE_EDGE_DESIRED_FILE: ${{ runner.temp }}/smoke-edge-desired.json
          SMOKE_MEDIA_PUBLIC_IPV4: ${{ inputs.media_public_ipv4 }}
```

4e. In `README.md`, add under the existing content:

```markdown
## publish-ploinky-box-image operator input

Dispatching `publish-ploinky-box-image.yml` requires `media_public_ipv4`: an
operator-owned globally routable unicast IPv4 that the full Explorer gate
advertises for media. It is validated with Ploinky's
`normalizePublicMediaIPv4` before any build, rendered into a local-only edge
desired-state candidate via `render-smoke-edge-desired.mjs`, and never
discovered, defaulted, or dialed by the gate. The mutable
`docker.io/assistos/ploinky-box:runtime` tag moves only when both
architecture jobs pass the full gate.
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `node --test tests/publish-ploinky-box-workflow.test.mjs`
Expected: PASS (4 tests).

Run: `node --test tests`
Expected: PASS — all existing container-image-builds tests plus the new file.

- [ ] **Step 6: Commit**

```bash
git add .github/workflows/publish-ploinky-box-image.yml tests/publish-ploinky-box-workflow.test.mjs README.md
git commit -m "Require operator media IPv4 and edge candidate in the box release gate"
```

---

### Task 7: Local full-gate run + Explorer browser E2E (operator verification, no code)

**Files:** none created. This is the execution runbook proving acceptance criteria 1 and 2. It uses the digest that already passed the focused gates: `docker.io/assistos/ploinky-box@sha256:27c8c2775dadc49324b823818e456f2d8c4f7dc9346b4015bbb2f684cc9b71b7`.

**Interfaces:**
- Consumes: renderer CLI (Task 2), topology-aware gate (Task 4), `SMOKE_HOLD_BOX` (Task 5); Explorer harness `SMOKE_BASE_URL` contract.
- Produces: recorded evidence for acceptance criteria 1 and 2.

- [ ] **Step 1: Provision the two missing graph checkouts (one-time)**

```bash
git clone https://github.com/AssistOS-AI/webmeetInfra /Users/danielsava/work/file-parser/webmeetInfra
git clone https://github.com/AssistOS-AI/AchillesCLI /Users/danielsava/work/file-parser/AchillesCLI
for repo in webmeetInfra AchillesCLI AssistOSExplorer UmamiAgent basic proxies container-image-builds; do
  echo "$repo $(git -C /Users/danielsava/work/file-parser/$repo rev-parse HEAD)"
done
```
Expected: two clones succeed; seven `repo <40-hex>` lines print. Record them — they are also the dispatch SHAs for Task 8.

- [ ] **Step 2: Render the operator candidate**

`<operator-ipv4>` below is the operator's real, owned, globally routable unicast IPv4 (for example the production media host address). It is supplied by the operator at run time — never copied from this plan, never discovered.

```bash
mkdir -p "$HOME/.ploinky-box-smoke"
cd /Users/danielsava/work/file-parser/ploinky/.worktrees/ploinky-phase1-http-router-proxy-mvp
node container/render-smoke-edge-desired.mjs \
  --media-public-ipv4 <operator-ipv4> \
  --out "$HOME/.ploinky-box-smoke/smoke-edge-desired.json"
```
Expected: `SMOKE_EDGE_DESIRED_CANDIDATE ... publicIPv4=<operator-ipv4> addressMode=nat-forward`.

- [ ] **Step 3: Run the full runtime gate with hold**

Run on the same rootless-Podman host that ran the passing Phase 1 HTTP router smoke, from the ploinky worktree root:

```bash
SMOKE_IMAGE=docker.io/assistos/ploinky-box@sha256:27c8c2775dadc49324b823818e456f2d8c4f7dc9346b4015bbb2f684cc9b71b7 \
SMOKE_PORT=18080 \
SMOKE_FULL_GRAPH_ARGS_JSON='["start","AssistOSExplorer/explorer","18080"]' \
SMOKE_FULL_GRAPH_REPOSITORIES_JSON='{"AchillesCLI":"/Users/danielsava/work/file-parser/AchillesCLI","AssistOSExplorer":"/Users/danielsava/work/file-parser/AssistOSExplorer","UmamiAgent":"/Users/danielsava/work/file-parser/UmamiAgent","basic":"/Users/danielsava/work/file-parser/basic","container-image-builds":"/Users/danielsava/work/file-parser/container-image-builds","proxies":"/Users/danielsava/work/file-parser/proxies","webmeetInfra":"/Users/danielsava/work/file-parser/webmeetInfra"}' \
SMOKE_EDGE_DESIRED_FILE="$HOME/.ploinky-box-smoke/smoke-edge-desired.json" \
SMOKE_MEDIA_PUBLIC_IPV4=<operator-ipv4> \
SMOKE_HOLD_BOX=1 \
node container/smoke-runtime.mjs
```

Expected output markers, in order: `FULL_GRAPH_REPOSITORY <name> <sha>` for all seven repos, `FULL_GRAPH_EDGE_CANDIDATE staged publicIPv4=<operator-ipv4>`, `IN_BOX_LISTENER_PROFILE full-explorer-v5 PASS ...`, `runtime smoke passed (podman, ploinky-box-...)`, `SMOKE_HOLD_BOX router: http://127.0.0.1:18080`, and the printed cleanup commands. Exit code 0. This is acceptance criterion 1.

**If graph startup fails on a missing desired-state field** (for example a TURN requirement surfacing from the webmeet path): STOP, capture the exact error, and resolve it as a DS005 contract decision in a follow-up commit to Task 1's subsection — do not invent external TURN URLs or hostnames in the local-only candidate. **If it fails naming a different expected host-network owner**, update `LOCAL_FULL_GRAPH_HOST_NETWORK_OWNER`, the DS005 text, and the Task 2 test to the runtime-reported `<repo>/<agent>` value in one commit, then rerun from Step 2.

- [ ] **Step 4: Run the Explorer browser E2E against the held box**

```bash
cd /Users/danielsava/work/file-parser/AssistOSExplorer/tests/smoke
SMOKE_BASE_URL=http://127.0.0.1:18080 npm test -- --project=chromium specs/00-router-auth.spec.mjs
```
Expected: the runner's v5 retired-source gate passes, then Playwright reports `2 passed` (dashboard/Explorer shell; routed WebChat shell). This is acceptance criterion 2, verbatim.

- [ ] **Step 5: Tear down the held box**

Run exactly the `SMOKE_HOLD_BOX cleanup:` commands printed in Step 3 (`podman rm -f --volumes <instance>`, the three `podman volume rm` lines, `rm -rf <tmpdir>`), then verify:

```bash
podman ps -a --format '{{.Names}}' | grep '^ploinky-box-' || echo CLEAN
```
Expected: `CLEAN`.

- [ ] **Step 6: Record evidence**

Save the gate transcript and the Playwright summary (paths, SHAs, pass counts) alongside the release notes for the eventual branch merge. No commit in this task.

---

### Task 8: CI dispatch and promotion proof (operator-authorized)

**Files:** none. This task publishes candidate digests and, on success, moves `docker.io/assistos/ploinky-box:runtime`. **Obtain explicit operator confirmation before each push/dispatch in this task.**

**Interfaces:**
- Consumes: pushed ploinky branch tip containing Tasks 1–5; pushed `full-gate-operator-inputs` branch containing Task 6; the seven graph SHAs recorded in Task 7 Step 1.
- Produces: acceptance criterion 3 evidence — a green run whose merge job promotes `:runtime`, plus the standing regression evidence that failed gates skip promotion (run `29658478054` + the Task 6 contract test).

- [ ] **Step 1: Record the rollback digest of the current `:runtime` tag**

```bash
docker buildx imagetools inspect docker.io/assistos/ploinky-box:runtime | awk '$1 == "Digest:" { print $2; exit }'
```
Expected: one `sha256:<64-hex>` line. Save it as `ROLLBACK_RUNTIME_DIGEST` in the run notes, together with the ploinky SHA it was built from (from that run's summary).

- [ ] **Step 2: Push both branches (operator confirmation required)**

```bash
cd /Users/danielsava/work/file-parser/ploinky/.worktrees/ploinky-phase1-http-router-proxy-mvp
git push origin ploinky-phase1-http-router-proxy-mvp
git rev-parse HEAD   # record as SOURCE_REF (40 hex)
cd /Users/danielsava/work/file-parser/container-image-builds
git push -u origin full-gate-operator-inputs
```
Expected: both pushes accepted; `SOURCE_REF` recorded.

- [ ] **Step 3: Dispatch the publish workflow from the feature branch (operator confirmation required)**

Use the seven SHAs recorded in Task 7 Step 1 (each must be the full 40-hex commit) and the same `<operator-ipv4>`:

```bash
gh workflow run publish-ploinky-box-image.yml \
  --repo AssistOS-AI/container-image-builds \
  --ref full-gate-operator-inputs \
  -f source_ref=<SOURCE_REF> \
  -f explorer_ref=<AssistOSExplorer sha> \
  -f webmeet_infra_ref=<webmeetInfra sha> \
  -f umami_ref=<UmamiAgent sha> \
  -f achilles_cli_ref=<AchillesCLI sha> \
  -f proxies_ref=<proxies sha> \
  -f basic_ref=<basic sha> \
  -f media_public_ipv4=<operator-ipv4>
gh run watch --repo AssistOS-AI/container-image-builds --exit-status
```
Expected: `resolve-source` (including the new normalizer validation), both `Build and gate` jobs (including "Render operator edge desired-state candidate" and a passing "Gate exact fixed outer publications and lifecycle"), and `Publish mutable multiarchitecture runtime` all succeed; the summary prints `Published docker.io/assistos/ploinky-box:runtime at sha256:...`. Record the new digest.

- [ ] **Step 4: Confirm the promotion-only-on-green property**

Evidence, no new action: run `29658478054` (failed gate → merge job `skipped`, tag not moved) plus the Task 6 contract test pinning gate-before-digest-export and `merge needs build`. Cite both in the run notes. This is acceptance criterion 3.

- [ ] **Step 5: Merge `full-gate-operator-inputs` into `main` (operator confirmation required)**

```bash
cd /Users/danielsava/work/file-parser/container-image-builds
git switch main && git pull --ff-only
git merge --no-ff full-gate-operator-inputs -m "Require operator media IPv4 and edge candidate in the box release gate"
git push origin main
```
Expected: fast-forward pull, clean merge, push accepted. (The ploinky MVP branch merge remains a separate, operator-decided step outside this plan.)

---

## Final Verification (maps 1:1 to the required targets)

| # | Required target | Proven by |
| --- | --- | --- |
| 1 | Full runtime gate starts with explicit operator inputs | Task 7 Step 3: `runtime smoke passed` + `IN_BOX_LISTENER_PROFILE full-explorer-v5 PASS` with `SMOKE_EDGE_DESIRED_FILE`/`SMOKE_MEDIA_PUBLIC_IPV4` set and no discovery |
| 2 | `SMOKE_BASE_URL=http://127.0.0.1:18080 npm test -- --project=chromium specs/00-router-auth.spec.mjs` passes | Task 7 Step 4: `2 passed` against the held box |
| 3 | `:runtime` promotes only when the full gate passes | Task 8 Steps 3–4: green run promotes; failed run `29658478054` skipped promotion; Task 6 contract test pins the ordering permanently |

Also rerun before declaring done: `node --test tests/unit` (ploinky worktree, expect 316 + new tests, zero failures) and `node --test tests` (`container-image-builds`, zero failures).

## Rollback Strategy

| Layer | Rollback |
| --- | --- |
| ploinky branch commits (Tasks 1–5) | `git revert <sha>` per commit on `ploinky-phase1-http-router-proxy-mvp`; each task is one self-contained commit; no data or state migrations exist |
| `container-image-builds` (Task 6) | Revert the single commit or delete the branch before merge; after merge, `git revert` the merge commit on `main` — the workflow then simply fails at the gate again (fail-closed), it never promotes loosely |
| `docker.io/assistos/ploinky-box:runtime` | Re-dispatch `publish-ploinky-box-image.yml` at the last known-good `source_ref`/graph SHAs (recorded with `ROLLBACK_RUNTIME_DIGEST` in Task 8 Step 1) so the tag is re-promoted through the same gated workflow. Candidate digests are immutable registry content and stay pull-able for pinned consumers. Workstation retagging is out of policy for this workspace (deploys go through GitHub Actions); a manual `imagetools` re-pin would be an explicitly operator-authorized emergency action outside this plan |
| Validator semantics | Reverting Task 4 restores the previous exact-set behavior; profiles and validator travel in the same commit, so no mixed-semantics state can exist at any checkout |
| Hold flag | Default-off; reverting Task 5 restores unconditional teardown; no persisted state depends on it |

## Release-Safety Constraints (standing, all preserved by this plan)

1. The outer boundary stays exactly two publications; `FORBIDDEN_TARGETS` (including `8081/tcp` and every service port) stays enforced at every phase (`assertExactOuterBoundary` unchanged).
2. Wildcard binds, physical-interface binds, unexpected containers, and unreviewed/control listeners keep failing the listener gates (Task 4 tests prove each).
3. "No public-IP discovery or host-capability default is permitted" stays literal: every media IPv4 is operator-supplied and normalizer-validated at dispatch, at render, and at the gate.
4. The candidate is local-only forever in this gate: no `cloudflare` key, empty `hosts`, no secret values, `0600` files; Cloudflare/DNS work stays with the separately authorized external gate.
5. DS004 Question #8 remains open; `cli/server/` listener behavior is untouched; no forwarder, no widened bind, no outer-facing listener.
6. Promotion of `:runtime` requires both architecture gates green (structural `needs` + digest-export-after-gate, pinned by test).
7. All pushes and the workflow dispatch are operator-confirmed actions; commits carry no AI attribution.

## Design alternatives (vs the concurrently authored plan at `2026-07-19-ploinky-explorer-e2e-remediation.md`)

| Dimension | This plan | Concurrent plan |
| --- | --- | --- |
| CI supply of the candidate | Rendered in-workflow from the single dispatch input by a reviewed in-repo script | Protected GitHub Environment secret holding the full JSON + independent dispatch IP that must match (dual control; more setup) |
| Browser E2E placement | Operator-run against a held box after the gate (`SMOKE_HOLD_BOX`); CI stays browser-free | Embedded inside `smoke-runtime.mjs` with a second same-SHA Explorer checkout; browser pass gates promotion per-arch |
| Topology evidence | Outer-namespace IPv4 address set via the already-required `node` tool (`os.networkInterfaces`), matching `EADDRNOTAVAIL` semantics | `ip -j -4 address show` with per-interface correlation to Podman `network_interface` (stronger interface binding; requires adding `ip` to a tool contract that probes `--version`, which `ip` does not support) |
| Blast radius | Smaller: no runtime-lane, no CI browser deps, no GitHub environment prerequisites | Larger but strictly stronger release gate once landed |

Either resolves both verified blockers; do not interleave tasks across the two plans.

## Out of Scope

DS004 Question #8 (rootless managed-bridge private lane architecture); the external/Cloudflare edge gate and real media reachability smoke (media-smoke gate pending); merging `ploinky-phase1-http-router-proxy-mvp` to master; the pre-existing runtime-design property that a managed network whose IPAM gateway collided with an outer-assigned address would be bound by the router (documented DS004 boundary; unchanged here); Explorer suite specs beyond `00-router-auth.spec.mjs`.
