# Adversarial Review — Ploinky Box Edge Routing and Publication Design

**Subject:** `ploinky/docs/superpowers/specs/2026-07-15-ploinky-box-edge-routing-and-publication-design.md`
**Review date:** 15 July 2026
**Workspace:** `/Users/danielsava/work/file-parser` (read-only; working trees incl. uncommitted changes)
**Requirement under test:** exactly two physical-host publications per box — `127.0.0.1:<routerHostPort> -> 8080/tcp` and `0.0.0.0:7882 -> 7882/udp`; all HTTP/SSE/WS through RoutingServer; LiveKit media the only direct inbound UDP.

---

## Verdict: **PASS WITH REQUIRED CHANGES**

The target architecture is technically achievable, internally consistent, and correctly grounded in the current code. The two-port boundary is real: I confirmed there is exactly **one** outer `-p` injection site in the whole runtime (`buildRuntimeRunArgs`, `ploinky/container/runtime-contract.mjs:755-767`), fed only by `routerPublish` + `extraPublishes`. A wrapper that hardcodes the two mappings and never populates `generatedPublishes`/`invocation.publish` will emit exactly two outer mappings. The design's reading of the current policy engine (mtime:size caches, rank-aggregation-before-public-write-guard, first-prefix-match dispatch vs. aggregate policy, secondary-server policy bypass) is **accurate** — I verified each claim against the code.

It is not implementation-ready as written. Two findings are build-level blockers (P1), and seven are material scope/accuracy gaps (P2) where the "slim, mostly-deletion" framing understates new mechanism, mis-states current behavior, or removes a current capability. None is fatal; all are correctable without abandoning the target. The single highest-risk item is empirical, not architectural: physical→box UDP source-address fidelity for WebRTC cannot be proven from code and must pass a two-browser media smoke before adoption (this matches the prior gateway-removal review's hard gate).

Evidence classes below: **Observed** (read this session, cited `path:line`), **Delegated** (subagent-reported with quoted evidence; spot-checked), **Inferred**, **External** (official docs).

---

## Findings

### P1 — Blocking

#### P1-1 — After deleting the publish planner, nothing constructs the fixed `7882/udp` outer mapping

- **Failure scenario:** The hard cut deletes `box-publish-planner.mjs` / `boxStartPublishPlan.js` (design §5.1). Today the **only** producers of an outer `extraPublish` are `invocation.publish` (explicit `--publish`, which §5.1/D29 also rejects) and planner `generatedPublishes`. With both gone, `createDefaultRuntimeConfig` builds `extraPublishes: (invocation.publish || []).map(...)` = `[]`, so the box comes up with **only** the router TCP mapping. The invariant "always two mappings" silently degrades to one, and LiveKit media has no host ingress.
- **Evidence (Observed):** `ploinky/container/runtime-contract.mjs:601` (`extraPublishes: (invocation.publish || []).map(normalizePublishSpec)`), `:679-690` (extraPublishes = explicit publish + planner generatedPublishes only), `:755-767` (sole outer `-p` site). No fixed-UDP literal exists anywhere in `createDefaultRuntimeConfig`/`mergeDesiredRuntimeConfig`.
- **Affected section:** §5.1 (framed as deletion + "validate the exact two mappings"); acceptance test §17.1 "Fixed outer mapping" asserts the wrapper "independently emits … `0.0.0.0:7882:7882/udp`" but no code produces it.
- **Why it violates:** The core requirement (2 mappings, UDP always reserved) depends on new construction code the design describes only as deletion + validation.
- **Smallest correction:** Add a hardcoded `udpReservation` to `createDefaultRuntimeConfig`/`mergeDesiredRuntimeConfig` (sibling to `routerPublish`): `{ hostIp: '0.0.0.0', hostPort: '7882', containerPort: '7882', protocol: 'udp' }`, emitted unconditionally and excluded from the `--publish`/`--expose` rejection path. State it as new code, not a deletion side-effect. (The UDP protocol path is already expressible — `publish-spec.mjs` + `buildRuntimeRunArgs` handle `/udp` — so only the injector is missing.)

#### P1-2 — The deletion boundary is incomplete; a literal hard cut breaks the CLI build and a fail-closed gate

- **Failure scenario:** §5.1 enumerates four files plus prose ("their supervisor call sites, … the inner launcher's imports of `implicitAgentServerBoxPort` and outer-publication coverage assertions"). At least eight importers/callers and one fail-closed `die()` gate are not covered; deleting the four modules leaves dangling imports and the `ploinky start/enable/cli/shell` paths throw at load.
- **Evidence (Delegated, quoted with `path:line`):**
  - `ploinky/cli/services/workspaceUtil.js` imports `preflightBoxPublicationForCommand` (:32) and calls it at :733/:1427/:1455/:1521.
  - `ploinky/cli/commands/cli.js` imports (:78) and calls (:249/:257).
  - `ploinky/cli/server/authHandlers/marketplaceRoutes.js` imports (:10), calls (:73/:80).
  - `ploinky/cli/services/agents.js` uses `assertOuterPublicationCoverageForManifest` (:285) — a coverage assertion **not** in the "inner launcher."
  - `ploinky/cli/services/docker/common.js` defines the whole coverage machinery (`parseOuterPublicationContract`, `assertOuterPublicationCoverageForClaims/ForManifest`, `OUTER_PUBLICATION_CONTRACT_ENV`), re-exported by `docker/index.js:38`.
  - `ploinky/cli/server/containerMonitor.js:545` handles `PLOINKY_OUTER_PUBLICATION_REQUIRED` (dead branch after removal).
  - `ploinky/container/runtime-supervisor.mjs:1080-1088` reads `PUBLISH_PLAN_VERSION_LABEL` and `die()`s if it ≠ `REQUIRED_PUBLISH_PLAN_VERSION`; existing contract-version-2 boxes need a destroy/recreate path, not a silent read.
  - Tests bound to the deleted modules: `tests/unit/{boxPublishPlanner,boxStartPublishPlan,boxStartPublishPlanLock,outerPublicationCoverage,workspaceDependencyGraph}.test.mjs`, `container/runtime-supervisor-tests.mjs`, `tests/helpers/runtimeSupervisorHarness.mjs`.
- **Affected section:** §5.1, §18 (documentation-ownership map).
- **Why it violates:** "Clean hard cut" that does not compile/run is not implementable; the coverage-assertion removal is broader than the planner-file removal.
- **Smallest correction:** Expand the deletion inventory to the full importer set above; remove the coverage machinery in `docker/common.js` + `docker/index.js` + `agents.js` + `containerMonitor.js`; replace the `PUBLISH_PLAN_VERSION_LABEL` `die()` with the contract-4 destroy/recreate path already used for other contract mismatches; delete/rewrite the six test files. (Also: `profileServerProxy.js` + `extractProfileServerHostAgentName` in `RoutingServer.js:168-179` must go with `additionalServerPort` — see P2-1.)

---

### P2 — Material scope / accuracy gaps

#### P2-1 — `httpServices[].port` + the per-service private target registry is a substantial new runtime mechanism, not a one-field addition

- **Scenario:** D04 frames the change as "the missing fact is its private target port." Today a route resolves to a **single** `route.hostPort`; every `httpServices` entry proxies to that same port, and `normalizeServiceSpec` neither parses nor returns a `port`.
- **Evidence (Observed):** `httpServiceRoutes.js:260-272` (`normalizeServiceSpec` return object has no `port` and no `slug`), `routerHandlers.js:432-433,501` (`proxyHttpPassthrough(req,res,route.hostPort,…)` — single target), `routingFile.js` route shape = `{…, hostPort?, additionalServerPort? }` (one primary + one secondary). The design's §7.1 `{containerPort, url}` per-service registry, engine-assigned box-loopback ephemeral mapping per distinct port, and its recording in routing state **do not exist**.
- **Correction:** Keep the schema field, but state honestly that it requires (a) manifest parse for `port`, (b) the inner launcher creating N ephemeral box-loopback mappings per agent, (c) a routing-state schema extension to a per-service target map, and (d) a RoutingServer target-resolution rewrite. Also note §6.2's own dependency: `normalizeServiceSpec` must be extended to **retain** the normalized slug — verified dropped today at `httpServiceRoutes.js:260-272`.

#### P2-2 — TURN broker reuses the identity *primitive* but needs a new endpoint, a non-agent assertion-target binding, and a webmeetAgent client rewrite

- **Scenario:** §9.3/D32 mint short-lived TURN creds from a router broker authenticated by "the existing signed agent-to-router identity" + `credentialConsumers`. The router **can** authenticate an exact caller, but only via assertions that **require an agent target**; there is no generic agent→router-owned-endpoint path, and the current browser-facing credential path uses **static long-term** TURN creds.
- **Evidence (Delegated, quoted):** `cli/server/security/tokens/AgentAssertionService.js:85-97` returns `callerPrincipal` (exact-agent ACL enforceable in principle); `:34-63` `validatePayload` requires `payload.targetAgent` to match an agent id; verify call-sites are only MCP/OpenAI-delegation/discovery — no router-owned-endpoint handler. Client side (Observed/Delegated): `AssistOSExplorer/webmeetAgent/lib/store/rtcConfig.mjs:59-73` emits `turn:<host>:3478?transport=udp|tcp` to the browser; `lib/webmeetStore.mjs:278-285` reads static `WEBMEET_TURN_USER`/`WEBMEET_TURN_PASSWORD`.
- **Correction:** Enumerate the new pieces: a router broker route, an assertion-target binding convention for a router-owned (non-agent) target, the `credentialConsumers` ACL check, **and** replacing webmeetAgent's static-credential emission with a per-join broker call. This is cross-repo (ploinky + AssistOSExplorer) work D18/D32 gesture at but do not scope.

#### P2-3 — LiveKit media-candidate model contradicts current prod and depends on config-generation changes

- **Scenario:** §6.6/§9.2 mandate `use_external_ip: false` + operator `media.publicIPv4` (as `rtc.node_ip`) universally. Current **prod** uses `use_external_ip: true` and **suppresses** `node_ip`; only default/dev use `false` + auto-detected `node_ip`. The generator writes `node_ip` only when `use_external_ip != "true"`.
- **Evidence (Delegated, quoted; External-confirmed):** `webmeetInfra/liveKitServerAgent/scripts/hooks/preinstall.sh:206-220` (writes `tcp_port`, `port_range_start/end`, `use_external_ip`, conditional `node_ip`; **no** `udp_port`, **no** `turn:` block), `:167-177` (prod flips `use_external_ip=true`). External: LiveKit docs confirm the UDP mux (`rtc.udp_port`, "when set, `rtc.port_range_start/end` are not used") and `TCPPort: 7881` default (v1.11.0 `pkg/config/config.go`: `TCPPort: 7881`, `UseExternalIP: false`, `TURN.Enabled: false`).
- **Correction:** State that config generation must change (write `udp_port`, drop the range, force `node_ip` from `media.publicIPv4`, stop the prod `use_external_ip=true` branch), and that single-candidate advertisement is fragile under NAT hairpin/CGNAT — which is exactly why external TURN + external media probe (D28) are mandatory. Minor: the claim "LiveKit **requires** the range not be set" is slightly stronger than the docs ("not used"/ignored); and `tcp_port: 0` disabling ICE/TCP is a reasonable convention but was **not** doc-confirmed — verify at runtime (default 7881 is confirmed).

#### P2-4 — web-publishing removal drops LAN HTTP publication and the no-Cloudflare mode, and under-covers internal-URL/tunnel-creation transfer

- **Scenario:** The box contract has only loopback TCP + public UDP; public HTTP **requires** Cloudflare (mode table §5.2). Today web-publishing supports (a) a `lan` profile publishing nginx on `0.0.0.0:8081`, (b) a default `nginx`-only mode with no Cloudflare, and (c) generation of **internal** `host.containers.internal:<port>` URLs consumed by other agents.
- **Evidence (Delegated, quoted):** `basic/web-publishing/manifest.json:58-60` (loopback 8081) and `:114-117` (`lan`: `0.0.0.0:8081`); `lib/routes.mjs:279-297` generates `ONLYOFFICE_INTERNAL_URL`, `ONLYOFFICE_CALLBACK_BASE_URL`, `WEBMEET_LIVEKIT_URL`, `WEBMEET_LIVEKIT_UPSTREAM` (internal URLs) and creates tunnels from an API token (`config_src:'cloudflare'`). The topology snapshot **excludes** raw ports/internal URLs (design §8.5, lines ~1116-1117), so these are obsoleted-by-routing, requiring consumer rewrites in `AssistOSExplorer/onlyOffice/scripts/hooks/preinstall.sh:92-94` and the webmeet start scripts — larger than the single "URLs→snapshot" transfer row implies.
- **Correction:** Either declare LAN/non-Cloudflare HTTP explicitly out of scope (a capability removal, not a transfer), or add a mode for it. Expand the transfer table to name: internal-URL consumers (per-agent script rewrites), TURN/TLS/cert vars (dropped, not moved), and tunnel-creation-from-API-token (bootstrap path lost). Purge the legacy `sensitive` `WEB_PUBLISHING_CLOUDFLARED_TUNNEL_TOKEN` `providesConfig` output and the unencrypted `secret-state.json`.

#### P2-5 — Topology snapshot, `PLOINKY_EDGE_TOPOLOGY_FILE`, and "restart every enabled agent in dependency order" are three mechanisms that do not exist

- **Scenario:** §8.5/D31 depend on a versioned box-owned snapshot bind-mounted RO into all agents, a reserved env pointer, and a fleet-restart primitive on config revision.
- **Evidence (Delegated, quoted):** `rg PLOINKY_EDGE_TOPOLOGY` → none; dependency-ordered **start** exists (`workspaceDependencyGraph.js:443-470` waves), but restart is per-container crash/liveness only (`containerMonitor.js:505-508`); `configProviders` inject **secrets/env**, not files (`startupConfigProviders.js:331-338`). The RO-mount-into-every-agent pattern has precedent (`agentServiceManager.js:626` `/Agent:…:ro`).
- **Assessment:** No bootstrap **cycle** — the phased "write reconciling snapshot before targets exist → resolve private targets after containers exist → activate URLs only after readiness/probes" (§8.5) correctly breaks the chicken/egg, and excluding readiness state from the revision digest correctly avoids a restart loop. The real cost is full-stack downtime on every hostname/media/TURN edit (design acknowledges §16).
- **Correction:** Label these as new mechanisms with the fleet-restart primitive as net-new; keep the phased ordering; keep readiness out of the revision hash.

#### P2-6 — Physical→box UDP source-address fidelity for WebRTC is unproven and is the highest-risk assumption

- **Scenario:** LiveKit (inner host-mode, box namespace) binds `7882/udp`; the outer engine maps physical `0.0.0.0:7882/udp` → box. WebRTC SRTP requires the SFU's server-initiated downlink to carry the correct source address through that NAT hop. The prior gateway-removal review and the design's own memory note flag pasta/netavark UDP source-address behavior across the box boundary as unverified.
- **Evidence (Delegated):** `webmeetInfra/.../DS002-livekit-server-agent.md:171-183` documents that bridge-mode UDP rewrote SRTP downlink source to a bridge-local IP and receivers dropped it — the reason prod already uses host networking. Nesting adds one more hop (physical→box).
- **Correction:** Gate adoption on a real two-browser cross-network media smoke (native amd64 + arm64, recorded Podman/Netavark/Aardvark versions) proving the advertised `7882/udp` candidate carries bidirectional media through the box. This is D28's external probe made a **release gate**, not just a readiness check.

#### P2-7 — Umami 3001 telemetry proxy is unbuilt and reverses a documented decision; OnlyOffice editor is not router-reached today

- **Scenario / Evidence (Delegated, quoted):**
  - Umami: no `3001` listener exists; the current manifest uses `additionalServerPort: "3000"` and the tracker points browsers **directly** at Umami `/script.js` (`UmamiAgent/umamiAgent/IDE-plugins/umami-settings/umami-settings.js:156-166`, default `http://127.0.0.1:3000`). `DS01-umami-agent.md:74-77` explicitly **rejected** an ingestion path through the agent — §6.7 reverses it. The design also admits the two flags don't strip `Cookie`/`Authorization` and a guest session cookie is still set.
  - OnlyOffice: the editor plane is reached today via **openPorts** (`AssistOSExplorer/onlyOffice/manifest.json:120-123` = `127.0.0.1:17002:7000`, `127.0.0.1:8082:8080`) → web-publishing nginx → host `:8082`, **not** via the router and **not** via `additionalServerPort` (absent from the manifest). The design's current-state evidence (§3.1 line 98, §3.3) attributing OnlyOffice's editor to `additionalServerPort` is **factually wrong**; only GPTResearcher and Umami use `additionalServerPort`.
- **Correction:** Fix the current-state evidence (OnlyOffice editor = openPorts + nginx, not additionalServerPort); acknowledge that routing the editor + `/doc/*` WS + versioned DocumentServer assets through RoutingServer is net-new behavior (the `X-Forwarded-Host`/`Proto` synthesis in §10 is the right control — keep it). For Umami, mark the 3001 proxy as new/unbuilt and note the DS01 reversal.

---

### P3 — Minor

- **OnlyOffice proxy blocklist wording:** the proxy blocks `/example/`, not `/demo/`; design §10 text says "demo." Evidence: `onlyOffice/src/proxy/editor-proxy.mjs:1-13`.
- **cloudflared origin hardcodes `8080`:** `basic/cloudflared/lib/routes.mjs:6-19` and the web-publishing child pin `host.containers.internal:8080`; a non-default router port breaks it (prior review F-06). The design's `127.0.0.1:8080` origin must be **generated** from the configured port.
- **`--token-file` minimum version** (`2025.4.0`, §8.1) and **`--port` disposition** (rejected flags are `--publish/--expose/--listen-lan` but `--port` still flows to `routerPublish.hostPort` at `runtime-contract.mjs:668`) — state `--port`'s status explicitly under the fixed-mapping contract.

---

## Invariant matrix

| Invariant | Verdict | Basis |
| --- | --- | --- |
| Exactly two outer mappings | **Proven (achievable)** — needs P1-1 fix | Single outer `-p` site `runtime-contract.mjs:755-767`; UDP producer missing today |
| Outer wrapper independent of graph/manifests | **Proven (achievable)** | `-p` site consumes only invocation fields; planner is separable (P1-2 lists what to delete) |
| No extra agent HTTP publication | **Proven** | Inner mappings stay box-side (`agentServiceManager.js` inner `-p`); only routerPublish+extraPublishes go outer |
| One fixed LiveKit UDP mux | **Proven valid** (External) | LiveKit docs: `rtc.udp_port` mux, range ignored; `tcp_port:0` disable = **Uncertain** (default 7881 confirmed) |
| External TURN sufficient for fallback | **Uncertain** | Requires external provider + new broker + webmeetAgent rewrite (P2-2); not provable from repo |
| OnlyOffice works through routed HTTP/WS only | **Uncertain** | Editor today = nginx→host `:8082`, not router (P2-7); router path plausible (WS proxy exists) but unproven for pinned-version asset set |
| Hostname selection does not bypass policy | **Proven (design)** | Host = transport only; `HttpRouteAccessPolicy.evaluate` still runs; current httpServices path already evaluates policy for HTTP **and** WS (`wsServiceProxy.js:48-54`) |
| local-only / publication-error semantics | **Proven (design)** | Fail-closed, no auto-fallback (D11/D12); consistent and sound |
| Manifests remain slim | **Proven (schema)** / caveat | One new field `httpServices[].port`; but "slim" hides runtime mechanism (P2-1) and a new agent-owned Umami proxy (P2-7) |
| Removal of web-publishing complete | **Violated** | LAN publication, no-Cloudflare mode, internal-URL generation, tunnel creation, consumer rewrites under-covered (P2-4) |

---

## Current-vs-target port inventory (transitive Explorer closure — 22 agents)

Closure independently verified complete at 22 nodes. `impl-7000` = implicit AgentServer publish `127.0.0.1:<hash>:7000`. "internal" = container-loopback, not host-published.

| Agent | Current listeners (how) | Current outer exposure | Target disposition | Target outer |
| --- | --- | --- | --- | --- |
| explorer (static) | 7000 (impl) | impl-7000 loopback | router/AgentServer | none |
| gitAgent, dpuAgent, soplangAgent, tasksAgent, achilles-cli, opencodeAgent, piAgent, codexAgent, multimedia, webAssist | 7000 (impl) | impl-7000 loopback | router/AgentServer | none |
| soul-gateway | 7000 own server + httpServices | impl-7000 | httpServices (unchanged) | none |
| GPTResearcher | 7000 + **8000** (additionalServerPort) | impl-7000 + 8000 loopback | `httpServices[].port:8000` | none |
| searchAgent | 7000 + 8888 + 8890 (internal) | impl-7000 | AgentServer; support private | none |
| default-local-llm | 7000 + 8080 llama (internal) | impl-7000 | AgentServer; llama private | none |
| webmeetAgent | 7000 (impl; **prod openPorts 17001:7000**) | impl-7000 (prod 17001) | router/AgentServer; drop 17001 | none |
| **webtty** | **7681** (start-only, openPorts `127.0.0.1:7681`) | 7681 loopback | `httpServices[].port:7681` authenticated | none |
| **webmeetStt** | **9000** (start-only, openPorts `127.0.0.1:19000:9000`) — **orphaned, no consumer** | 19000 loopback | private; removal is a product decision | none |
| **onlyOffice** | 7000 control (0.0.0.0) + 8080 editor (0.0.0.0) + 9100 storage (lo) + 80 DS (lo); openPorts `17002:7000`,`8082:8080` | 17002 + 8082 loopback (editor via nginx) | control+editor = two httpServices ports; storage/DS process-local | none |
| **Umami** | 7000 (impl) + 3000 app (additionalServerPort) + 5432 pg (lo) + 7301 mcp (lo) | impl-7000 + 3000 loopback | dashboard `:3000` auth + **new** telemetry proxy `:3001` guest | none |
| **LiveKit** (webmeetInfra) | health 17000, signal 7880, ICE/TCP 7881, UDP 7882-7892, egress 7980, redis 6379, coturn 3478 tcp+udp, relay 20000-20010; **prod +80/+443, host net**; dev renumbered 17xxx | **~30 host bindings** incl. UDP ranges + 3478 + relay + prod 80/443 | signal routed; **one UDP mux 7882**; health/egress/redis private; delete ICE/TCP, range, Coturn, nginx/certbot, 80/443 | **`7882/udp`** |
| **web-publishing** | nginx 8081 + 7000 (impl; has both start+agent) + cloudflared (outbound) | 8081 loopback (lan: 0.0.0.0) + impl-7000 | **deleted**; responsibilities → box image + core | none |

Notes: LiveKit and web-publishing are `agent`-mode today, so the box planner would synthesize a phantom `:7000` publish even though LiveKit runs no AgentServer — the design's D19 (`start`, not `agent`) fixes this and must actually change the command type. Three start-only agents (webtty, onlyOffice, webmeetStt) escape impl-7000 today.

---

## Request / media flow (target)

- **HTTP/SSE/WS:** browser → Cloudflare → `cloudflared` (in box) → RoutingServer `127.0.0.1:8080` → exact-host match → enabled agent root **or** `httpServices` entry → `HttpRouteAccessPolicy.evaluate({pathname,method,routeKey})` (`HttpRouteAccessPolicy.js:97-115`) → access executor (`ensureHttpRouteAccess` `authContext.js:444-467`) → strip client identity headers (`stripRouterIdentityHeaders`) → mint signed identity/delegation (`buildHttpServiceAuthInfoHeader` `routerHandlers.js:367-416`) → resolve per-service private target (**new registry**) → proxy. WS uses the same resolver (`wsServiceProxy.js:40-87`). **Verified parity exists today** for httpServices HTTP+WS; the secondary/profileServer path (`RoutingServer.js:386-392` → `ensureAuthenticated`) is the divergence the design deletes.
- **LiveKit signaling:** `wss://meet.example.com/…` → Cloudflare → cloudflared → RoutingServer → `httpService:"livekit-signal"` → box-loopback `7880`. Room JWT (minted by webmeetAgent, `livekitRuntime.mjs`) authorizes; Ploinky cookies not forwarded.
- **LiveKit media:** browser → physical `0.0.0.0:7882/udp` → box (`-p`) → LiveKit host-mode bind in box namespace. Advertised candidate = `media.publicIPv4:7882` via `rtc.node_ip`. **Unproven NAT hop (P2-6).**
- **TURN:** browser → external TURN (UDP/TLS) → LiveKit media; short-lived creds from the **new** router broker via `PLOINKY_ROUTER_URL` + `credentialEndpoint`.
- **OnlyOffice:** editor `https://office.example.com` → router → `onlyoffice-editor` httpService `:8080` proxy (version-pinned allowlist, `/doc/*` WS, `X-Forwarded-Host/Proto` synthesized) → embedded DS `:80`; storage/callback `:9100` stays container-loopback with opaque expiring tokens (`storage.mjs:86-101`, `control.mjs:85-87`) — **not** derived from public URL (verified correct).

---

## Missing / inadequate acceptance tests

1. **Two-browser cross-network WebRTC media smoke** through the physical→box UDP hop (native amd64+arm64; record Podman/Netavark/Aardvark) — the load-bearing gate (P2-6). §17.4 "Direct UDP" assumes an external runner but is not tied to the box-boundary NAT proof.
2. **Fixed-UDP-without-LiveKit** test: box with LiveKit absent still binds `7882/udp` and drops packets (asserts P1-1's new injector, not the deleted planner).
3. **Build/lint gate after the hard cut**: `node --test` over the full ploinky suite proving no dangling import of the deleted modules (P1-2), plus a contract-version-mismatch destroy/recreate test replacing the `die()` gate.
4. **LiveKit effective-config resolution** for every selectable profile: `udp_port:7882`, `tcp_port:0`, no range, `node_ip=media.publicIPv4`, `network.mode:host` — including the case where a profile omits `network` and must inherit root host mode (`networkContract.js:80-81`).
5. **TURN broker ACL**: exact-agent allow, wildcard/omitted/spoofed deny, browser deny, long-term secret absent from agent env — requires the new non-agent assertion-target binding to exist first.
6. **OnlyOffice editor end-to-end through the router** (not nginx): `api.js`, versioned assets, `/cache/files/*`, `/doc/*` WS, negative surfaces (`/example/`, `/healthcheck`, CommandService, ConvertService) — the current allowlist is proxy-side; re-prove it through RoutingServer.
7. **Policy stale-race** (authorization-to-dial): the design's lease is untested against the current "evaluate at `RoutingServer.js:386-392`, dial later" gap.

---

## Decision disposition

**Keep unchanged (well-reasoned, code-supported):**
- One outer `-p` site → two-mapping target is genuinely achievable (D02, D08).
- Route all HTTP/SSE/WS through RoutingServer; WS/HTTP parity already exists for httpServices (D03).
- Reuse `httpServices` access model; keep policy in manifests for now (D04, D06, D07).
- Fail-closed Cloudflare modes, no auto-fallback (D11, D12); scoped API token required (D13).
- Host-network LiveKit into the box namespace as the UDP handoff (D08) — correct given DS002's bridge-SRTP finding.
- External TURN over same-box Coturn (D18) and `start`-not-`agent` for LiveKit (D19).
- Content-addressed policy snapshot **core** (digest replacing mtime:size) and fail-closed-on-unreadable — justified; mtime:size collisions are real (`HttpRouteProviders.js:105`).
- Non-secret topology snapshot with phased activation (D31) — no bootstrap cycle.

**Revise:**
- §5.1 acceptance framing → add the fixed-UDP **constructor** (P1-1) and the full deletion set incl. coverage machinery + `die()` gate (P1-2).
- §3.1/§3.3 current-state evidence → OnlyOffice editor is openPorts+nginx, not additionalServerPort (P2-7).
- §6.6/§9.2 LiveKit → reconcile with current prod `use_external_ip:true`; specify config-generation changes (P2-3).
- §9.3 TURN broker → enumerate the new endpoint, non-agent assertion binding, and webmeetAgent client rewrite (P2-2).
- §12 web-publishing transfer table → cover LAN/no-Cloudflare, internal URLs, TURN/cert vars, tunnel creation, consumer script rewrites (P2-4).
- Consider whether the **full** durable-epoch + bounded-rehash + lease (§7.3, D30) is warranted vs. a single-writer in-process policy version checked at dial time. The lease closes a real TOCTOU; the durable epoch + periodic full rehash is only needed because human out-of-band file edits are assumed. If all policy writes route through the router process, the simpler counter gives the same authorization-to-dial guarantee — the heavier machinery buys only host-side-edit detection, at real per-request cost. Recommend: keep content-digest + fail-closed; make the durable-epoch/rehash optional and justified by the out-of-band-edit threat, not default.

**Unresolved from repo / primary docs (needs runtime or product decision):**
- Physical→box UDP source-address fidelity for SRTP (empirical; P2-6).
- `rtc.tcp_port: 0` actually disabling ICE/TCP in v1.11.0 (default 7881 confirmed; disable-by-0 not doc-confirmed).
- webmeetStt disposition — orphaned (no consumer found); keep-private vs. delete is a product call.
- Whether any external consumer depends on the removed network-status `gateway` field or web-publishing behavior (unprovable from repo).
- `cloudflared --token-file` `2025.4.0` minimum and multi-arch availability in the box base image (doc claim; verify at build).

---

*Read-only review. No source, resource, container, or config was modified. This markdown is the only deliverable. The advisor/second-model pass was unavailable this session; six read-only subagents supplied delegated evidence (each quoted with `path:line`), and load-bearing citations were spot-checked against the files directly.*
