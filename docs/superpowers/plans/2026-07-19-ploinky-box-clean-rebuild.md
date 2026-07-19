# Ploinky Box Clean Rebuild — S0 Architecture Decision Spike Plan

**Overall status: ARCHITECTURE-SPIKE-READY ONLY.**

The only normative work authorized by this plan is S0: resolve Ploinky DS004 Question 8 with native evidence.
The future clean rebuild is deferred, not implementation-planned, and not release-ready.
Nothing in this document authorizes product implementation, publication, or deployment.

## 1. Authority boundary, non-goals, and governance

The commissioning prompt requires DS004 Question 8 to be resolved before planning implementation beyond a spike.
That boundary is controlling.
Sections 1 through 7 and 9 are normative only for S0.
Section 8 is a provisional requirements ledger, not a downstream plan.

Authority remains, in descending order:

1. Current default-branch behavior and each repository's `CLAUDE.md` or canonical `AGENTS.md`.
2. `container-image-builds/main@9fd2641` and its tests for image byte contracts.
3. Final committed `ploinky-box` code, DS specifications, and tests as behavioral evidence.
4. Deleted plans and intermediate commits as non-normative rationale only.

S0 explicitly does not authorize:

- S1 through S13, or any equivalent downstream slice.
- Product runtime, CLI, Router, agent, image, workflow, registry, or deployment implementation.
- Migration, compatibility, adoption, repair, rollback, or translation of an old Box.
- Merge, rebase, cherry-pick, archive branch, commit, push, tag, image publication, or registry mutation.
- Cloudflare, DNS, production, shared infrastructure, or remote resource mutation.
- Worktree removal, repository cleanup, pruning, reset, stash mutation, or branch switching.

Fetching is a local Git-state mutation and is permitted only when a human separately authorizes execution of the S0 bootstrap.
Creating the one detached S0 worktree is also a local mutation and is part of future S0 execution, not this documentation rewrite.
No file listed in this plan is created now.

The human user decides all commits, publication, deployment, acceptance, rejection, and rollback actions.
A fresh consequential security review is required after evidence collection and before any human architecture decision.
Only after explicit human acceptance may a new full implementation plan be regenerated from then-current default branches.
Rejection or any Candidate N failure permits only a separately reviewed bounded architecture-decision spike or project closure while DR1 remains unresolved.

Nine repositories have frozen observations below.
Only after explicit human acceptance could eight be reconsidered by a later regenerated plan.
`copilot-agents` is excluded.
S0 itself owns only the clean Ploinky worktree.

## 2. S0 security invariants

S0 may pass only if every invariant is evidenced on both native Linux amd64 and native Linux arm64:

| ID | Invariant |
| --- | --- |
| I-1 | Only managed isolated bridge containers can reach the Box-outer strict loopback TCP listener on `127.0.0.1:8081`. |
| I-2 | The mechanism makes no other Box-outer loopback listener reachable. |
| I-3 | An unmanaged bridge container gets no private-lane reachability. |
| I-4 | No tested listener is exposed to a physical LAN or WAN interface. |
| I-5 | Setup, engine, bind, validation, dial, lifecycle, scan, and cleanup failures fail closed under the defined taxonomy. |
| I-6 | Candidate evidence comes from native, separately fresh amd64 and arm64 runners, not emulation. |
| I-7 | A fresh consequential security review and explicit human approval follow the evidence; technical success alone makes no architecture decision. |

The Router's strict listener remains loopback-only.
S0 must not outer-publish `8081`, bind it to wildcard or an outer-facing address, weaken interface classification, or restore a network-gateway component.
Address-wide host-loopback mapping is forbidden.
No capability, firewall, authentication, header, or dynamic-destination exception may compensate for a failed invariant.

## 3. Frozen baselines and safe bootstrap

These SHAs were captured on 2026-07-19 and are observations to verify, not permission to advance them silently.

| Repository | Remote/default | Frozen SHA | Evidence tip |
| --- | --- | --- | --- |
| `ploinky` | `origin/master` | `ac39b870d990869616e4882222c78037dc11d07d` | `6f6e035e2516fd42ebe2a9bcd4255d81bdeabcf9` |
| `AssistOSExplorer` | `assistos-ai/main` | `74aac2913e7c1c3f726f6a7c9274aad7ea08c162` | `d36252cbbdc0248e153516ea3531df29a4cab45f` |
| `basic` | `origin/main` | `dd72190acfef1e2ea205fd1479c400c7f38cd769` | `738b9a3a3c51d6a0c19183dccfa212e386780a29` |
| `webmeetInfra` | `origin/main` | `c43d2ac396af0f500c422fd1777a7095a6412d6f` | `44b3d1207ae9bf73f704d94c8fe91a98f75e7758` |
| `proxies` | `origin/main` | `49f2911fba4ec99e897414ade9b993281c1b9d40` | `5f45a76ae7707cce5db186b68881bbe59661be3f` |
| `UmamiAgent` | `origin/main` | `99043fa52a04c590f7473ffc075df3a8f22595c8` | `d8df6257ea37da67f1377f139aa1cecda4165a84` |
| `AchillesCLI` | `origin/master` | `147eb0d017a6751b6875d8b2a7ee11c6ccc7259b` | `51f260cb76813981eac69d3655c7fff2c814775c` |
| `container-image-builds` | `origin/main` | `9fd26410a7b5f004de69dc01f0cbe5515cb3d510` | ignored contract-4 branch |
| `copilot-agents` | `origin/main` | `fe93a033317b5ffc2afabeffdee905a4a3a918c0` | excluded |

Before creating the S0 worktree, non-pruning/non-maintenance fetch every Ploinky remote, compare `origin/master` with the frozen SHA, and stop if it moved.
The fetch runs under `bash --noprofile --norc`, is disclosed as a local Git-state mutation, and removes no refs or worktrees.
The worktree must be detached at the explicit frozen SHA.

Whether the target path is newly added or reused, do not proceed until all of these checks pass:

- It is registered in `git worktree list --porcelain` for the Ploinky repository.
- Its canonical top level is exactly `/Users/danielsava/work/file-parser/.worktrees/clean/ploinky-ds004-q8`.
- `HEAD` is exactly `ac39b870d990869616e4882222c78037dc11d07d`.
- `HEAD` is detached.
- Its tracked and untracked status is empty.

Any failed check is `SETUP_ERROR` and requires STOP.
No bootstrap command removes anything.

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

The other eight repositories are not fetched or given worktrees by S0.
Their frozen SHAs must be compared again only after explicit human acceptance when a full plan is regenerated.

## 4. DR1 remains unresolved: sole-candidate protocol

DR1 is unresolved before S0.
Candidate N is the sole architecture candidate authorized by this plan; S0 must neither substitute nor infer another transport.

### 4.1 Candidate N — native pasta port confinement

Candidate N uses pasta's `-T` / `--tcp-ns` support for TCP port `8081` only in completely fresh rootless Podman state.
It must not use `--map-host-loopback` in any form.
The runner records pasta help/version, Podman and Netavark versions, rootless configuration, and the actual pasta process argv from `/proc`.
The implementation must prove the real forwarding direction and listener rather than infer semantics from a proposed command.
Only one forwarded port value, `8081`, may exist.
Implicit forwarding, extra ports, an address-wide option, incompatible Netavark composition, or uninspectable actual argv is an invariant failure.

The managed/unmanaged distinction must be demonstrated by network behavior, not inferred from a peer IP, interface, subnet, or Podman label.
The mandatory negative matrix is:

1. An unlabeled manual container on its own unmanaged bridge.
2. An unlabeled manual container attached directly to each managed network, tested separately on every attachment.
3. The managed dual-attached container tested with a source-bound probe on both attachment paths.
4. After removing one managed probe, an unlabeled manual container attempts to reuse that exact released address and is probed whether reuse succeeds or is rejected.
5. An explicitly overlapping unmanaged topology is attempted. Engine rejection is recorded but never substitutes for the other negative cases.

Any manual or unmanaged reachability to `8081`, whether by alias or literal transport endpoint, is an invariant failure.
Record every container/network immutable ID, labels, interfaces, routes, subnets, IPs, address-reuse result, overlap result, and exact probe result.

Podman setup mistakes, image pulls, missing tools, SSH/scanner failures, and harness bugs are setup failures rather than architecture evidence.

### 4.2 Decision rule

Candidate N becomes eligible for a fresh consequential security review and explicit human acceptance only if every invariant and gate passes independently on native amd64 and native arm64.
Evidence never chooses the architecture.
A genuine N invariant failure ends this S0 with DR1 unresolved.
That failure, a human rejection, or an inconclusive review authorizes only a separately reviewed bounded architecture-decision spike or project closure; it never authorizes downstream or full-rebuild planning.
Only explicit human acceptance after the fresh review permits regeneration of a full implementation plan from then-current default branches.

## 5. Exact normative S0 source inventory

The exact bounded inventory is these five planned files; none is created now:

```text
ploinky/container/spike/ds004-q8/run-spike.sh
ploinky/container/spike/ds004-q8/probe.py
ploinky/container/spike/ds004-q8/stage-source.sh
ploinky/container/spike/ds004-q8/README.md
ploinky/tests/unit/ds004Q8SpikeContract.test.mjs
```

`run-spike.sh` owns runner preflight, topology, probes, phase state, evidence, cleanup, and the final acknowledgement.
`probe.py` owns TCP probing plus complete reference/decoy modes.
`stage-source.sh` owns deterministic GREEN/pack/install/verify/run orchestration, coordinator SSH/scanning, immutable transfers, and journals.
Both shell scripts start exactly with `#!/usr/bin/env bash` then `set -euo pipefail`.
Only the `run-spike.sh emit-pass` source-code location may originate exact success bytes.
`stage-source.sh run` may transport those validated, already-originated bytes unchanged; it never constructs or semantically emits PASS.

The contract test asserts the five paths and absence of every alternate-candidate helper, gate, command, transport, evidence lane, or status.
It also asserts the local GREEN and native verification gates, PASS acknowledgement ordering, immutable phase schemas, scanner independence, hardened remote executor, exact probe matrix, owner-aware TCP/UDP discovery, cleanup, and acceptance-only decision.

## 6. Test-first S0 execution plan

### 6.1 Inputs, SSH trust, and fixed remote executor

Use fresh native amd64 and arm64 Linux attempts without emulation or reused runner/Podman state.
Required coordinator inputs are exactly:

```text
DS004_EXTERNAL_SCANNER_SSH
DS004_AMD64_RUNNER_SSH
DS004_ARM64_RUNNER_SSH
DS004_AMD64_BOX_LAN_IPV4
DS004_ARM64_BOX_LAN_IPV4
DS004_SSH_KNOWN_HOSTS_FILE
DS004_EXTERNAL_SCANNER_IDENTITY_FILE
DS004_AMD64_RUNNER_IDENTITY_FILE
DS004_ARM64_RUNNER_IDENTITY_FILE
```

Destinations are ASCII `user@host` full-matching `^([A-Za-z0-9_][A-Za-z0-9._-]*)@([A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?)*)$`.
Host length is at most 253 bytes, labels at most 63, and dotted-numeric hosts are four decimal octets in 0–255.
Runner hosts are literal OOB management IPv4 addresses distinct from both Box LAN targets.
Reject non-ASCII, whitespace, colon, leading hyphen, option, or metacharacter input.

Known-hosts and identity paths resolve canonically to absolute, regular, non-symlink, coordinator-owned mode-`0600` files.
Known-hosts contains exact pinned, unhashed, non-wildcard entries for all three hosts; reject TOFU, changed/missing/conflicting keys, wildcard/negated patterns, and wildcard certificate authorities.

SSH uses:
`ssh -F /dev/null -o BatchMode=yes -o ClearAllForwardings=yes -o IdentitiesOnly=yes -o IdentityAgent=none -o StrictHostKeyChecking=yes -o GlobalKnownHostsFile=/dev/null -o UserKnownHostsFile="$known_hosts" -i "$identity" -T -- "$destination" "$remote_executor"`.
SFTP uses:
`sftp -F /dev/null -o BatchMode=yes -o ClearAllForwardings=yes -o IdentitiesOnly=yes -o IdentityAgent=none -o StrictHostKeyChecking=yes -o GlobalKnownHostsFile=/dev/null -o UserKnownHostsFile="$known_hosts" -i "$identity" -b "$batch_file" -- "$destination"`.

`remote_executor` is serialized only from this exact template:
`/usr/bin/env -i PATH=/usr/sbin:/usr/bin:/sbin:/bin BASH_ENV=/dev/null /bin/bash --noprofile --norc -s -- <phase> candidate-n <arch> <manifest_sha> <attempt_id> <target_ipv4> <tcp_ports> <udp_ports>`.
Phase/candidate/architecture are fixed enums; IDs are exact lowercase hex; target is strict IPv4; port lists are deduplicated decimal commas in 1–65535.
The scanner template is the same through `<phase> scanner-scan scanner <manifest_sha> <attempt_id> <target_ipv4> <tcp_ports> <udp_ports>`.
The unavoidable sshd shell parses only this contract-tested, metacharacter-free template.
Static owned script bytes alone enter stdin and EOF terminates them; dynamic values are positional args, never script content.
No PTY, profile, ambient config, caller text, `eval`, `source`, or `sh -c`.
Capture and hash every phase's stdout/stderr; prepare/finalize/verification stdout is never exposed.

### 6.2 Scanner independence and OOB management

Before baseline and again before live scans, pinned scanner preflight records its host-key fingerprint, SHA-256 of machine identity, boot ID, local addresses, route to target, selected source IP, and egress interface.
It never records raw machine-id.
Each runner receipt records equivalent machine/boot/address facts and its host-key fingerprint.
Under pinned SSH, resolve and record every address for a scanner hostname plus the actual connected address.

Reject if scanner destination/connected/resolved address or any scanner local address equals either runner address, OOB endpoint, or Box LAN target.
Reject if scanner machine identity, boot identity, or host-key fingerprint matches either runner's corresponding value.
The target must not be locally assigned on the scanner; its route must use a non-loopback interface and source.
Missing, ambiguous, changed, or cloned identity is `BLOCKED`.
Revalidate the whole comparison before both scans.

Runner preflight proves the selected LAN IP belongs to a distinct non-management interface and differs from the SSH local endpoint.
The independent TCP `22` scan must be closed before activation and while live; no baseline exception exists.

### 6.3 GREEN receipts, immutable source, install, and verify

TDD order is direct RED, implement, local GREEN, then pack/install/verify/run.
`stage-source.sh green candidate-n` executes exactly `node --test tests/unit/ds004Q8SpikeContract.test.mjs`.
It atomically records command, canonical source hash, exit, raw-output hash, and raw output beneath `/var/tmp/ploinky-ds004-q8-artifacts/green/candidate-n/<green_receipt_sha>/`.
It prints one deterministic 64-lowercase-hex `green_receipt_sha` and never PASS.
Identical source/command/output reuses only byte-identical immutable GREEN evidence.

`pack candidate-n <arch> <green_receipt_sha>` verifies a successful receipt against current source, builds in a private mode-`0700` temp directory, and validates exact five-path Git status before/after.
It deterministically publishes `/var/tmp/ploinky-ds004-q8-artifacts/source/<arch>/candidate-n/<manifest_sha>/` containing `frozen-base.bundle`, `overlay.tar`, and `source-manifest.json`.
The canonical manifest includes frozen base `ac39b870d990869616e4882222c78037dc11d07d`, GREEN receipt SHA, bundle/archive hashes, and each overlay path/action/mode/size/hash, but excludes architecture/time/environment.
Existing byte-identical packages are verified/reused; mismatch is `SETUP_ERROR`; never overwrite/delete.

`install candidate-n <arch> <manifest_sha>` generates/prints a fresh 32-lowercase-hex CSPRNG `attempt_id`, creates the nonexisting remote root `/var/tmp/ploinky-ds004-q8/candidate-n/<arch>/<manifest_sha>/<attempt_id>/`, reconstructs/verifies source, and writes immutable `runner-receipt.json`.
`verify candidate-n <arch> <manifest_sha> <attempt_id>` reruns exact contract GREEN from staged source and runs the architecture-pinned Python image with `--network=none`, staged `probe.py` read-only at `/opt/ds004/probe.py`, and exact `python3 /opt/ds004/probe.py --self-test`.
The image is amd64 `docker.io/library/python@sha256:edf7256d5773b7ca9c41290b7bf6f844c15c6c2168f97473c276acb6789f12ab` or arm64 `docker.io/library/python@sha256:903e5cb59282e51327ed0ffac7c0a10a3ebfaab862541bc1533dcaf4967bd3a2`.
Verify writes immutable `verification.json` with command/source/image/exit/output hashes and has empty stdout.
Run requires matching successful local GREEN receipt and remote verification for the same source/attempt.

### 6.4 Exact probe cross-product and owner inventory

Managed path IDs are `managed-default`, `managed-a`, `managed-b`, `managed-dual-source-a`, and `managed-dual-source-b`.
Negative path IDs are `unmanaged-separate`, `manual-default`, `manual-a`, `manual-b`, each engine-permitted `address-reuse-<network>`, and each engine-permitted `overlap-<network>`.
Attempt every address reuse for default/A/B and every explicit overlap; record engine rejection, but it replaces no runnable negative.

For every runnable path, probe both destination forms at every test port:
`alias` uses `python3 /opt/ds004/probe.py --destination-url http://host.containers.internal:<port> --expected-payload-hex 44533030342d51382d524f555445522d4f4b0a --source-ipv4 <validated_source_ipv4>`.
`literal` uses `python3 /opt/ds004/probe.py --destination-url http://<validated_transport_ipv4>:<port> --expected-payload-hex 44533030342d51382d524f555445522d4f4b0a --source-ipv4 <validated_source_ipv4>`.
Test `8081` plus every fixed/discovered/decoy non-`8081` TCP port.
Managed/`8081` must `CONNECTED` with exact payload; every other runnable cell must be actual `REFUSED`.
Any missing cell, DNS/timeout/engine/network error, unexpected payload, or manual/unmanaged reachability blocks or fails the invariant as classified.
Record stable matrix cell ID, path, destination form/address, port, source, expectation, result, errno/exit, and raw hash.

In the Box outer namespace, run exact owner inventories `sudo -n ss -H -lntp` and `sudo -n ss -H -lunp` before activation, live, and after cleanup.
NOPASSWD is permitted only for those exact commands on the disposable runner.
For every socket validate `/proc/<pid>` UID, cgroup, and network namespace; missing owner/process/namespace or UDP inventory is `BLOCKED`.
Align TCP scanner ports with fixed `22,6379,7880,7980,7981,8080,8081` plus every discovered/decoy TCP port.
Align UDP with fixed `7882` plus every discovered UDP port.
Preserve raw owner inventories and hashes.

### 6.5 Coordinator phases, evidence prefixes, and PASS acknowledgement

Coordinator run phases are monotonic:

1. Preflight before activation writes `preflight-scan-request.json`; scanner independence is revalidated, exact `sudo -n nmap -n -Pn -sS --reason -p "$tcp_ports" -- "$target"` scans TCP `22`, and raw output becomes `external-preflight-tcp.scan`.
2. Prepare activates N, freezes state, completes the full probe/owner matrix, and writes `scan-request.json`. Its stdout/stderr are captured and hashed; any pre-ack exact PASS line/token is rejected.
3. After identity revalidation, live scanner static stdin executes the same TCP command and exact `sudo -n nmap -n -Pn -sU --reason -p "$udp_ports" -- "$target"`; raw outputs become `external-tcp.scan` and `external-udp.scan`.
4. Finalize verifies IDs/state/scans, writes `evidence-pre-cleanup.json`, performs targeted cleanup, then writes `evidence-final.json`. It writes only non-success-token verdict `ELIGIBLE` to evidence, has no exposed stdout, and may record non-PASS cleanup failure.
5. Coordinator retrieves final artifacts, validates schema, hashes, source/verification/state, and appends a locked `pass-authorization` journal event containing previous hash and explicit self `eventSha256`. It fdatasyncs or fsyncs the journal and fsyncs its parent.
6. Only then a fixed acknowledgement invokes `run-spike.sh emit-pass` with validated candidate/arch/manifest/attempt, final-evidence SHA-256, and terminal event SHA-256. That mode revalidates local evidence/IDs/hashes and is the sole source location allowed to originate exact `PASS candidate-n <arch> <manifest_sha> <attempt_id>\n`.
7. `stage-source.sh run` captures acknowledgement stdout until zero exit and exact-byte validation, then transports those unchanged bytes to coordinator stdout. All other run phases have empty exposed stdout. An acknowledgement failure appends/fsyncs a later failure event, exposes no PASS, and exits nonzero.

No PASS byte may reach coordinator stdout before final retrieval/validation, the self-hashed journal append, journal fdatasync/fsync, and parent fsync.
The contract asserts this ordering and scans source so no other location can originate the exact success bytes.

Each attempt directory grows only by phase-owned atomic files:

| Phase | Newly permitted immutable files |
| --- | --- |
| install | `runner-receipt.json` |
| verify | `verification.json` |
| preflight | `preflight-scan-request.json`, `external-preflight-tcp.scan` |
| prepare/live | `scan-request.json`, `external-tcp.scan`, `external-udp.scan` |
| finalize | `evidence-pre-cleanup.json`, then `evidence-final.json` |
| successful completion | `summary.txt` |

A success has the complete set and no `failure.json`.
A controlled failure has only its completed strict phase prefix plus immutable `failure.json` containing phase, taxonomy, error, and raw hashes; never fabricate future files.
An abrupt interruption may leave only a strict prefix and an unterminated journal; it is visibly `BLOCKED`, cannot resume or PASS, and preserves all bytes.
After ownership revalidation, human-reviewed recovery may only append/fsync a failure-classification event/file.

Per architecture, append journal `/var/tmp/ploinky-ds004-q8-artifacts/runs/<arch>/candidate-n/attempt-journal.jsonl` under an exclusive lock.
Every event includes previous-event SHA-256, explicit self `eventSha256`, manifest/attempt IDs, phase/verdict, and artifact hashes; append, journal fdatasync/fsync, and parent fsync precede phase advancement.
Attempt files live under `/var/tmp/ploinky-ds004-q8-artifacts/runs/<arch>/candidate-n/<manifest_sha>/<attempt_id>/`.
Never rewrite/delete evidence, journals, packages, partial attempts, or failed attempts.
Cleanup targets only exact run-label objects and recorded PIDs after ID/UID/label/ownership revalidation; no prune/reset/broad kill.

After initial amd64 GREEN, refactor only duplication/validation, take a new local GREEN receipt, repack, and run a fresh verified amd64 attempt.
Then take another GREEN receipt for identical refactored content, assert the same receipt and manifest SHA, and run a fresh verified arm64 attempt.
A genuine N failure ends S0 with DR1 unresolved.
Only fresh consequential review plus explicit human acceptance permits downstream GAMP/full-plan regeneration; rejection/failure permits only a bounded reviewed spike or closure.

## 7. Exact S0 commands and output schemas

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

## 8. Provisional downstream requirements ledger

**NON-NORMATIVE. NON-EXACT. NON-EXECUTABLE.**

This ledger prevents known corrections from being lost while the full plan is deferred.
It is not a changed-file inventory, task graph, command list, authorization, or claim of completeness.
Every entry must be re-derived from current requirements, default branches, tests, and accepted S0 evidence only after explicit human acceptance.

| Area | Provisional requirement to re-derive later |
| --- | --- |
| Master key | Resolve `PLOINKY_MASTER_KEY` from process environment, then walked-up `.env`, and fail if unset. No built-in seed, generated key, persistence fallback, or compatibility fallback. Inject only by environment name where authorized. |
| Agent secret | Keep one `PLOINKY_AGENT_SECRET`. Provisional API exactly `deriveAgentRequestSecret(agentId, instanceId, enableGeneration, { encoding })`, with master resolution internal; HKDF domain exactly `ploinky/agent-request-secret/v2`; encoding byte `0x01` then each UTF-8 tuple field as unsigned 32-bit big-endian length plus bytes. Exact provisional modules: `ploinky/cli/services/masterKey.js`, `ploinky/cli/services/agentIdentityEnv.js`, `ploinky/Agent/lib/agentAssertion.mjs`, `ploinky/Agent/lib/requestHash.mjs`, `ploinky/cli/server/security/tokens/JwsCodec.js`, `ploinky/cli/server/security/tokens/AgentAssertionService.js`, `ploinky/cli/server/security/tokens/RouterRequestTokenService.js`, `ploinky/cli/server/mcp-proxy/invocationMinter.js`, `ploinky/cli/server/privateRouter.js`, `ploinky/Agent/client/AgentMcpClient.mjs`, `ploinky/Agent/client/MCPBrowserClient.js`, `ploinky/cli/server/authHandlers/marketplaceRoutes.js`, `ploinky/cli/services/docker/agentServiceManager.js`, `ploinky/cli/services/bwrap/bwrapServiceManager.js`, `ploinky/cli/services/bwrap/bwrapFleet.js`, `ploinky/cli/services/lifecycleHooks.js`, `ploinky/cli/services/noWaitWorker.js`, and `ploinky/cli/services/startupConfigProviders.js`. Exact provisional tests: `perAgentSecret`, `agentEnvInjection`, `agentAssertion`, `requestHash`, `agentAssertionService`, `jwsCodec`, `routerRequestJwt`, `agentReplacementIdentity`, `lifecycleHostHookEnv`, `bwrapArgs`, and `sandboxRuntime`; prove current/current success, old tuple/current secret failure, predecessor secret/current claims failure, replacement rotation, and re-enable rotation. |
| Runtime discriminator | Numeric contract `5` already exists. Add exact desired-and-existing label `io.assistos.ploinky.runtime-epoch=clean-break-1`; mismatch returns `BOX_RECREATE_REQUIRED` before mutation. Contract `5` alone is insufficient. |
| Transport generation | Use an immutable content-addressed generation directory: `box-transport.json` and `containers.conf` share one `generationId`, each mode `0600`; fsync both files and the directory, then atomically publish and fsync the active selector last. Readers resolve active once and compare generation plus semantics; a per-Box writer lock serializes writers. On ambiguity, remove or disable and fsync the selector first; retain prior generations until captured consumers exit. Fault injection must prove no reader observes a mixed pair. |
| Optional agents | No production exception for hardcoded optional agent IDs. Use manifests and test fixtures. Source scans cover executable `Agent`, `bin`, `cli`, and `container` roots without scanning docs as production code. |
| Test discipline | Every future behavior change is test-first. Use dependency-injected filesystem and environment adapters; do not mutate global `process.env`. Register `t.after` cleanup for every acquired resource. Test requested chmod calls through the adapter and do not rely on mode `0500` denying root. Evidence is independently re-derived from requirements and tests, never copied from commits. |
| Native images | Build amd64 and arm64 LLM runtime images natively. The runtime supervisor suite is already wired; only the three genuinely missing suites, `box-transport-entrypoint.test.mjs`, `image-definitions.test.mjs`, and `livekit-egress-loopback.test.mjs`, should be added to CI. Produce a local OCI artifact, digest, SBOM, and provenance before any separately authorized registry publish or tag move. |
| OnlyOffice naming | Rename `onlyoffice-sessions-v5.json` to `onlyoffice-sessions.json`, `configure-document-server-v5.sh` to `configure-document-server.sh`, and `configure-support-listeners-v5.sh` to `configure-support-listeners.sh`. Update `AssistOSExplorer/onlyOffice/scripts/run-document-server-with-autoassembly.sh`, `AssistOSExplorer/onlyOffice/tests/document-server-wrapper.test.mjs`, image/build copy sites, and `container-image-builds/tests/edge-routing-source-absence.test.mjs` in the same later change. Use `/usr/local/bin/webtty-start` elsewhere and no `SMOKE_V5_*` variables or `-v5` executable names. |
| Umami | Retain `UMAMI_PASSWORD`; do not rename it to `UMAMI_ADMIN_PASSWORD` without new authority and evidence. |
| Governance docs | Resolve the `basic` canonical-instruction circularity. Maintain paired `AGENTS.md` and `CLAUDE.md` updates for Explorer and `webmeetInfra` where repository policy requires them. |
| Legacy deployment | Explorer legacy deploy workflows currently exist. A later plan must delete or reconcile them and all references; they must never be invoked by this work. |
| Browser smoke | Use exact cwd `AssistOSExplorer/tests/smoke`, then `npm ci`, then `npm run install:browsers`, and test with the pinned browser. Keep independent TCP and UDP physical scans. |
| Product parity | Re-derive current-default startup, WebChat/task, marketplace, GPTResearcher, Router, Cloudflare, LiveKit/WebMeet, Umami, WebTTY, Soul Gateway, and retained-data requirements. Do not inherit old branch behavior when it conflicts with rank 1. |

No S1–S13 task list, dependency graph, file inventory, or downstream execution command survives this rewrite.

## 9. Stop, recovery, and status transitions

Stop immediately on baseline drift, a non-clean or non-detached worktree, missing required external input, wrong native architecture, reused Podman state, image mismatch, engine/setup ambiguity, incomplete listener discovery, ambiguous scan result, unexpected exposure, ownership uncertainty, or cleanup failure.

Classify the stop as `BLOCKED`, `SETUP_ERROR`, or a Candidate N invariant failure using the evidence contract.
Do not convert setup failure into architecture evidence.

Recovery is limited to human-reviewed actions against recorded run-label objects and recorded child PIDs after ownership is revalidated.
There is no prune, reset, broad kill, automatic worktree repair, rollback, migration, or adoption path.

Allowed status transitions are:

```text
architecture-spike-ready
architecture-spike-running
architecture-spike-blocked
candidate-N-evidenced
architecture-review-pending
architecture-human-accepted
architecture-human-rejected
```

`candidate-N-evidenced` does not mean DR1 is resolved.
Only a fresh consequential security review followed by explicit human acceptance can resolve it.
Acceptance permits a newly generated full plan but does not itself make the project implementation-planned or release-ready.
Rejection, failure, or inconclusive evidence leaves DR1 unresolved and permits only a separately reviewed bounded architecture-decision spike or project closure.
