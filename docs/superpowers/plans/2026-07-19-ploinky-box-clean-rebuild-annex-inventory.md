# Ploinky Box Clean Rebuild — S0 Exact Inventory and Deferred Evidence Ledger

**Status: architecture-spike-ready only.**

This annex is exact only for S0.
It is not a complete rebuild inventory and does not authorize downstream implementation.
All paths below are planned future files inside the clean Ploinky worktree; none is created now.

## 1. Exact S0 path inventory

| Exact path | Owner | Planned action | Exact test command | Expected result | Evidence |
| --- | --- | --- | --- | --- | --- |
| `ploinky/container/spike/ds004-q8/run-spike.sh` | Runner owner | Add preflight, exact topology/matrix, owner discovery, phase evidence, cleanup, and sole `emit-pass` acknowledgement | `node --test tests/unit/ds004Q8SpikeContract.test.mjs` | Contract GREEN; exact PASS only after synced authorization | Phase/state/probe/scan/cleanup hashes |
| `ploinky/container/spike/ds004-q8/probe.py` | Probe/listener owner | Add exact alias/literal TCP probe and reference/decoy modes | `python3 container/spike/ds004-q8/probe.py --self-test` | Taxonomy/listener self-tests pass | Probe, payload, and raw-output hashes |
| `ploinky/container/spike/ds004-q8/stage-source.sh` | Coordinator owner | Add GREEN, pack, install, verify, scanner phases, immutable schemas, journals, and PASS transport | `bash --noprofile --norc container/spike/ds004-q8/stage-source.sh green candidate-n` | One validated GREEN receipt SHA | Receipt/package/attempt/journal hashes |
| `ploinky/container/spike/ds004-q8/README.md` | Operator docs owner | Add exact inputs, trust/executor, gates, schemas, matrix, failure, recovery, and decision rules | `node --test tests/unit/ds004Q8SpikeContract.test.mjs` | Documentation assertions pass | README and contract output hashes |
| `ploinky/tests/unit/ds004Q8SpikeContract.test.mjs` | Contract owner | Assert complete N-only source, GREEN/verify/PASS, trust, independence, matrix, schemas, cleanup, and acceptance contract | `node --test tests/unit/ds004Q8SpikeContract.test.mjs` | Initial RED then explicit GREEN before every pack | RED/GREEN hashes |

These five paths are the complete normative S0 inventory.
Both shell scripts start exactly with the Bash shebang and `set -euo pipefail`.
Only the `run-spike.sh emit-pass` source location originates exact PASS bytes; `stage-source.sh run` transports them unchanged only after acknowledgement validation.
The contract rejects every alternate-candidate helper, gate, command, transport, evidence lane, or status.
S0 edits no DS004, matrix, `specsLoader`, or HTML.
Only fresh review and explicit human acceptance permits downstream GAMP/full-plan regeneration; rejection/failure permits only a bounded reviewed spike or closure.

## 2. Exact bootstrap command

The future non-pruning/non-maintenance bootstrap requires separate human execution authorization, removes nothing, and stops on drift or unsafe reuse.

```bash
bash --noprofile --norc -euo pipefail -c '
root=/Users/danielsava/work/file-parser
repo=$root/ploinky
worktree=$root/.worktrees/clean/ploinky-ds004-q8
sha=ac39b870d990869616e4882222c78037dc11d07d
for remote in $(git -C "$repo" remote); do
  git -C "$repo" -c maintenance.auto=false -c gc.auto=0 fetch --no-prune "$remote"
done
test "$(git -C "$repo" rev-parse origin/master)" = "$sha" || exit 31
if test -e "$worktree"; then
  :
else
  git -C "$repo" worktree add --detach "$worktree" "$sha"
fi
git -C "$repo" worktree list --porcelain | grep -Fqx "worktree $worktree" || exit 32
test "$(git -C "$worktree" rev-parse --show-toplevel)" = "$worktree" || exit 33
test "$(git -C "$worktree" rev-parse HEAD)" = "$sha" || exit 34
if git -C "$worktree" symbolic-ref -q HEAD >/dev/null; then exit 35; fi
test -z "$(git -C "$worktree" status --porcelain=v1 --untracked-files=all)" || exit 36
'
```

## 3. Exact normative S0 commands and output schemas

The catalog assumes bootstrap and all nine inputs.
TDD order is direct RED, implement, local GREEN, pack, install, verify, run.

```bash
cd /Users/danielsava/work/file-parser/.worktrees/clean/ploinky-ds004-q8
node --test tests/unit/ds004Q8SpikeContract.test.mjs
```

Expected initial RED is nonzero because owned tooling and its contract are absent.

Initial amd64:

```bash
cd /Users/danielsava/work/file-parser/.worktrees/clean/ploinky-ds004-q8
test -n "$DS004_EXTERNAL_SCANNER_SSH"
test -n "$DS004_AMD64_RUNNER_SSH"
test -n "$DS004_ARM64_RUNNER_SSH"
test -n "$DS004_AMD64_BOX_LAN_IPV4"
test -n "$DS004_ARM64_BOX_LAN_IPV4"
test -n "$DS004_SSH_KNOWN_HOSTS_FILE"
test -n "$DS004_EXTERNAL_SCANNER_IDENTITY_FILE"
test -n "$DS004_AMD64_RUNNER_IDENTITY_FILE"
test -n "$DS004_ARM64_RUNNER_IDENTITY_FILE"
green_receipt_sha=$(bash --noprofile --norc container/spike/ds004-q8/stage-source.sh green candidate-n)
case "$green_receipt_sha" in *[!0-9a-f]*|"") exit 41;; esac
test "${#green_receipt_sha}" -eq 64
manifest_sha=$(bash --noprofile --norc container/spike/ds004-q8/stage-source.sh pack candidate-n amd64 "$green_receipt_sha")
case "$manifest_sha" in *[!0-9a-f]*|"") exit 42;; esac
test "${#manifest_sha}" -eq 64
attempt_id=$(bash --noprofile --norc container/spike/ds004-q8/stage-source.sh install candidate-n amd64 "$manifest_sha")
case "$attempt_id" in *[!0-9a-f]*|"") exit 43;; esac
test "${#attempt_id}" -eq 32
bash --noprofile --norc container/spike/ds004-q8/stage-source.sh verify candidate-n amd64 "$manifest_sha" "$attempt_id"
bash --noprofile --norc container/spike/ds004-q8/stage-source.sh run candidate-n amd64 "$manifest_sha" "$attempt_id"
```

Post-refactor amd64 and identical-source arm64:

```bash
cd /Users/danielsava/work/file-parser/.worktrees/clean/ploinky-ds004-q8
refactor_green_receipt_sha=$(bash --noprofile --norc container/spike/ds004-q8/stage-source.sh green candidate-n)
case "$refactor_green_receipt_sha" in *[!0-9a-f]*|"") exit 44;; esac
test "${#refactor_green_receipt_sha}" -eq 64
refactor_manifest_sha=$(bash --noprofile --norc container/spike/ds004-q8/stage-source.sh pack candidate-n amd64 "$refactor_green_receipt_sha")
case "$refactor_manifest_sha" in *[!0-9a-f]*|"") exit 45;; esac
test "${#refactor_manifest_sha}" -eq 64
refactor_attempt_id=$(bash --noprofile --norc container/spike/ds004-q8/stage-source.sh install candidate-n amd64 "$refactor_manifest_sha")
case "$refactor_attempt_id" in *[!0-9a-f]*|"") exit 46;; esac
test "${#refactor_attempt_id}" -eq 32
bash --noprofile --norc container/spike/ds004-q8/stage-source.sh verify candidate-n amd64 "$refactor_manifest_sha" "$refactor_attempt_id"
bash --noprofile --norc container/spike/ds004-q8/stage-source.sh run candidate-n amd64 "$refactor_manifest_sha" "$refactor_attempt_id"
arm64_green_receipt_sha=$(bash --noprofile --norc container/spike/ds004-q8/stage-source.sh green candidate-n)
case "$arm64_green_receipt_sha" in *[!0-9a-f]*|"") exit 47;; esac
test "${#arm64_green_receipt_sha}" -eq 64
test "$arm64_green_receipt_sha" = "$refactor_green_receipt_sha"
arm64_manifest_sha=$(bash --noprofile --norc container/spike/ds004-q8/stage-source.sh pack candidate-n arm64 "$arm64_green_receipt_sha")
case "$arm64_manifest_sha" in *[!0-9a-f]*|"") exit 48;; esac
test "${#arm64_manifest_sha}" -eq 64
test "$arm64_manifest_sha" = "$refactor_manifest_sha"
arm64_attempt_id=$(bash --noprofile --norc container/spike/ds004-q8/stage-source.sh install candidate-n arm64 "$arm64_manifest_sha")
case "$arm64_attempt_id" in *[!0-9a-f]*|"") exit 49;; esac
test "${#arm64_attempt_id}" -eq 32
bash --noprofile --norc container/spike/ds004-q8/stage-source.sh verify candidate-n arm64 "$arm64_manifest_sha" "$arm64_attempt_id"
bash --noprofile --norc container/spike/ds004-q8/stage-source.sh run candidate-n arm64 "$arm64_manifest_sha" "$arm64_attempt_id"
```

Exact stdout:

| Invoked operation | Exact exposed stdout |
| --- | --- |
| `green candidate-n` | One 64-lowercase-hex `green_receipt_sha` line; never PASS. |
| `pack candidate-n <arch> <green_receipt_sha>` | One 64-lowercase-hex `manifest_sha` line; never PASS. |
| `install candidate-n <arch> <manifest_sha>` | One 32-lowercase-hex `attempt_id` line; never PASS. |
| `verify candidate-n <arch> <manifest_sha> <attempt_id>` | Empty. |
| `stage-source.sh run candidate-n <arch> <manifest_sha> <attempt_id>` success | Exact bytes `PASS candidate-n <arch> <manifest_sha> <attempt_id>\n`, originated only by acknowledged `run-spike.sh emit-pass` and transported unchanged after successful SSH exit and validation. |
| Any prepare/finalize/verification phase | Empty; captured stdout/stderr are hashed and any pre-ack PASS is rejected. |

Exact immutable GREEN and source schemas:

| Kind | Path and success files |
| --- | --- |
| GREEN | `/var/tmp/ploinky-ds004-q8-artifacts/green/candidate-n/<green_receipt_sha>/`: `green-receipt.json`, `green-test.out`. |
| amd64 source | `/var/tmp/ploinky-ds004-q8-artifacts/source/amd64/candidate-n/<manifest_sha>/`: `frozen-base.bundle`, `overlay.tar`, `source-manifest.json`. |
| arm64 source | `/var/tmp/ploinky-ds004-q8-artifacts/source/arm64/candidate-n/<manifest_sha>/`: `frozen-base.bundle`, `overlay.tar`, `source-manifest.json`. |

Exact attempt schema:

| State | Exact files |
| --- | --- |
| Success | Phase-ordered `runner-receipt.json`, `verification.json`, `preflight-scan-request.json`, `external-preflight-tcp.scan`, `scan-request.json`, `external-tcp.scan`, `external-udp.scan`, `evidence-pre-cleanup.json`, `evidence-final.json`, `summary.txt`; no `failure.json`. |
| Controlled failure | Only the completed strict phase prefix above plus immutable `failure.json`; no future placeholders. |
| Abrupt interruption | Only a strict prefix; journal may be unterminated; visibly BLOCKED and never resumable/passable. |

Attempt root is `/var/tmp/ploinky-ds004-q8-artifacts/runs/<arch>/candidate-n/<manifest_sha>/<attempt_id>/`.
Journal is `/var/tmp/ploinky-ds004-q8-artifacts/runs/<arch>/candidate-n/attempt-journal.jsonl`.
Every journal event has prior hash and explicit self `eventSha256`; terminal PASS authorization is anchored and synced before acknowledgement.
No command commits, pushes, publishes, deploys, deletes artifacts, or mutates a registry.

## 4. Exact execution and evidence contract

Local GREEN is mandatory immediately before the initial amd64, post-refactor amd64, and arm64 pack.
Every install is followed by exact staged-source contract GREEN and the architecture-pinned Python container with `--network=none`, read-only `/opt/ds004/probe.py`, and exact `python3 /opt/ds004/probe.py --self-test`; immutable `verification.json` gates run with the matching local GREEN receipt.

All SSH/SFTP trust inputs and destination grammars match the main plan.
SSH includes `-T` and the exact fixed `/usr/bin/env -i PATH=/usr/sbin:/usr/bin:/sbin:/bin BASH_ENV=/dev/null /bin/bash --noprofile --norc -s --` executor template.
Only enum/hex/IPv4/decimal-comma positional tokens enter its contract-tested remote command; static script bytes alone enter stdin.
No profile, PTY, ambient config, caller script text, `eval`, `source`, or `sh -c`.
SFTP remains fixed and hardened.

Scanner independence is proven before baseline and live scans by pinned host-key fingerprint, SHA-256 of machine identity rather than raw machine-id, boot ID, all local addresses, every resolved hostname address, actual connected address, target route, selected source IP, and non-loopback egress interface.
Runner receipts contain equivalent facts.
Reject any address/OOB/LAN collision or corresponding machine/boot/host-key match with either runner, local target assignment, changed/cloned/ambiguous identity, or route/source failure.
TCP `22` on the LAN target is closed before activation and live.
Scanner static stdin uses the fixed executor and exact `sudo -n nmap -n -Pn -sS --reason -p "$tcp_ports" -- "$target"` and `sudo -n nmap -n -Pn -sU --reason -p "$udp_ports" -- "$target"` commands.

The exact runnable cross-product is five managed paths (`managed-default`, `managed-a`, `managed-b`, `managed-dual-source-a`, `managed-dual-source-b`) plus `unmanaged-separate`, `manual-default`, `manual-a`, `manual-b`, every permitted `address-reuse-<network>`, and every permitted `overlap-<network>`.
Every runnable path probes both alias and literal transport IPv4 at `8081` and every fixed/discovered/decoy TCP port with validated source IP.
Alias argv uses `http://host.containers.internal:<port>`; literal argv uses `http://<validated_transport_ipv4>:<port>`; both use the fixed payload hex and `--source-ipv4 <validated_source_ipv4>`.
Only managed/`8081` connects with exact payload; every other cell must be actual refusal, and a missing cell blocks.
Record cell IDs and exact inputs/results.

Outer owner discovery runs exact `sudo -n ss -H -lntp` and `sudo -n ss -H -lunp` before activation, live, and after cleanup with NOPASSWD limited to those disposable-runner commands.
Validate each `/proc/<pid>` UID/cgroup/netns; missing TCP/UDP owner facts blocks.
Scanner TCP/UDP sets equal their fixed plus discovered/decoy inventories.

Prepare/finalize/verification stdout/stderr is captured and hashed, never exposed; pre-ack PASS is rejected.
Finalize writes evidence verdict `ELIGIBLE`, not PASS.
After final retrieval/schema/hash/source/state validation, coordinator appends a locked `pass-authorization` event with prior hash and self `eventSha256`, fdatasyncs/fsyncs journal, and fsyncs its parent.
Only then fixed `run-spike.sh emit-pass` validates final evidence and terminal hashes.
`stage-source.sh run` buffers the acknowledgement until zero exit/exact bytes, then transports it unchanged; acknowledgement failure appends/syncs failure and exposes no PASS.

Attempt files are phase-monotonic exactly as section 3.
Success has the full set and no `failure.json`.
Controlled failure has only a completed prefix plus immutable `failure.json`; interruption has only a strict prefix/unterminated journal, is BLOCKED, and cannot resume/pass.
No placeholder, fabrication, rewrite, or deletion is allowed.
`evidence-final.json` may record cleanup failure and is not inherently PASS.
Human-reviewed recovery may append/fsync only a failure classification after ownership revalidation.

## 5. Non-normative evidence facts retained for regeneration

**NON-NORMATIVE. NOT AN EXECUTION INVENTORY.**

The nine frozen default SHAs remain recorded in the main plan.
The old evidence-tip delta totals were Ploinky 266 files, AssistOSExplorer 150 files, basic 31 files, webmeetInfra 22 files, proxies 34 files, UmamiAgent 14 files, and AchillesCLI 19 files.
These totals describe old branch evidence and do not predict clean-rebuild changes.
`container-image-builds/main@9fd2641` remains the image-contract reference.
`copilot-agents` is excluded.

Previously undercounted current-default conflict observations are: Ploinky 20, AssistOSExplorer 6, proxies 1, and AchillesCLI 3.
The corrected Ploinky set includes `ploinky/docs/specs/DS011-security-model.md`.
The corrected Ploinky set also includes its fifth conflicting HTML document.
These counts are evidence facts only and must be recomputed after S0.

## 6. Provisional deferred impact ledger

**NON-NORMATIVE. NON-EXACT. NON-EXECUTABLE. INCOMPLETE.**

This is not a complete inventory.
It must be regenerated from current requirements, default code, tests, and accepted S0 evidence.

| Area | Known omitted or corrected impact to re-derive |
| --- | --- |
| JWT and secrets | Revisit exact paths below. Provisional API exactly `deriveAgentRequestSecret(agentId, instanceId, enableGeneration, { encoding })`, internal master resolution, domain `ploinky/agent-request-secret/v2`, byte `0x01` plus unsigned-32-bit-big-endian-length-prefixed UTF-8 tuple fields. Exact provisional tests: `perAgentSecret`, `agentEnvInjection`, `agentAssertion`, `requestHash`, `agentAssertionService`, `jwsCodec`, `routerRequestJwt`, `agentReplacementIdentity`, `lifecycleHostHookEnv`, `bwrapArgs`, `sandboxRuntime`; prove current/current, reject old tuple/current secret and predecessor secret/current claims, and rotate on replacement/re-enable. |
| Explorer | Revisit `explorer/manifest.json`, root DS/HTML, paired instructions, and legacy deploy workflows/references. Browser smoke uses exact cwd `AssistOSExplorer/tests/smoke`, then `npm ci`, then `npm run install:browsers`. Existing legacy deploy workflows must never be invoked. |
| WebMeet | Revisit `webmeetAgent/manifest.json`, per-operation topology resolution, exact generation capture, TURN refresh/rejoin, and route isolation. |
| WebMeet STT | Revisit `webmeetStt/manifest.json`, managed isolated bridge attachments, private-service declarations, and negative exposure tests. |
| AchillesCLI | Preserve and test on-demand GPTResearcher startup, sealed source/install inputs, unversioned markers, base-path routing, digest, SBOM, and provenance. |
| webmeetInfra | Revisit paired `AGENTS.md` and `CLAUDE.md`, LiveKit host-mode generation ownership, loopback listeners, exact UDP 7882 behavior, native image tests, and forbidden listeners. |
| OnlyOffice | Revisit `onlyOffice/manifest.json`, control/editor/storage listener split, callback JWT/Origin/SSRF/bounds, drain/save, preinstall no-deletion behavior, exact script/session renames, wrapper and source-absence tests, and no physical publication. |
| Umami | Retain `UMAMI_PASSWORD`; re-derive dashboard and telemetry proxy requirements without an unauthorized rename. |
| Runtime generation | Add exact `io.assistos.ploinky.runtime-epoch=clean-break-1`. Use a content-addressed generation directory; both mode-0600 files share `generationId`; fsync files and directory; atomically publish/fsync selector last; resolve active once and compare generation/semantics; serialize with per-Box writer lock; on ambiguity disable/fsync selector first; retain old generation until consumers exit; fault-inject to prove no mixed pair. |
| Supply chain | Native amd64 and arm64 LLM runtime; only genuinely missing CI suites; local OCI artifact, digest, SBOM, and provenance before separately authorized registry or tag action. |

### 6.1 Exact known omissions, still incomplete and non-normative

| Concern | Exact currently known paths omitted from any authoritative downstream inventory |
| --- | --- |
| JWT/security | `ploinky/README.md`; `ploinky/cli/services/masterKey.js`; `ploinky/cli/services/agentIdentityEnv.js`; `ploinky/Agent/lib/agentAssertion.mjs`; `ploinky/Agent/lib/requestHash.mjs`; `ploinky/cli/server/security/tokens/JwsCodec.js`; `ploinky/cli/server/security/tokens/AgentAssertionService.js`; `ploinky/cli/server/security/tokens/RouterRequestTokenService.js`; `ploinky/cli/server/mcp-proxy/invocationMinter.js`; `ploinky/cli/server/privateRouter.js`; `ploinky/Agent/client/AgentMcpClient.mjs`; `ploinky/Agent/client/MCPBrowserClient.js`; `ploinky/cli/server/authHandlers/marketplaceRoutes.js`; `ploinky/cli/services/docker/agentServiceManager.js`; `ploinky/cli/services/bwrap/bwrapServiceManager.js`; `ploinky/cli/services/bwrap/bwrapFleet.js`; `ploinky/cli/services/lifecycleHooks.js`; `ploinky/cli/services/noWaitWorker.js`; `ploinky/cli/services/startupConfigProviders.js` |
| Explorer OnlyOffice exposure and deleted utilities | `AssistOSExplorer/onlyOffice/tests/manifest-env.test.mjs`; `AssistOSExplorer/onlyOffice/tests/runtime-bootstrap.test.mjs`; `AssistOSExplorer/explorer/services/onlyoffice/onlyoffice-editor-host.js`; `AssistOSExplorer/explorer/tests/unit/explorerManifestPublicExposure.test.js`; `AssistOSExplorer/explorer/utils/server/onlyoffice/auth-info.mjs`; `AssistOSExplorer/explorer/utils/server/onlyoffice/file-types.mjs`; `AssistOSExplorer/explorer/utils/server/onlyoffice/onlyoffice-config.mjs`; `AssistOSExplorer/explorer/utils/server/onlyoffice/onlyoffice-document-store.mjs`; `AssistOSExplorer/explorer/utils/server/onlyoffice/onlyoffice-dpu-client.mjs`; `AssistOSExplorer/explorer/utils/server/onlyoffice/onlyoffice-session-store.mjs`; `AssistOSExplorer/explorer/utils/server/onlyoffice/workspace-secrets.mjs` |
| WebMeet STT manifest test | `AssistOSExplorer/webmeetStt/tests/test_manifest_contract.py` |
| Achilles source absence | `AchillesCLI/GPTResearcher/test/v5-source-absence.test.mjs` |
| webmeetInfra paired instructions | `webmeetInfra/AGENTS.md`; `webmeetInfra/CLAUDE.md`; `webmeetInfra/liveKitServerAgent/AGENTS.md`; `webmeetInfra/liveKitServerAgent/CLAUDE.md` |
| OnlyOffice renames | `AssistOSExplorer/onlyOffice/scripts/configure-document-server-v5.sh` to `AssistOSExplorer/onlyOffice/scripts/configure-document-server.sh`; `AssistOSExplorer/onlyOffice/scripts/configure-support-listeners-v5.sh` to `AssistOSExplorer/onlyOffice/scripts/configure-support-listeners.sh`; update `AssistOSExplorer/onlyOffice/scripts/run-document-server-with-autoassembly.sh`; update `AssistOSExplorer/onlyOffice/tests/document-server-wrapper.test.mjs`; update `container-image-builds/tests/edge-routing-source-absence.test.mjs` |

No downstream execution commands belong in this annex.
No downstream path or count is asserted complete.
Only after fresh S0 review and explicit human acceptance, discard this provisional ledger as planning authority and regenerate the full inventory independently.
Human rejection or N failure permits only a separately reviewed bounded architecture-decision spike or project closure.
