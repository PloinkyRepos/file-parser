# Evidence Dossier — Ploinky Box Edge Routing & Publication Design Review

Companion to `REVIEW_FINDINGS_2026-07-15-box-edge-routing-design.md` (the verdict + findings).
This file preserves the full underlying evidence behind every finding, organized by subsystem.

**Design under review:** `ploinky/docs/superpowers/specs/2026-07-15-ploinky-box-edge-routing-and-publication-design.md` (1604 lines)
**Method:** read-only. Six read-only subagents supplied delegated evidence (each `path:line`-quoted); the main reviewer read the outer-publication and router/policy code directly and spot-checked delegated citations. Advisor/second-model pass unavailable this session. All paths absolute-rooted at `/Users/danielsava/work/file-parser/`.

Evidence classes: **Observed** (reviewer read directly), **Delegated** (subagent-reported, quoted), **Inferred**, **External** (official docs).

---

## 1. Outer-box publication flow (deletion boundary)

### 1.1 The single outer `-p` site — Observed
`ploinky/container/runtime-contract.mjs:755-767` (`buildRuntimeRunArgs`) is the **only** code that pushes `-p` onto the outer box engine run args:
```
const rawExtraPublishes = config[RAW_EXTRA_PUBLISH_SPECS] || new Map();
const publishes = [
    ...(config.routerPublish ? [{ publish: config.routerPublish, rawSpec: '' }] : []),
    ...config.extraPublishes.map(publish => ({ publish, rawSpec: rawExtraPublishes.get(publishIdentity(publish)) })),
];
for (const { publish, rawSpec } of publishes) { args.push('-p', rawSpec || publishSpec(publish)); }
```
Called only from the outer create path (`runtime-supervisor.mjs:1654`) and outer replace path (`:1762-1764`). Repo-wide `-p` grep elsewhere hits only INNER agent containers (`agentServiceManager.js:966`), `--parameters`, `ps -p`, `mkdir -p`.

`routerPublish` / `extraPublishes` built in `createDefaultRuntimeConfig` (`runtime-contract.mjs:595-621`):
```
routerPublish: { hostIp: invocation.listenLan ? '0.0.0.0' : '127.0.0.1', hostPort, containerPort: String(BOX_ROUTER_PORT), protocol: 'tcp' },
extraPublishes: (invocation.publish || []).map(normalizePublishSpec),
```
and reconciled in `mergeDesiredRuntimeConfig` (`:679-690`), folding planner `generatedPublishes` into `extraPublishes`.

**Conclusion:** two-mapping target is architecturally achievable — no hidden outer-mapping path competes with this site. (Basis for the PASS.)

### 1.2 The four deletion-target modules — Delegated
- `container/box-publish-planner.mjs` — pure planner + `implicitAgentServerBoxPort(instanceKey)` (sha256→`[20000,59999]`, `:11-16`). `collectManifestClaims` turns node `openPorts` (+ synthesized `127.0.0.1:<port>:7000` when `implicitAgentServer` and default/bridge) into box/host claims; rejects `none`-mode openPorts.
- `container/box-start-publish-plan.mjs` — 46-line stdin/stdout JSON entry run inside the box.
- `cli/services/boxStartPublishPlan.js` — authoritative workspace-aware planner: reads `.ploinky/agents.json` (`:568-575`), `.ploinky/profile` (`:577-583`), resolves the dependency graph, serializes nodes (manifest `openPorts` via `effectiveProfileConfig` `:666`, `implicitAgentServerPort` `:671`), calls `planBoxPublishes` (`:138-142`).
- `cli/services/boxPublicationCoverage.js` — `preflightBoxPublicationForCommand` (for `start|enable|cli|shell|restart|reinstall`) builds a planner request, runs the plan, asserts `assertOuterPublicationCoverageForClaims` (`:27-33`).

### 1.3 Deletion set is incomplete (P1-2) — Delegated
Importers/callers **not** named in §5.1 that break on a literal cut:
| Site | Evidence |
| --- | --- |
| `cli/services/workspaceUtil.js` | import `:32`; calls `:733,:1427,:1455,:1521` |
| `cli/commands/cli.js` | import `:78`; calls `:249,:257` |
| `cli/server/authHandlers/marketplaceRoutes.js` | import `:10`; calls `:73,:80`; err handling `:332` |
| `cli/services/agents.js` | `assertOuterPublicationCoverageForManifest` `:285` (a coverage assertion, NOT the inner launcher) |
| `cli/services/docker/common.js` | defines the coverage machinery `:450-616,:760`; `OUTER_PUBLICATION_CONTRACT_ENV` |
| `cli/services/docker/index.js:38` | re-exports `assertOuterPublicationCoverageForManifest` |
| `cli/services/docker/agentServiceManager.js` | imports `:18-19,:102`; coverage calls `:680,:1428,:1470`; box-port use `:1469,:1613` |
| `container/runtime-supervisor.mjs` | `publicationContractForPlan` `:1020`, env inject `:1986-1990` (`PLOINKY_OUTER_PUBLICATION_CONTRACT`) |
| `cli/server/containerMonitor.js:545` | handles `PLOINKY_OUTER_PUBLICATION_REQUIRED` (dead branch) |
| Fail-closed gate | `runtime-supervisor.mjs:1080-1088` `die()` on `PUBLISH_PLAN_VERSION_LABEL !== REQUIRED_PUBLISH_PLAN_VERSION` |
| Tests | `tests/unit/{boxPublishPlanner,boxStartPublishPlan,boxStartPublishPlanLock,outerPublicationCoverage,workspaceDependencyGraph}.test.mjs`, `container/runtime-supervisor-tests.mjs`, `tests/helpers/runtimeSupervisorHarness.mjs` |

### 1.4 The fixed UDP mapping has no producer after deletion (P1-1) — Observed + Inferred
`createDefaultRuntimeConfig:601` = `extraPublishes: (invocation.publish || []).map(...)`. The only current producers of an outer `extraPublish` are (a) explicit `--publish/--expose` (which §5.1/D29 reject) and (b) planner `generatedPublishes` (deleted). No fixed-UDP literal exists. **The "always two mappings" invariant requires new construction code**, not just deletion. The UDP protocol path *is* expressible today (`--publish 127.0.0.1:9000:9000/udp` exercised at `runtime-supervisor-tests.mjs:179-184`; `publish-spec.mjs` handles `/udp`) — only the injector is missing.

### 1.5 `additionalServerPort` = inner ephemeral, never outer — Delegated
`cli/services/profileServer.js:81-95` resolves it to `127.0.0.1::<containerPort>` (host-port 0, engine-assigned) — inner only. Manifests using it (workspace-wide): **only** `UmamiAgent/umamiAgent` and `AchillesCLI/GPTResearcher`. Manifests using `openPorts`: `AssistOSExplorer/{onlyOffice,webmeetAgent,webmeetStt}`, `basic/{web-publishing,webtty}`, `webmeetInfra/liveKitServerAgent`, `ploinky/tests/testAgent`, `llm-runtime/*`.

### 1.6 `openPorts` → inner AND outer today — Delegated
Inner: `parseManifestPorts` (`docker/common.js:450-486`) → inner `-p` at `agentServiceManager.js:964-966`; `runtimePublishHostIp` rewrites loopback→`0.0.0.0` inside the box. Outer: same `openPorts` read by the planner → `generatedPublishes` → `extraPublishes` → outer `-p`. So the same box-side port is published twice (box→agent AND host→box); the host→box promotion is what the design deletes.

---

## 2. RoutingServer + HttpRouteAccessPolicy (design claims verified)

### 2.1 Confirmed-accurate design observations — Observed
| Design claim | Verified at |
| --- | --- |
| Provider caches use `mtimeMs:size`, not content id | `HttpRouteProviders.js:100-109` (`return \`${stats.mtimeMs}:${stats.size}\``) |
| Policy aggregates by rank; public-write-guard runs AFTER aggregation | `HttpRouteAccessPolicy.js:104-114` (`moreRestrictiveHttpRouteDecision` loop then `applyPublicWriteGuard`); ranks `public=1,guest=2,authenticated=3,deny=4` (`HttpRouteAccessDecision.js:3-24`) |
| So a matching guest/authenticated provider outranks a service's `public` and can permit non-read methods the `public` provider alone would deny | Same — guard only fires if the *winning* decision is `public` |
| Dispatch uses FIRST prefix match; policy uses ALL matches | `httpServiceRoutes.js:309-315` (`.find(...)`) vs policy `for` loop |
| `normalizeServiceSpec` computes a slug but DROPS it from the runtime definition | `httpServiceRoutes.js:247` computes slug; `:260-272` return object has no `slug` field |
| Secondary-server (`additionalServerPort`) path BYPASSES HttpRouteAccessPolicy | `RoutingServer.js:386-392` (httpRouteAccess null when `profileServerHostAgentName` set) → falls to `ensureAuthenticated` `:541-543`; `proxyProfileServer` |
| httpServices resolves to the route's SINGLE `hostPort` (no per-service port today) | `routerHandlers.js:432-433,501` (`proxyHttpPassthrough(req,res,route.hostPort,…)`) |

### 2.2 HTTP/WS parity already exists for httpServices — Observed
`wsServiceProxy.js:40-87` (`resolveUpgradeTarget`) calls the same `resolveHttpServiceRoute` + `policy.httpRouteAccessPolicy.evaluate` + `ensureHttpRouteAccess` + `stripRouterIdentityHeaders` + `buildHttpServiceAuthInfoHeader` as the HTTP path. So the design's "unify HTTP+WS" is *already true* for httpServices; the divergence is the profileServer WS path (`profileServerProxy.js:121-168` uses generic `ensureAuthenticated`).

### 2.3 Access executors — Observed
`ensureHttpRouteAccess` (`authContext.js:444-467`): `public`→pass; `guest`→`resolveGuestRouteAuthContext`; `authenticated`→`resolveAuthenticatedRouteAuthContext`; else deny. Guest identity minted at `authContext.js:380-390`. Identity headers stripped/synthesized (`routerHandlers.js:229-236`, ROUTER_IDENTITY_HEADERS set).

### 2.4 Server bind — Observed
`RoutingServer.js:688` = `server.listen(port, '0.0.0.0', …)`. Box-internal wildcard bind; outer `-p` controls host exposure. Consistent with cloudflared reaching the router over box loopback.

### 2.5 Provider unbound = fail closed — Observed
`HttpRouteAccessPolicy.js:97-98` returns `providersUnboundDecision()` (503) if providers unbound; `_iterPolicyEntries` skips corrupt persisted entries but still yields manifest+service providers. Design's content-addressed-snapshot + epoch + lease is a response to the real mtime:size gap; assessment: content-digest + fail-closed-on-unreadable are necessary; the full durable-epoch + bounded-rehash + lease is sufficient but heavier than the minimum (a single-writer in-process version counter checked at dial time gives the same authorization-to-dial guarantee if all writes route through the router; the extra machinery buys host-side out-of-band-edit detection at per-request cost).

---

## 3. Explorer transitive agent inventory (22-node closure)

### 3.1 Closure — Delegated (complete, verified)
Root `explorer/manifest.json:25-43` + profile-default enables `basic/web-publishing`. Recursive edges: `AchillesCLI/achilles-cli:15-21` → opencodeAgent, piAgent, codexAgent, GPTResearcher, `proxies/searchAgent`; `proxies/soul-gateway:39-41` → `default-local-llm`; `webmeetAgent:12-14` → liveKitServerAgent (dedup). All other manifests have no `enable`. **22 nodes total.** Not enabled (outside closure): `AssistOSExplorer/llmAssistant`, `userPersistoAgent`. `webmeetLivekitAiAgent` **removed** (dir gone; stale doc/test refs only).

### 3.2 The implicit-7000 mechanism — Delegated
`AgentServer.mjs:1294` default PORT 7000. `boxStartPublishPlan.js:652-653`: `implicitAgentServer = !start || Boolean(agent)`. `box-publish-planner.mjs:74-83` synthesizes `127.0.0.1:<hash>:7000` for default/bridge agents without an explicit 7000 map. → **Only** the 3 start-only agents (webtty, onlyOffice, webmeetStt) escape it. **LiveKit and web-publishing are `agent`-mode → get a phantom :7000 publish** even though LiveKit runs no AgentServer (its start script ends in a watch loop, `start-livekit-server-agent.sh:246-254`); design D19 (`start` not `agent`) fixes this.

### 3.3 Per-agent listeners — Delegated (verbatim-verified)
| Agent | Command | Listeners (how) |
| --- | --- | --- |
| explorer | `cli /bin/bash` | 7000 impl |
| gitAgent/dpuAgent/soplangAgent/tasksAgent/achilles-cli/opencode/pi/codex/multimedia/webAssist | agent or cli or none | 7000 impl |
| soul-gateway | agent (own server) | 7000; httpServices `/services/soul-gateway/v1|management`, `/public-services/…-health` |
| GPTResearcher | agent+script | 7000 + **8000** UI (0.0.0.0, additionalServerPort) |
| searchAgent | agent+script | 7000 + 8888 SearXNG (lo) + 8890 browser-pool (lo) |
| default-local-llm | agent+script | 7000 + 8080 llama (lo 127.0.0.1) |
| webmeetAgent | agent | 7000 (prod openPorts `17001:7000`) |
| webtty | **start-only** | **7681** (openPorts `127.0.0.1:7681`); no 7000 |
| webmeetStt | **start-only** | **9000** uvicorn (openPorts `127.0.0.1:19000:9000`); **no consumer** |
| onlyOffice | **start-only** | 7000 control(0.0.0.0) + 8080 editor(0.0.0.0) + 9100 storage(lo) + 80 DS(lo); openPorts `17002:7000`,`8082:8080` |
| Umami | agent+script | 7000 + 3000 app(additionalServerPort) + 5432 pg(lo) + 7301 mcp(lo) |
| LiveKit | agent (supervisor) | see §4 |
| web-publishing | start+agent | nginx 8081 + 7000 impl + cloudflared(outbound) |

### 3.4 webmeetStt orphaned — Delegated
`rg webmeetStt` across AssistOSExplorer/webmeetInfra/basic returns only its own files, docs, and the explorer `enable` line (not a call site). `webmeetAgent` references it 0 times. Design claim "no consumer after LiveKit-AI-worker deletion" **verified**.

---

## 4. LiveKit / TURN (webmeetInfra)

### 4.1 Current config (per profile) — Delegated
Generated by `scripts/hooks/preinstall.sh` (not the start script). `livekit.yaml` (`:206-220`) writes `tcp_port`, `port_range_start/end`, `use_external_ip`, conditional `node_ip` — **no `udp_port` mux, no `turn:` block, no `media:`**. Default ports (`:123-126`): signal 7880, tcp 7881, range 7882-7892. Dev renumbers to 17880/17881/17882-17892. `use_external_ip` default false; **prod flips to true and suppresses node_ip** (`:167-177,215-217`).

Per-profile openPorts (`webmeetInfra/liveKitServerAgent/manifest.json`):
| Service | default `:30-40` | dev `:141-150` | prod `:244-261` | bind |
| --- | --- | --- | --- | --- |
| health | 17000 | 17000 | 17000 | 127.0.0.1 |
| signal | 7880 | 17880 | 7880 | 0.0.0.0 |
| ICE/TCP | 7881 | 17881 | 7881 | 0.0.0.0 |
| UDP media range | 7882-7892 | 17882-17892 | 7882-7892 | 0.0.0.0 |
| egress | 7980 | 17980→7980 | 7980 | 127.0.0.1 |
| redis | 6379 | 16379→6379 | 6379 | 127.0.0.1 |
| coturn | 3478 tcp+udp | 13478 | 3478 tcp+udp | 0.0.0.0 |
| coturn relay | 20000-20010/udp | 20000-20010 | 20000-20010 | 0.0.0.0 |
| nginx TLS | — | — | 80, 443 | 0.0.0.0 |
| network mode | bridge `webmeet` | bridge `webmeet` | **host** | — |

Coturn generated `no-tls`/`no-dtls`, `lt-cred-mech` (`:240-251`), started unconditionally for all profiles (`start-livekit-server-agent.sh:98-107,236`). Nginx+Certbot prod-only. Redis loopback. Health = `python3 -m http.server 17000 --bind 0.0.0.0`.

### 4.2 Pinned version — Delegated (External-corroborated)
`container-image-builds/images/livekit-server-agent/Dockerfile:8-13`: `livekit/livekit-server:v1.11.0@sha256:100b9a…`, egress `v1.9.1`. Test pins the same (`tests/image-definitions.test.mjs:270-271`). Design's "v1.11.0" **confirmed**.

### 4.3 External doc verification — External
- LiveKit v1.11.0 `pkg/config/config.go`: `TCPPort: 7881`, `UseExternalIP: false`, `TURN.Enabled: false` (embedded TURN off by default).
- LiveKit ports/firewall docs: single-port UDP mux via `rtc.udp_port` is valid — "When this is set, `rtc.port_range_start/end` are not used." `tcp_port` default 7881.
- **Not doc-confirmed:** that `tcp_port: 0` disables ICE/TCP (a reasonable convention; verify at runtime). The design's "range must be unset" is slightly stronger than docs ("not used"/ignored).

### 4.4 Client-side coupling — Delegated (spot-checked by reviewer)
- webmeetAgent mints LiveKit room JWTs itself (HS256): `webmeetAgent/lib/runtime/livekitRuntime.mjs:28-33`.
- webmeetAgent emits `turn:<host>:3478?transport=udp|tcp` to the browser from **static** creds: `lib/store/rtcConfig.mjs:59-73` (reviewer-verified), reads `WEBMEET_TURN_USER/PASSWORD` `lib/webmeetStore.mjs:278-285`.
- Browser connects **directly** to `ws://<host>:7880` today (default/dev seeded at `webmeetAgent/scripts/hooks/preinstall.sh:103-106`) or via in-container nginx (prod) — **never** the router. Design's "signaling private via router" is new.
- Design's `use_external_ip:false` + `media.publicIPv4`(→node_ip) contradicts current prod; config generation must change.

---

## 5. OnlyOffice

### 5.1 Manifest — Delegated (reviewer spot-checked openPorts)
`onlyOffice/manifest.json:2` image `assistos/onlyoffice-agent:${ONLYOFFICE_VERSION}` (default 9.3.1). **No `additionalServerPort`.** `openPorts:120-123` = `["127.0.0.1:17002:7000","127.0.0.1:8082:8080"]` (dev `18082:8080`). Env: `ALLOW_PRIVATE_IP_ADDRESS` default true, `ONLYOFFICE_JWT_SECRET` sharedGeneratedSecret, `ONLYOFFICE_EDITOR_PORT` 8080, `CONTROL_PORT` 7000, `STORAGE_PORT` 9100, `PUBLIC_URL`/`INTERNAL_URL` no default. `readiness: tcp`. httpServices: one entry slug `onlyoffice`, `/services/onlyoffice/`→`/control/`, authenticated, dpuConfidential delegation.

### 5.2 Decorator listeners — Delegated
`src/index.mjs:290-292`: control `0.0.0.0:7000`, storage `127.0.0.1:9100`, editor `0.0.0.0:8080` (+WS upgrade). `config.mjs:27-36`: `publicEditorBaseUrl = ONLYOFFICE_PUBLIC_URL || http://127.0.0.1:8080`; `internalDocumentServerBaseUrl = ONLYOFFICE_INTERNAL_URL || http://127.0.0.1:80`.

### 5.3 Editor-proxy allow/deny — Delegated
`src/proxy/editor-proxy.mjs`: BLOCKED_EXACT `/coauthoring/CommandService.ashx`, `/ConvertService.ashx`, `/converter`, `/healthcheck` (`:1-6`); BLOCKED_PREFIXES `/example/`, `/welcome/`, `/info/`, `/internal/` (`:8-13`); ALLOWED_PREFIXES `/web-apps/`, `/sdkjs/`, `/sdkjs-plugins/`, `/fonts/`, `/themes/`, `/cache/files/` (`:15-22`) + `api.js` + `/cache/files/.+`; strips OnlyOffice version prefix before matching (`:30-36`); GET-only (`:127-132`). WS: GET + `/doc/*` + `Upgrade: websocket` (`:84-89`). **Design says "demo" — actual is `/example/`** (P3).

### 5.4 Storage/callback — Delegated (design-consistent)
`src/routes/storage.mjs:86-101` loopback-only remote-addr check; document/callback URLs = `http://127.0.0.1:9100/internal/{document|callback}/<sessionToken>` (`control.mjs:85-87,152-165`) — **not** from public URL or headers. Token = 32-byte random, hash-stored, idle+absolute+delegation TTL (`session-store.mjs:157-186`). Trusted-download origin check (`storage.mjs:40-67`). Callback validated by loopback + opaque token + status∈{2,6} + canWrite + origin (`storage.mjs:124-152`) — NOT by OnlyOffice JWT.

### 5.5 Editor reach today — Delegated
Prod: browser → `ONLYOFFICE_PUBLIC_URL` (`office.<domain>`) → Cloudflare → web-publishing nginx `:8081` → `host.containers.internal:8082` → openPorts `127.0.0.1:8082:8080` → container editor 8080. Dev: browser → `127.0.0.1:8082` direct. **Not via the router today** (contradicts design §3.1/§3.3 "additionalServerPort"). `X-Forwarded-Host/Proto` matter: `editor-proxy.mjs:51-65` (DS mints cache/redirect URLs from them); nginx sets them `nginx-config.mjs:43-45`.

---

## 6. Umami / web-publishing / cloudflared

### 6.1 Umami current state — Delegated
`UmamiAgent/umamiAgent/manifest.json`: `additionalServerPort:"3000"`; only `access` present = `guest` for `/IDE-plugins/umami-settings/*`; **no httpServices, no 3001.** Start script binds pg `127.0.0.1:5432`, app `PORT=3000 HOSTNAME=0.0.0.0`, mcp `7301`, AgentServer `7000`. Tracker = Umami's own `/script.js` (default `http://127.0.0.1:3000`), events go **directly** to Umami (`IDE-plugins/umami-settings/umami-settings.js:156-166`; `DS01:40`). `DS01:74-77` (Q3) **explicitly rejected** an ingestion path through the agent — §6.7's 3001 proxy reverses it and is **unbuilt**.

### 6.2 web-publishing = 14-output configProvider — Delegated
`basic/web-publishing/manifest.json:34-52` `providesConfig` outputs: `ONLYOFFICE_PUBLIC_URL/INTERNAL_URL/CALLBACK_BASE_URL`, `WEBMEET_PUBLIC_LIVEKIT_URL/LIVEKIT_URL/TLS_HOSTNAME/TURN_HOST/TURN_EXTERNAL_IP/TURN_REALM/CERT_EMAIL/LIVEKIT_UPSTREAM`, `WEB_PUBLISHING_CLOUDFLARED_TUNNEL_TOKEN(sensitive)/CLOUDFLARE_TUNNEL_ID/TUNNEL_NAME`. Values in `lib/routes.mjs:279-303` — several are **internal** `host.containers.internal:<port>` URLs (officeInternal `:8082`, livekitUpstream `:7880`). nginx (`lib/nginx-config.mjs:52-57`) = pure Host reverse proxy on 8081 (no TLS/cache/redirect/static); upstreams `host.containers.internal:{8080,8082,7880,3001}` (`routes.mjs:4-29`). openPorts loopback 8081 default; `lan` profile `0.0.0.0:8081` (`manifest.json:114-117`).

configProvider contract (Ploinky core): `startupConfigProviders.js:300-359` runs provider subprocess, validates against allowlist, writes into encrypted `.ploinky/.secrets`, injects into consumer env; runs pre-wave (`workspaceUtil.js:976-992`). Explorer opts in (`explorer/manifest.json:72-83`).

cloudflared child: `web-publishing/runtime/supervisor.mjs:30-53` spawns `cloudflared tunnel run --token <argv>` (token in ARGV); tunnels remotely-managed `config_src:'cloudflare'` (`lib/cloudflare-api.mjs:65-73`); DNS CNAME→`<id>.cfargotunnel.com` proxied.

### 6.3 Transfer-table gaps — Delegated
| Not covered | Why |
| --- | --- |
| LAN publication (`lan` 0.0.0.0:8081) + default nginx-only-no-Cloudflare mode | box has no LAN HTTP port; public HTTP requires Cloudflare (§5.2) |
| Internal URLs (`ONLYOFFICE_INTERNAL_URL`, `CALLBACK_BASE_URL`, `WEBMEET_LIVEKIT_URL`, `_UPSTREAM`) | snapshot excludes raw ports/internal URLs (§8.5); needs consumer rewrites (`onlyOffice/scripts/hooks/preinstall.sh:92-94`, webmeet scripts) |
| TURN/TLS/cert vars (`WEBMEET_TURN_HOST/_EXTERNAL_IP/_REALM`, `TLS_HOSTNAME`, `CERT_EMAIL`) | dropped/replaced (external TURN + Cloudflare TLS), never named in table |
| Cloudflare tunnel **creation** from API token | design assumes pre-existing tunnel |
| `sensitive` token propagation + unencrypted `secret-state.json` | table silent |

### 6.4 cloudflared standalone + secret hazards — Delegated
`basic/cloudflared/lib/routes.mjs:6-19` origin pinned `host.containers.internal:8080/8082` (prior review F-06); `normalizeService` forbids port 7000. Started by `runtime/cloudflared-supervisor.mjs:22-42` (token in ENV). Two cloudflared paths (web-publishing child + standalone agent). Hazards: token in argv (web-publishing) / env (standalone); unencrypted `secret-state.json` (mode 0600 plain JSON, `status-store.mjs:102-108`); `sensitive` token flows into consumer env via configProvider. Design's `--token-file` (≥2025.4.0, mode 0600, ephemeral) is a real improvement — migration must purge the legacy plaintext + `.secrets` residue.

---

## 7. Inner runtime + identity mechanisms

### 7.1 network.mode — Delegated
`NETWORK_MODES = ['default','none','host','bridge']` (`networkContract.js:3`). **Profile network REPLACES root** (`:76-82` `effectiveManifestNetwork` returns profile contract, not merge) — confirms design's "profile overrides root." host→`--network host` (`agentServiceManager.js:508-511`); default/bridge→managed bridges `--opt isolate=true` (`networkLifecycle.js:560`). Nested podman mandatory in box (`docker/common.js:136-139`); host-port contract skipped in box (`agentServiceManager.js:1329-1330`). **Inferred:** inner host mode = box namespace. Caveat for design §6.6: current LiveKit manifest has **no root network** (per-profile only), so the design must add root `network:host` AND delete every profile `network` (else a profile with no network key inherits root host — OK — but a profile with a bridge override breaks the UDP handoff). Acceptance test §17.1 "LiveKit profile resolution" covers this.

### 7.2 Agent identity (TURN broker enforceability) — Delegated
Per-agent signed identity injected: `agentIdentityEnv.js:39-47` (`PLOINKY_AGENT_ID/SECRET/API_KEY` Ed25519 signed-subject). Router **can** authenticate exact caller: `AgentAssertionService.js:85-97` verifies a per-call assertion and returns `callerPrincipal`; secret is master-key-derived per-agent HMAC (`invocationMinter.js:28`). **BUT** `validatePayload:34-63` **requires `payload.targetAgent`** to match an agent id; verify call-sites are only MCP/OpenAI-delegation/discovery — **no generic agent→router-owned-endpoint handler.** So the TURN broker needs: a new router endpoint, a non-agent target binding convention, the `credentialConsumers` ACL, and replacement of webmeetAgent's static-credential path. "Reuse existing signed identity" is true about the *primitive*, not the wiring.

### 7.3 New mechanisms that don't exist — Delegated
- `PLOINKY_EDGE_TOPOLOGY_FILE` / topology dir / `PLOINKY_EDGE_TOPOLOGY_REVISION` — `rg` → none. (RO-mount-into-every-agent pattern has precedent: `/Agent:…:ro` at `agentServiceManager.js:626`.)
- Per-service `{containerPort,url}` registry — today one `hostPort` (+one `additionalServerPort`) per route (`routingFile.js:70-80`).
- "Restart every enabled agent in dependency order" — dependency-ordered *start* exists (`workspaceDependencyGraph.js:443-470`); restart is per-container crash/liveness only (`containerMonitor.js:505-508`). No fleet-restart primitive.
- configProviders inject **secrets/env**, not files (`startupConfigProviders.js:331-338`).

### 7.4 Readiness + router env — Delegated
`readiness.protocol` ∈ {tcp, mcp, none} (`startupReadiness.js:1-7`); `health.readiness.script` + TCP-port inference exist (`:71-83`; `healthProbes.js:147-156`). No HTTP readiness probe executor. Router env by mode (`routerPort.js:11-15,111-123`): default/bridge→`host.containers.internal:<port>`, host→`127.0.0.1:<port>`; injected `agentServiceManager.js:1443-1446`.

### 7.5 No bootstrap cycle — Inferred
Design §8.5 phasing (write `reconciling` snapshot before targets exist → resolve engine-assigned targets after containers exist → activate URLs only after readiness/probes) correctly breaks the chicken/egg. Revision digest excludes readiness state → no restart loop. Cost: full-stack restart on every consumer-visible revision (design acknowledges §16).

---

## 8. Cross-cutting risks

- **Highest risk (empirical):** physical→box UDP source-address fidelity for SRTP through the nested podman `-p` hop. Unprovable from code. DS002 (`webmeetInfra/.../DS002-livekit-server-agent.md:171-183`) documents that bridge-mode already broke SRTP downlink (why prod uses host net); nesting adds a hop. Needs two-browser cross-network media smoke on native amd64+arm64 with recorded Podman/Netavark/Aardvark versions.
- **Host-mode privilege:** LiveKit in box namespace can bind/inspect other box sockets (design §16 acknowledges).
- **Phantom :7000:** LiveKit/web-publishing are `agent`-mode → planner synthesizes a :7000 publish today; design's `start`-mode (D19) must actually change the command type.
- **Prior-review couplings still apply:** F-01 contract bump + destroy/recreate; F-06 cloudflared hardcoded 8080; hosts-file `--hosts-file=none` for nested podman (from `REVIEW_FINDINGS_2026-07-15-gateway-removal-plan.md` / `Ploinky-networking-plan-review.md`).

---

*Read-only. No source, resource, container, or config modified. Companion to the verdict file `REVIEW_FINDINGS_2026-07-15-box-edge-routing-design.md`.*
