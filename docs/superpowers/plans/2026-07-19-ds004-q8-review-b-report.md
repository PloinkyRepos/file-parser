# DS004-Q8 Review B report

Date: 2026-07-19

Review target: `/Users/danielsava/work/file-parser/ploinky`, branch
`ploinky-box-v2`, HEAD `b83195fd0714bae6ef4d47442d45774ec16d440b`.

Source snapshot used for initial comparison:
`/Users/danielsava/work/file-parser/.worktrees/clean/ploinky-ds004-q8`,
detached at `ac39b870d990869616e4882222c78037dc11d07d`.

Files in scope:

```text
container/spike/ds004-q8/run-spike.sh
container/spike/ds004-q8/probe.py
container/spike/ds004-q8/stage-source.sh
container/spike/ds004-q8/README.md
tests/unit/ds004Q8SpikeContract.test.mjs
```

I did not commit, push, or leave staged changes. I did not set any `DS004_*`
environment variables. I did not attempt native Podman/pasta evidence
collection. The required `node --test` command exercises the contract test's
empty-env fail-closed subprocesses for `install`, `verify`, and `run`; those
are local negative checks, not native evidence collection.

## Review B brief used

1. Every error path terminates with a nonzero exit. Look for places
   `set -euo pipefail` is defeated: command substitution assigned outside a
   conditional, `|| true`, lost subshell exit codes, exit status consumed by a
   pipeline.
2. The PASS line can only be produced after `evidence-final.json` exists, a
   matching terminal journal event is found, and the journal has been synced.
3. All positional inputs -- architecture, candidate, hex identifiers, IPv4
   addresses, port lists -- are validated before use.
4. Shell quoting is correct wherever variables are interpolated into `ssh`,
   `sftp`, and `printf` argument lists; no value can escape its intended
   argument boundary.
5. Artifacts are write-once: a second invocation producing different content
   under the same identity must be rejected rather than overwriting. Check the
   chmod calls and the existing-directory branches.
6. `journal_append` chains each event hash to its predecessor correctly and
   syncs before the phase advances.
7. Cleanup logic is scoped to specific recorded identifiers, never broad.
8. No credential value or file content reaches a log, journal, or artifact.

## Findings and disposition

| # | Verdict | Evidence from executable code | Disposition |
| --- | --- | --- | --- |
| 1 | PASS after fix | [run-spike.sh](/Users/danielsava/work/file-parser/ploinky/container/spike/ds004-q8/run-spike.sh:486): `if ! scan_out=$(sudo -n nmap -n -Pn -sS --reason -p "22" -- "$target_ipv4" 2>&1); then`; [run-spike.sh](/Users/danielsava/work/file-parser/ploinky/container/spike/ds004-q8/run-spike.sh:504): `die_blocked "prepare: native topology/probe matrix implementation is incomplete; no success evidence written"`; [run-spike.sh](/Users/danielsava/work/file-parser/ploinky/container/spike/ds004-q8/run-spike.sh:525): `die_blocked "finalize: native cleanup/final evidence implementation is incomplete; no success evidence written"` | Fixed swallowed `nmap` failure, and changed incomplete native placeholders so they fail nonzero before writing success-shaped evidence. |
| 2 | PASS after fix | [stage-source.sh](/Users/danielsava/work/file-parser/ploinky/container/spike/ds004-q8/stage-source.sh:692): `validate_existing_file "$attempt_dir/evidence-final.json" "0400"`; [stage-source.sh](/Users/danielsava/work/file-parser/ploinky/container/spike/ds004-q8/stage-source.sh:701): `journal_require_terminal "$arch" "$manifest_sha" "$attempt_id" "finalize" "ELIGIBLE" "$final_evidence_sha"`; [run-spike.sh](/Users/danielsava/work/file-parser/ploinky/container/spike/ds004-q8/run-spike.sh:630): `journal_require_terminal "$arch" "$manifest_sha" "$attempt_id" "pass-authorization" "AUTHORIZED" \` | Fixed PASS bypasses by requiring complete local artifacts, valid final evidence JSON, an intact journal chain, a finalize predecessor, and terminal `pass-authorization` with `AUTHORIZED` verdict before PASS bytes can originate. |
| 3 | PASS after fix | [run-spike.sh](/Users/danielsava/work/file-parser/ploinky/container/spike/ds004-q8/run-spike.sh:138): `[[ "$ip" =~ ^([0-9]{1,3}\.){3}[0-9]{1,3}$ ]] || return 1`; [run-spike.sh](/Users/danielsava/work/file-parser/ploinky/container/spike/ds004-q8/run-spike.sh:153): `[[ "$list" =~ ^[0-9]+(,[0-9]+)*$ ]] || return 1`; [stage-source.sh](/Users/danielsava/work/file-parser/ploinky/container/spike/ds004-q8/stage-source.sh:363): `if [[ "$host" =~ ^[0-9.]+$ ]]; then`; [probe.py](/Users/danielsava/work/file-parser/ploinky/container/spike/ds004-q8/probe.py:89): `def parse_destination_url(destination_url):` | Fixed malformed IPv4/port-list acceptance, dotted numeric destination acceptance, unsafe probe URLs, timeout validation, and listener port binding. |
| 4 | PASS | [stage-source.sh](/Users/danielsava/work/file-parser/ploinky/container/spike/ds004-q8/stage-source.sh:390): `ssh_invoke() {`; [stage-source.sh](/Users/danielsava/work/file-parser/ploinky/container/spike/ds004-q8/stage-source.sh:401): `-T -- "$destination" "$remote_executor" < "$script_path"`; [stage-source.sh](/Users/danielsava/work/file-parser/ploinky/container/spike/ds004-q8/stage-source.sh:405): `sftp_invoke() {`; [stage-source.sh](/Users/danielsava/work/file-parser/ploinky/container/spike/ds004-q8/stage-source.sh:416): `-b "$batch_file" -- "$destination"` | SSH/SFTP values are quoted argv elements. Dynamic remote-command tokens are constrained by enum, hex, IPv4, port-list, and destination validation before use. |
| 5 | PASS after fix | [run-spike.sh](/Users/danielsava/work/file-parser/ploinky/container/spike/ds004-q8/run-spike.sh:422): `if ln "$tmp" "$path" 2>/dev/null; then`; [run-spike.sh](/Users/danielsava/work/file-parser/ploinky/container/spike/ds004-q8/run-spike.sh:427): `if cmp -s "$tmp" "$path"; then`; [stage-source.sh](/Users/danielsava/work/file-parser/ploinky/container/spike/ds004-q8/stage-source.sh:473): `if mkdir "$receipt_dir" 2>/dev/null; then`; [stage-source.sh](/Users/danielsava/work/file-parser/ploinky/container/spike/ds004-q8/stage-source.sh:592): `if mkdir "$dest_dir" 2>/dev/null; then` | Fixed write-once gaps by validating existing attempt-file mode/owner, publishing GREEN/source identities with exclusive directories, and validating existing GREEN/source package bytes, hashes, modes, and ownership. |
| 6 | PASS after fix | [run-spike.sh](/Users/danielsava/work/file-parser/ploinky/container/spike/ds004-q8/run-spike.sh:280): `fcntl.flock(lock_fd, fcntl.LOCK_EX)`; [run-spike.sh](/Users/danielsava/work/file-parser/ploinky/container/spike/ds004-q8/run-spike.sh:282): `if os.path.exists(jpath):`; [run-spike.sh](/Users/danielsava/work/file-parser/ploinky/container/spike/ds004-q8/run-spike.sh:295): `os.fsync(fd)`; [stage-source.sh](/Users/danielsava/work/file-parser/ploinky/container/spike/ds004-q8/stage-source.sh:233): `fcntl.flock(lock_fd, fcntl.LOCK_EX)` | Fixed journal races by moving full-chain validation, predecessor selection, append, journal fsync, and parent fsync under one Python `fcntl` lock. Existing event hashes are recomputed during validation. |
| 7 | CONCERN, reported not resolved | [run-spike.sh](/Users/danielsava/work/file-parser/ploinky/container/spike/ds004-q8/run-spike.sh:522): `# Cleanup targets only exact run-label objects and recorded PIDs after`; [run-spike.sh](/Users/danielsava/work/file-parser/ploinky/container/spike/ds004-q8/run-spike.sh:525): `die_blocked "finalize: native cleanup/final evidence implementation is incomplete; no success evidence written"` | No broad cleanup exists. Targeted native cleanup is still not implemented; finalize now fails closed instead of declaring eligibility. This remains part of the native-evidence open item. |
| 8 | PASS after fix | [probe.py](/Users/danielsava/work/file-parser/ploinky/container/spike/ds004-q8/probe.py:93): `if parts.username or parts.password:`; [probe.py](/Users/danielsava/work/file-parser/ploinky/container/spike/ds004-q8/probe.py:95): `if parts.path or parts.query or parts.fragment:`; [probe.py](/Users/danielsava/work/file-parser/ploinky/container/spike/ds004-q8/probe.py:126): `"destination_url": normalized_url,` | Fixed probe output leakage by rejecting URL userinfo, paths, queries, and fragments before any result JSON is printed, then recording only the normalized `http://<host>:<port>` form. I found no credential-file content logged or journaled. |

## Fix summary

1. Added red/green contract coverage for malformed shell inputs, terminal
   authorization, journal locking, incomplete native finalize, write-once reuse,
   unsafe probe URLs, and listener port binding.
2. Replaced command-failure swallowing and placeholder success production with
   nonzero fail-closed behavior.
3. Reworked journal append/terminal validation to recompute and serialize the
   full chain under one lock with fsync before unlock.
4. Strengthened PASS authorization to require complete artifacts, valid final
   evidence JSON, no `failure.json`, final evidence hash match, a finalize
   predecessor, and terminal `pass-authorization` / `AUTHORIZED`.
5. Hardened write-once attempt, GREEN, and source package publication/reuse.
6. Hardened Bash and Python input validation and probe credential containment.
7. Updated README wording to state that incomplete native evidence paths fail
   closed and do not write success evidence.

No mechanism other than Candidate N was added.

## Open items reported, not resolved

1. Native evidence is still not collected. I left it alone: no `DS004_*`
   coordinator inputs were set by me, no native runner was contacted, and no
   Podman/pasta evidence attempt was started. DR1 remains unresolved.
2. `pack` still bundles `HEAD` after asserting `HEAD ==
   ac39b870d990869616e4882222c78037dc11d07d`. My Review B/error-handling lens
   does not require changing that workaround: the equality check still
   terminates before bundling if the checkout is not exactly the frozen base.
   Because this work is in the `ploinky-box-v2` branch checkout at
   `b83195fd...`, I did not run `pack`; that frozen-head assertion would
   intentionally fail here without plan-owner sign-off.

## Verification

Command:

```sh
node --test tests/unit/ds004Q8SpikeContract.test.mjs
```

Raw output:

```text
▶ exact five-file S0 inventory
  ✔ all five normative paths exist (0.825209ms)
  ✔ container/spike/ds004-q8 contains exactly the four owned files (1.036291ms)
✔ exact five-file S0 inventory (2.593709ms)
▶ shell script structural contract
  ✔ run-spike.sh starts exactly with #!/usr/bin/env bash then set -euo pipefail (0.607417ms)
  ✔ stage-source.sh starts exactly with #!/usr/bin/env bash then set -euo pipefail (0.454792ms)
✔ shell script structural contract (1.16575ms)
▶ alternate-candidate mechanisms are absent (Candidate N is sole candidate)
  ✔ no source file contains "--map-host-loopback" (0.568167ms)
  ✔ no source file contains "candidate-c" (0.244542ms)
  ✔ no source file contains "Candidate C" (0.752959ms)
  ✔ no source file contains "SCM_RIGHTS" (0.221709ms)
  ✔ no source file contains "broker" (0.174709ms)
  ✔ no source file contains "source-ip-authorization" (0.202666ms)
  ✔ no source file contains "firewall substitute" (0.177917ms)
  ✔ run-spike.sh forwards exactly one TCP port value: 8081 (0.172666ms)
✔ alternate-candidate mechanisms are absent (Candidate N is sole candidate) (2.7065ms)
▶ PASS byte origination ordering
  ✔ run-spike.sh contains the sole PASS-constructing statement (0.149291ms)
  ✔ stage-source.sh never constructs PASS bytes, only validates/transports them (0.099917ms)
  ✔ probe.py never constructs PASS bytes (0.063167ms)
  ✔ exact PASS byte format is documented consistently (0.099083ms)
✔ PASS byte origination ordering (0.468458ms)
▶ SSH/SFTP trust and remote executor contract
  ✔ stage-source.sh builds the exact fixed SSH option set (0.146916ms)
  ✔ stage-source.sh builds the exact fixed SFTP option set (0.1215ms)
  ✔ stage-source.sh embeds the exact fixed remote_executor template (0.06275ms)
  ✔ stage-source.sh embeds the exact scanner executor variant (0.065292ms)
  ✔ stage-source.sh documents the exact destination grammar regex (0.0585ms)
  ✔ stage-source.sh forbids PTY/profile/ambient shortcuts (0.188583ms)
  ✔ known-hosts/identity files must be mode-0600, absolute, non-symlink, coordinator-owned (0.108625ms)
✔ SSH/SFTP trust and remote executor contract (0.825208ms)
▶ immutable artifact path templates
  ✔ stage-source.sh references every immutable artifact path template (0.126958ms)
  ✔ GREEN artifact filenames are exact (0.070084ms)
  ✔ source package filenames are exact (0.094708ms)
  ✔ frozen base SHA is embedded exactly (0.062167ms)
  ✔ journal path is exact (0.108917ms)
  ✔ phase-owned attempt filenames are exact (0.206166ms)
  ✔ journal events include prior hash and self eventSha256 (0.065833ms)
  ✔ artifact writes are write-once and never overwrite existing attempt files (0.292083ms)
  ✔ pack validates existing package payload hashes before reuse (0.140333ms)
  ✔ pack validates exact five-path git status before/after, in a mode-0700 temp dir (0.124792ms)
  ✔ GREEN and source package identity publication uses exclusive directories and full reuse validation (0.1125ms)
✔ immutable artifact path templates (1.522458ms)
▶ scanner independence contract
  ✔ run-spike.sh records host-key fingerprint, machine-identity SHA-256 (never raw machine-id), boot ID (0.147708ms)
  ✔ run-spike.sh rejects scanner/runner address, OOB, LAN, or identity collisions (0.072542ms)
  ✔ exact scanner nmap commands are embedded (0.0935ms)
  ✔ preflight scan failures are not swallowed (0.126333ms)
✔ scanner independence contract (0.492667ms)
▶ probe matrix contract
  ✔ run-spike.sh enumerates every managed and negative path ID (0.130334ms)
  ✔ probe.py implements the exact client CLI flags (0.071834ms)
  ✔ the fixed payload hex is embedded exactly (0.103416ms)
  ✔ run-spike.sh aligns fixed TCP and UDP scanner ports (0.078792ms)
  ✔ run-spike.sh runs owner-aware ss inventories (0.077167ms)
  ✔ remote phase dispatch validates hex identifiers before path construction (0.083458ms)
  ✔ live and scanner phases validate every positional network input (0.107042ms)
  ✔ malformed IPv4 and port-list values fail before scan or artifact paths can advance (20.089875ms)
  ✔ stage-source.sh rejects dotted numeric destinations that are not IPv4 addresses (0.262959ms)
✔ probe matrix contract (21.129541ms)
▶ failure taxonomy and status transitions
  ✔ all seven allowed status transitions are documented (0.220542ms)
  ✔ BLOCKED and SETUP_ERROR are distinct, both present (0.645125ms)
  ✔ candidate-N-evidenced never implies DR1 resolved (0.116708ms)
✔ failure taxonomy and status transitions (1.041542ms)
▶ dynamic fail-closed behavior
  ✔ probe.py --self-test exits 0 with no native/root dependency (597.542958ms)
  ✔ stage-source.sh install BLOCKS with empty stdout when coordinator inputs are missing (14.205375ms)
  ✔ stage-source.sh verify BLOCKS with empty stdout when coordinator inputs are missing (12.212625ms)
  ✔ stage-source.sh run BLOCKS with empty stdout (never fabricates PASS) when coordinator inputs are missing (10.39ms)
  ✔ run-spike.sh emit-pass fails closed with no PASS output when local evidence is absent (9.023625ms)
  ✔ PASS acknowledgement requires a synced pass-authorization journal event (0.359709ms)
  ✔ journal appenders serialize predecessor selection, append, and sync under one lock (0.336625ms)
  ✔ run-spike.sh emit-pass rejects forged or non-authorized terminal journal events (127.450666ms)
  ✔ incomplete native phase scaffolds fail closed instead of producing final evidence (8.584333ms)
  ✔ probe.py rejects URL credentials, paths, queries, and fragments before output capture (175.400042ms)
  ✔ probe listener modes bind the caller-requested validated port (0.278666ms)
  ✔ stage-source.sh green executes exactly the contract test itself (0.078917ms)
  ✔ stage-source.sh with an unknown verb fails closed with empty stdout (6.190708ms)
✔ dynamic fail-closed behavior (962.455625ms)
▶ README operator documentation
  ✔ README documents the nine required coordinator inputs (0.154792ms)
  ✔ README documents the decision rule: evidence never chooses the architecture (0.104875ms)
  ✔ README documents that this repo is not the sole source of authority (0.056375ms)
✔ README operator documentation (0.3645ms)
ℹ tests 66
ℹ suites 11
ℹ pass 66
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 1109.82025
```

Command:

```sh
git status --porcelain=v1 --untracked-files=all
```

Raw output:

```text
?? container/spike/ds004-q8/README.md
?? container/spike/ds004-q8/probe.py
?? container/spike/ds004-q8/run-spike.sh
?? container/spike/ds004-q8/stage-source.sh
?? tests/unit/ds004Q8SpikeContract.test.mjs
```

Additional syntax checks run after implementation:

```text
bash -n container/spike/ds004-q8/run-spike.sh
bash -n container/spike/ds004-q8/stage-source.sh
python3 -m py_compile container/spike/ds004-q8/probe.py
```

All three exited 0 with empty output. The Python check created a temporary
`__pycache__` directory; I removed only that generated file and directory before
the final required verification above, restoring the exact four-file directory
inventory.
