# Design - Ploinky LLM Runtime Containers

**Date:** 2026-07-01
**Status:** design approved in brainstorming; pending written spec review before implementation planning.

## Problem

Ploinky has the beginning of a hardware-aware local LLM runtime system: a declarative architecture catalog, host-side runtime policy selection, a shared runtime control server, and smoke CPU image work. The implementation does not yet satisfy the full runtime-container requirements. The current state has drift between documentation, tests, and code: deleted `base-local` references remain, runtime tests expect missing launchers, image refs do not line up with the published CPU image, and the runtime shape still carries a transitional three-service layout.

The target design should be clean rather than backward-compatible. The attached runtime-container requirements are the target contract. Existing DS012/DS004 behavior should be revised where it conflicts with this design.

## Goals

- Define one authoritative LLM runtime container contract:
  - runtime MCP/control server on port `9000`
  - active OpenAI-compatible engine on port `8080`
  - no model engine loaded at container boot
  - launchers discovered from `/workspace/modelLaunchers`
- Keep Ploinky generic:
  - hardware detection
  - image selection
  - volume, resource, device, and secret wiring
  - container lifecycle
  - no model ids, HF repos, launcher flags, or engine-specific arguments in Ploinky core
- Keep model and engine logic in launchers:
  - HF repository, revision, files, model format, engine choice, artifact preparation, parameter mapping, and process lifecycle
- Provide real image-build contracts for all required hardware families.
- Provide a CPU reference implementation first, then expand through the accelerator matrix.
- Make runtime behavior testable with acceptance criteria that prove image selection, launcher discovery, HF download/cache reuse, artifact preparation, engine start, inference, resource controls, traceability, and secret hygiene.

## Non-goals

- Backward compatibility with the current `9000` public proxy, `9001` AgentServer MCP sidecar, and `9002` runtime-control layout.
- Multi-model serving inside one runtime container.
- Distributed scheduling across multiple hosts.
- Model recommendation UX.
- Benchmarking or quality comparison.
- Automatic quantization selection.
- Production deployment automation beyond image publish workflows and local Ploinky startup.

## Key Decisions

| # | Decision |
| --- | --- |
| 1 | The attached runtime-container architecture is the clean target and supersedes conflicting DS012/DS004 details. |
| 2 | Runtime containers expose one MCP/control service on `9000`; engines are launched on demand on `8080`. |
| 3 | Secure MCP invocation remains required, but it must be implemented directly in the runtime MCP server or a shared MCP auth library, not by preserving a sidecar solely for compatibility. |
| 4 | Launchers live under `/workspace/modelLaunchers` and are the only place that knows model-specific and engine-specific details. |
| 5 | Startup parameters are normalized operational fields only. Generation parameters remain in inference requests. |
| 6 | Every release image must be traceable through an image digest and an `engineVersions.lock.json`. |
| 7 | The first implementation phase should deliver a complete CPU llama.cpp reference path before adding accelerator images. |

## Target Architecture

Ploinky is the host-side orchestrator. It detects hardware, selects a runtime image from `local-llm-architectures`, applies typed runtime policy, mounts the required volumes, passes secrets, starts and stops containers, and exposes runtime surfaces to agents or UI.

The runtime container starts a generic MCP/control server at `0.0.0.0:9000`. The server discovers launcher scripts, validates normalized input, invokes launcher operations, records state and redacted logs, and reports the active engine endpoint.

The inference engine starts only when a launcher is called. One container owns one active engine instance on port `8080`. Switching models means stopping the current active instance and starting a different launcher in the same container. Simultaneous models require separate runtime containers.

Each launcher owns model-specific truth:

| Concern | Launcher responsibility |
| --- | --- |
| Model identity | Logical model id, HF repo, revision, files, and format. |
| Engine choice | llama.cpp, vLLM, SGLang, TensorRT-LLM, or OpenVINO. |
| Download | `hf download` or equivalent local reuse under `/models`. |
| Artifact prep | GGUF, OpenVINO IR, TensorRT engine, or other derived artifacts. |
| Parameter mapping | Normalized MCP startup fields to concrete engine arguments. |
| Process lifecycle | Start, stop, status, PID tracking, and health reporting. |

## Component Ownership

| Component | Owner repo | Contract |
| --- | --- | --- |
| Architecture catalog | `local-llm-architectures` | Hardware families, image ids/refs/digests, platforms, runtime policy, engine inventory, and build-source pointers. |
| Image builds | `container-image-builds` | Real Dockerfiles and workflows for CPU, NVIDIA amd64, NVIDIA Spark arm64 sm_121, AMD ROCm, Vulkan, and Intel/OpenVINO runtime images. |
| Runtime MCP server | `llm-runtime/shared/runtime-agent` | Single service on `9000`, launcher discovery/dispatch, validation, active-instance state, logs, and runtime status. |
| Agent/model packages | `llm-runtime/<agent>` | `manifest.json`, `agent-card.json`, `agent-models.json`, and agent launchers mounted into `/workspace/modelLaunchers`. |
| Ploinky integration | `ploinky` | Hardware detection, selection, mounts, resources, devices, secrets, labels, routing, and selected-architecture state. |

## Standard Data Flow

```text
Ploinky detects hardware
  -> selects catalog architecture and image
  -> writes /runtime/selected-architecture.json
  -> starts container with /workspace, /models, /runtime, devices, resources, and HF_TOKEN
  -> runtime MCP boots on port 9000
  -> runtime lists/describes launchers from /workspace/modelLaunchers
  -> user or agent calls launchers.prepare or launchers.start
  -> launcher downloads or reuses HF artifacts under /models
  -> launcher derives any required artifacts under /models/derived
  -> launcher starts one engine on port 8080
  -> runtime reports status/logs and exposes the OpenAI-compatible inference endpoint
```

## Container Filesystem Contract

| Path | Purpose |
| --- | --- |
| `/opt/ploinky/runtime-agent/mcp-server.mjs` | Runtime MCP/control server entrypoint. |
| `/opt/engines/llamacpp/` | llama.cpp runtime assets. |
| `/opt/engines/vllm/venv/` | Isolated vLLM environment where supported. |
| `/opt/engines/sglang/venv/` | Isolated SGLang environment where supported. |
| `/opt/engines/trtllm/venv/` | Isolated TensorRT-LLM environment for NVIDIA images. |
| `/opt/engines/openvino/` | OpenVINO Model Server runtime for Intel images. |
| `/workspace/modelLaunchers/` | Mounted launcher scripts named `modelLauncher_<modelId>.sh`. |
| `/models/hf-cache/` | Persistent Hugging Face cache. |
| `/models/artifacts/` | Downloaded snapshots or model files. |
| `/models/derived/` | Locally produced GGUF/OpenVINO/TensorRT or other derived artifacts. |
| `/runtime/selected-architecture.json` | Ploinky-written runtime selection and policy state. |
| `/runtime/launch-configs/*.json` | Sanitized launcher configs. |
| `/runtime/instances/*.json` | Runtime instance records. |
| `/runtime/logs/*.log` | Redacted runtime and launcher logs. |
| `/runtime/active-instance.json` | Pointer to the active engine instance. |

## Environment Contract

Runtime containers receive these common environment variables:

| Variable | Value |
| --- | --- |
| `HF_HOME` | `/models/hf-cache` |
| `PLOINKY_MODELS_DIR` | `/models/artifacts` |
| `PLOINKY_DERIVED_DIR` | `/models/derived` |
| `PLOINKY_RUNTIME_DIR` | `/runtime` |
| `PLOINKY_LAUNCHERS_DIR` | `/workspace/modelLaunchers` |
| `PLOINKY_MCP_PORT` | `9000` |
| `PLOINKY_INFERENCE_PORT` | `8080` |
| `HF_TOKEN` | Optional secret/env value for gated or private Hugging Face repos. |

The older `PLOINKY_LLM_PUBLIC_PORT`, `PLOINKY_LLM_MCP_PORT`, `PLOINKY_LLM_CONTROL_PORT`, `PLOINKY_LLM_LAUNCHERS_DIR`, and three-service runtime shape should be removed from the new implementation path.

## Runtime MCP Tools

The MCP server is a generic dispatcher. It does not contain a central model catalog and does not decide which HF files a model needs. It exposes:

| Tool | Purpose |
| --- | --- |
| `runtime.describe` | Return image, engines, selected architecture, visible devices, resources, active instance, and traceability metadata. |
| `launchers.list` | Enumerate `modelLauncher_*.sh` scripts under `/workspace/modelLaunchers`. |
| `launchers.describe` | Execute launcher `describe` and validate the response. |
| `launchers.prepare` | Ask a launcher to download or prepare model artifacts without serving. |
| `launchers.start` | Start or reuse a launcher after validating normalized startup parameters. |
| `instance.status` | Return PID, port, engine, launcher, health, and artifact status. |
| `instance.stop` | Stop the active or selected instance. |
| `instance.logs` | Return redacted launcher and engine logs. |

The server may also expose HTTP diagnostic routes behind the same process, but MCP tools are the authoritative control surface for state-changing operations.

## Launcher Protocol

Every launcher must support:

```text
modelLauncher_<modelId>.sh describe
modelLauncher_<modelId>.sh prepare --config <launch-config.json>
modelLauncher_<modelId>.sh start   --config <launch-config.json>
modelLauncher_<modelId>.sh stop    --instance <instanceId>
modelLauncher_<modelId>.sh status  --instance <instanceId>
```

`describe` must return JSON with:

| Field | Purpose |
| --- | --- |
| `schemaVersion` | Launcher protocol version. |
| `id` | Launcher id matching the filename. |
| `modelId` | Logical model id. |
| `engine` | `llamacpp`, `vllm`, `sglang`, `trtllm`, or `openvino`. |
| `modelFormat` | `gguf`, `safetensors`, `awq`, `fp8`, `openvino-ir`, `trtllm-engine`, or another approved format. |
| `hfRepoId` | Hugging Face repository id when applicable. |
| `hfRevision` | Pinned revision, tag, or commit. |
| `modelFiles` | Required files or include patterns. |
| `supportedAccelerators` | Accelerator families accepted by this launcher. |
| `supportedPlatforms` | OCI platforms accepted by this launcher. |
| `configurableParameters` | Normalized startup parameters accepted by this launcher. |
| `profiles` | Named launcher profiles with defaults. |
| `resourceEstimates` | RAM, accelerator memory, context, and concurrency guidance. |

`prepare` must:

- download or reuse the pinned model artifacts
- produce required derived artifacts without starting serving
- write status and traceability state under `/runtime`
- never write model files under `/runtime`

`start` must:

- run `prepare` when required artifacts are missing
- stop any conflicting active instance
- start the engine on `0.0.0.0:${PLOINKY_INFERENCE_PORT}` inside the container, with Ploinky responsible for loopback-only host publishing
- write PID, engine command summary, local port, artifact paths, and health status
- return JSON only

`stop` and `status` must be idempotent enough for restart and cleanup paths.

## Startup Parameter Contract

`launchers.prepare` and `launchers.start` accept operational startup parameters only.

| Field group | Fields |
| --- | --- |
| Identity/profile | `launcherId`, `instanceId`, `profile` |
| Context/throughput | `contextTokens`, `concurrency`, `batchTokens`, `prefillChunkTokens` |
| Accelerator memory | `acceleratorMemoryFraction`, `acceleratorReserveMiB`, `kvCachePrecision` |
| Placement/parallelism | `gpuLayers`, `tensorParallelSize`, `pipelineParallelSize`, `deviceIds`, `cpuThreads` |
| Engine policies | `flashAttention`, `enableMetrics` |

Generation parameters are not startup parameters. `temperature`, `top_p`, `max_tokens`, structured output, tool calling, and sampling controls belong to inference requests sent later to the OpenAI-compatible engine endpoint. They must not be stored in launcher configs.

## Engine Mapping Requirements

Launchers map normalized parameters to engine-specific arguments:

| Engine | Required mapping examples |
| --- | --- |
| llama.cpp | `contextTokens -> --ctx-size`, `concurrency -> --parallel`, `gpuLayers -> --n-gpu-layers`, `batchTokens -> --batch-size`, `prefillChunkTokens -> --ubatch-size`, `cpuThreads -> --threads`, `flashAttention -> --flash-attn`, `deviceIds -> --device`. |
| vLLM | `contextTokens -> --max-model-len`, `acceleratorMemoryFraction -> --gpu-memory-utilization`, `concurrency -> --max-num-seqs`, `batchTokens -> --max-num-batched-tokens`, `kvCachePrecision -> --kv-cache-dtype`, `tensorParallelSize -> --tensor-parallel-size`. |
| SGLang | `contextTokens -> --context-length`, `acceleratorMemoryFraction -> --mem-fraction-static`, `concurrency -> --max-running-requests`, `prefillChunkTokens -> --chunked-prefill-size`, `kvCachePrecision -> --kv-cache-dtype`, `tensorParallelSize -> --tp`, `enableMetrics -> --enable-metrics`. |
| TensorRT-LLM | `tensorParallelSize -> --tp_size`, `pipelineParallelSize -> --pp_size`, `concurrency -> --max_batch_size`, `batchTokens -> --max_num_tokens`; KV cache and backend behavior are fixed by the launcher variant. |
| OpenVINO | `deviceIds`, `contextTokens`, `concurrency`, and `enableMetrics` map to the generated OpenVINO Model Server model/pipeline configuration. |

Each real launcher must have a command-capture test proving the accepted normalized fields become the intended engine arguments.

## Hugging Face Authentication And Downloads

Launchers use the `hf` CLI or a documented equivalent to download model artifacts.

Rules:

- Public models must download without `HF_TOKEN`.
- Gated and private models require `HF_TOKEN`.
- Missing token for gated/private repos returns a clear authentication-required error.
- Invalid token or insufficient rights returns a clear access-denied error.
- Tokens must never be baked into images.
- Tokens must never appear in launcher scripts, MCP payloads, launch configs, selected architecture state, logs, engine commands, or error strings.
- A model already available locally may start without a token.

Runtime images must include `huggingface_hub[cli]` or an approved equivalent. `HF_HOME` must point to `/models/hf-cache`.

## Hardware Runtime Images

The catalog and build repos must cover these image families:

| Image id | Runtime image | Required engines |
| --- | --- | --- |
| `cpu-amd64` | `assistos/llm-runtime:cpu-amd64` | llama.cpp CPU. |
| `cpu-arm64` | `assistos/llm-runtime:cpu-arm64` | llama.cpp CPU with ARM/KleidiAI validation when available. |
| `nvidia-amd64` | `assistos/llm-runtime:nvidia-amd64` | llama.cpp CUDA, vLLM CUDA, SGLang CUDA, TensorRT-LLM. |
| `nvidia-spark-arm64-sm121` | `assistos/llm-runtime:nvidia-spark-arm64-sm121` | llama.cpp CUDA `sm_121`, Spark-validated SGLang, Spark-validated TensorRT-LLM, vLLM only when validated. |
| `amd-rocm-amd64` | `assistos/llm-runtime:amd-rocm-amd64` | llama.cpp ROCm, vLLM ROCm, SGLang ROCm when validated, llama.cpp Vulkan fallback. |
| `vulkan-amd64` | `assistos/llm-runtime:vulkan-amd64` | llama.cpp Vulkan and CPU fallback. |
| `vulkan-arm64` | `assistos/llm-runtime:vulkan-arm64` | llama.cpp Vulkan and CPU fallback. |
| `intel-amd64` | `assistos/llm-runtime:intel-amd64` | OpenVINO Model Server, llama.cpp CPU/Vulkan, Intel additions only after validation. |

Catalog ids may keep repo-local naming conventions, but the default catalog must include a Spark-specific architecture equivalent to `nvidia-spark-arm64-sm121`. A generic `nvidia-cuda-arm64` entry is not sufficient for GB10/sm_121 validation.

## Image Build Contract

Every runtime image build must include:

- runtime MCP server copied into `/opt/ploinky/runtime-agent`
- `hf` CLI
- `bash`, `curl`, `jq`, `python3`, `tini`, and inspection utilities
- `/workspace/modelLaunchers`, `/models`, and `/runtime` directory contract
- `ENTRYPOINT` that starts the runtime MCP server, not an engine
- isolated Python engine environments:
  - `/opt/engines/vllm/venv`
  - `/opt/engines/sglang/venv`
  - `/opt/engines/trtllm/venv`
- `engineVersions.lock.json`

`engineVersions.lock.json` must pin the relevant fields for each image:

| Field | Meaning |
| --- | --- |
| `llamaCppCommit` | llama.cpp commit or release. |
| `vllmVersion` | vLLM version when present. |
| `sglangVersion` | SGLang version when present. |
| `tensorRtLlmVersion` | TensorRT-LLM version when present. |
| `openvinoModelServerVersion` | OpenVINO Model Server version when present. |
| `cudaVersion` | CUDA base version when present. |
| `rocmVersion` | ROCm base version when present. |
| `pythonVersion` | Python version used by engine environments. |

Image workflows must publish to `assistos/llm-runtime:<tag>` or another single documented namespace used by the catalog. Release catalog entries should pin image digests.

## Ploinky Container Startup Contract

Ploinky starts runtime containers with:

```text
podman or docker run -d
  --name <container>
  --memory <limit>
  --cpus <limit>
  --pids-limit <limit>
  --shm-size <size>
  --ulimit memlock=-1:-1 where required
  -v <workspace>:/workspace
  -v <models>:/models
  -v <runtime>:/runtime
  -p 127.0.0.1:<mcp-host-port>:9000
  -p 127.0.0.1:<engine-host-port>:8080
  <device args>
  <runtime image>
```

Device args are selected from typed catalog policy:

| Family | Device policy |
| --- | --- |
| CPU | No device args. |
| NVIDIA Docker | `--gpus all` or explicit allowed GPU list. |
| NVIDIA Podman | `--device nvidia.com/gpu=all` through CDI. |
| AMD ROCm | `/dev/kfd`, `/dev/dri`, and required security policy. |
| Vulkan | `/dev/dri`. |
| Intel GPU | `/dev/dri`. |
| Intel NPU | `/dev/accel`. |

Ploinky may support an administrative image override for diagnostics, but the override must not bypass typed runtime policy validation.

## Security Contract

- Ploinky core must not execute code from `local-llm-architectures`.
- Catalog runtime policy remains typed and allowlisted.
- Launchers are mounted agent/workspace artifacts and execute only inside the selected runtime container.
- Runtime MCP state-changing tools must require normal Ploinky MCP invocation authorization.
- `HF_TOKEN` is a secret value and must be redacted from every state, log, command summary, and error path.
- Selected architecture state must include no secret names or values.
- Launch configs must include only normalized startup parameters and must be mode `0600` where supported.
- Logs returned through MCP must be redacted and bounded.

## Traceability Contract

For each started instance, runtime state must record:

| Field | Purpose |
| --- | --- |
| `instanceId` | Stable runtime instance id. |
| `launcherId` | Launcher script id. |
| `engine` | Engine used. |
| `modelId` | Logical model id. |
| `hfRepoId` | HF repository when applicable. |
| `hfRevision` | Pinned model revision. |
| `modelFiles` | Downloaded file list or include patterns. |
| `artifactPaths` | Local model and derived artifact paths. |
| `artifactDigests` | Hashes where practical for downloaded or derived artifacts. |
| `imageRef` | Runtime image ref from selected architecture. |
| `imageDigest` | Runtime image digest when known. |
| `engineVersions` | Parsed lockfile content or relevant subset. |
| `launchConfigPath` | Sanitized config path. |
| `pid` | Engine process id. |
| `port` | Engine serving port. |
| `startedAt` | Start timestamp. |
| `health` | Current health state. |

## Required Cleanup From Current State

The new implementation plan should explicitly remove or rewrite these current mismatches:

- stale `llm-runtime/base-local` references in tests and docs
- fake-only launchers as the only available runtime path
- `PLOINKY_LLM_*` runtime env names where the new contract uses `PLOINKY_*`
- three-service `9000/9001/9002` runtime startup wrapper
- catalog CPU image refs that do not line up with the actual published runtime image namespace
- `launch-config.schema.json` generation fields such as `temperature`, `topP`, and `maxTokens`
- placeholder image build files presented as runtime image builds
- missing `engineVersions.lock.json`
- missing image digest traceability in release catalog records

## Milestones

| Phase | Goal | Done when |
| --- | --- | --- |
| Phase 1: Contract cleanup | Replace stale runtime assumptions with the one-service MCP plus launcher contract. | Schemas, docs, tests, and paths agree on `/workspace/modelLaunchers`, port `9000`, engine `8080`, and normalized startup params. |
| Phase 2: CPU reference runtime | Build the first complete real runtime path. | CPU image starts MCP only; a real llama.cpp launcher downloads or reuses a pinned GGUF model; inference works on port `8080`; tests pass. |
| Phase 3: Catalog and image traceability | Make images reproducible and selectable. | Catalog image refs match actual builds, digests are supported or pinned for releases, and `engineVersions.lock.json` is consumed by builds. |
| Phase 4: Accelerator families | Add validated hardware images. | NVIDIA amd64, NVIDIA Spark arm64 sm_121, AMD ROCm, Vulkan, and Intel/OpenVINO have real Dockerfiles/workflows or are explicitly marked unavailable with failing acceptance items. |
| Phase 5: Engine matrix | Add launcher templates and mappings for every required engine family. | Parameter mapping tests cover llama.cpp, vLLM, SGLang, TensorRT-LLM, and OpenVINO; at least one smoke launcher per engine family exists or is skipped with documented hardware constraints. |
| Phase 6: End-to-end Ploinky validation | Prove Ploinky can run the system. | `ploinky start <agent>` selects an image, starts MCP, prepares a model, starts an engine, completes a chat request, and does not leak secrets. |

## Acceptance Criteria

| Requirement | Proof |
| --- | --- |
| Correct image selection | Unit tests cover all hardware families, fallback, and override validation. |
| Container boots without model load | Container smoke test confirms runtime MCP starts and no engine process is running. |
| Launcher discovery | Runtime test lists real and fixture `modelLauncher_*.sh` scripts from `/workspace/modelLaunchers`. |
| Launcher describe validation | Invalid or mismatched `describe` output is rejected. |
| HF download and cache reuse | Launcher test downloads a pinned public model once and relaunch reuses `/models/hf-cache` and `/models/artifacts`. |
| Gated/private HF handling | Tests cover missing token, invalid token, and local artifact reuse behavior without exposing token values. |
| Artifact preparation | Tests or hardware-gated checks prove GGUF, OpenVINO IR, and TensorRT derived artifact handling. |
| Engine start | CPU smoke model responds through an OpenAI-compatible endpoint on `8080`. |
| Startup params mapped | Command-capture tests prove normalized params become engine-specific arguments. |
| Runtime resources | Ploinky run-arg tests cover Docker and Podman device/resource output. |
| Traceability | Runtime records image digest, HF revision, artifact paths, artifact digests where practical, launch config, PID, and engine versions. |
| Secret hygiene | Tests assert `HF_TOKEN` names and values are absent from selected state, configs, logs, and command summaries. |
| Stale contract removed | Tests no longer reference deleted `base-local` or the three-port runtime wrapper. |

## Test Plan

| Layer | Tests |
| --- | --- |
| Catalog | Schema parity, image/platform consistency, Spark-specific architecture, digest validation, runtime policy safety. |
| Ploinky core | Hardware selection, override rejection, run-arg emission, mounts/env, selected state, reuse hash. |
| Runtime MCP server | Tool routing, launcher discovery, normalized parameter validation, active-instance state, log redaction, secret hygiene. |
| Launchers | Describe schema, prepare idempotence, command mapping, start/stop/status, cache reuse, auth failures. |
| Images | Build smoke for each family; engine binaries present; `hf` present; MCP starts; no engine process at boot. |
| End to end | Start CPU runtime through Ploinky, prepare model, start engine, send non-stream chat completion, stop instance. |

## Implementation Defaults For The Plan

| Area | Default for plan |
| --- | --- |
| First real agent/package | Update the current local LLM agent package that owns `planning-local` so it becomes the CPU reference path, and remove stale `base-local` expectations. |
| Engine host binding | Prefer engine binding to `0.0.0.0:8080` inside the container with host publish limited to loopback by Ploinky. |
| Engine access route | Ploinky should publish the engine endpoint on a loopback host port for direct OpenAI-compatible inference. Runtime MCP exposes diagnostics and status, not normal inference proxying. |
| Artifact digest scope | Hash final local files where practical; for very large directories, record a deterministic manifest of file names, sizes, mtimes, and selected hashes. |

## Follow-up Specs

- UI for model and launcher management.
- Benchmark and profile selection UX.
- Multi-model concurrent serving.
- Distributed local LLM scheduling.
- Production deployment and image promotion policy.

## Grounding References

- Attached runtime-container requirements from 2026-07-01.
- `ploinky/docs/specs/DS012-local-llm-agent-architecture-catalog.md`.
- `ploinky/docs/specs/DS004-runtime-execution-and-isolation.md`.
- `local-llm-architectures/README.md` and catalog records.
- `container-image-builds/images/llm-runtime-cpu/Dockerfile`.
- `llm-runtime/shared/runtime-agent/*`.
- Current `llm-runtime` tests, especially stale `base-local` expectations.
