# llms.axiologic.dev Deployment Summary

## Scope

This document summarizes the work completed to deploy and expose a local Ollama-based LLM endpoint on the remote Ubuntu 22.04 machine.

The final public endpoint is:

- `https://llms.axiologic.dev`

The deployment ended up being a **direct Ollama + cloudflared setup**, not a full Ploinky deployment on the remote machine.

## Local Workspace Changes

Created local access notes in the current workspace:

- `CLAUDE.md`
- `AGENTS.md`

These files contain remote access information and should not be committed.

## Remote Machine

Remote host used:

- SSH target: `ubuntu@192.168.254.37`
- OS: Ubuntu 22.04

Observed hardware during deployment:

- RAM: about `122 GiB`
- GPU: `NVIDIA A40-6Q`
- Available VRAM slice: about `6 GiB`

## Remote Directory Layout

Created and used:

- `/home/ubuntu/gemma4`
- `/home/ubuntu/gemma4/bin`
- `/home/ubuntu/gemma4/logs`

Important note:

- the actual Ollama model store currently in use is `/usr/share/ollama/.ollama/models`
- `/home/ubuntu/gemma4/models` was created early, but the working deployment now uses the default Ollama store because that is where the pulled models were actually present

## Ollama Installation

Installed Ollama on the remote host and enabled it as a `systemd` service.

Verified:

- local API health on `http://127.0.0.1:11434`
- OpenAI-compatible chat endpoint at `/v1/chat/completions`
- model listing endpoint at `/api/tags`

## Cloudflare Tunnel

### Initial state

Installed `cloudflared` on the remote machine and first exposed Ollama with a temporary quick tunnel.

### Final state

Switched the machine to a named Cloudflare Tunnel using the provided tunnel token and ran it as a persistent `systemd` service.

Current public hostname:

- `llms.axiologic.dev`

Important dashboard-side fix that was required:

- the tunnel route needed `HTTP Host Header = localhost:11434`

Without that override, Ollama returned `403 Forbidden` because of host/origin validation.

## Browser-Origin Fix

Configured Ollama to allow browser-origin requests from:

- `https://llms.axiologic.dev`

This was done by setting `OLLAMA_ORIGINS` in the `ollama` `systemd` override.

Verified behavior:

- requests with `Origin: https://llms.axiologic.dev` now return:
  - `Access-Control-Allow-Origin: https://llms.axiologic.dev`

## Model Work

### `gemma4:31b`

Pulled and verified `gemma4:31b`.

Initial result:

- model loaded
- local completions worked

Problem discovered later:

- on this machine, `gemma4:31b` was unstable in mixed CPU/GPU mode
- Ollama runner crashed with `exit status 2`
- Cloudflare requests surfaced this as `500` / `502`

Cause:

- the host only has a `6 GiB` virtual GPU slice
- `gemma4:31b` is too large to be a good fit for partial GPU offload here

### Stability fix

Switched Ollama to **CPU-only** mode by setting:

- `CUDA_VISIBLE_DEVICES=`

Also tightened runtime limits:

- `OLLAMA_NUM_PARALLEL=1`
- `OLLAMA_MAX_LOADED_MODELS=1`
- `OLLAMA_MAX_QUEUE=1`

After that change, the remote service became stable again.

### `gemma4:e4b`

Pulled `gemma4:e4b` on the remote machine as the better practical model for this host.

Verified:

- local completion succeeded
- `ollama ps` showed:
  - `gemma4:e4b`
  - `PROCESSOR 100% CPU`

## Current Ollama Runtime Configuration

The active `systemd` override now effectively sets:

- `OLLAMA_MODELS=/usr/share/ollama/.ollama/models`
- `OLLAMA_KEEP_ALIVE=10m`
- `OLLAMA_NUM_PARALLEL=1`
- `OLLAMA_MAX_LOADED_MODELS=1`
- `OLLAMA_MAX_QUEUE=1`
- `CUDA_VISIBLE_DEVICES=`
- `OLLAMA_ORIGINS=... ,https://llms.axiologic.dev`

## Current Installed Models

Installed on the server now:

- `gemma4:e4b`
- `gemma4:31b`

Recommended default for this machine:

- `gemma4:e4b`

Reason:

- significantly better fit for CPU-only inference on this host
- more stable than `gemma4:31b`

## Current Endpoint Usage

List models:

```bash
curl https://llms.axiologic.dev/api/tags
```

Run `gemma4:e4b`:

```bash
curl -H "Content-Type: application/json" \
  https://llms.axiologic.dev/v1/chat/completions \
  -d '{"model":"gemma4:e4b","messages":[{"role":"user","content":"hello"}]}'
```

Run `gemma4:31b`:

```bash
curl -H "Content-Type: application/json" \
  https://llms.axiologic.dev/v1/chat/completions \
  -d '{"model":"gemma4:31b","messages":[{"role":"user","content":"hello"}]}'
```

Pull another model on the remote machine:

```bash
ssh -i /Users/danielsava/Downloads/raas/info-llm ubuntu@192.168.254.37
OLLAMA_HOST=127.0.0.1:11434 ollama pull <model>
```

## Useful Remote Commands

SSH:

```bash
ssh -i /Users/danielsava/Downloads/raas/info-llm ubuntu@192.168.254.37
```

Check services:

```bash
sudo systemctl status ollama --no-pager
sudo systemctl status cloudflared --no-pager
```

List models:

```bash
OLLAMA_HOST=127.0.0.1:11434 ollama list
```

Show loaded models:

```bash
OLLAMA_HOST=127.0.0.1:11434 ollama ps
```

Recent logs:

```bash
journalctl -u ollama -n 100 --no-pager
journalctl -u cloudflared -n 100 --no-pager
```

## Known Notes

- Browser access to `https://llms.axiologic.dev` is working.
- The root path returns `Ollama is running`.
- The public API is available through Cloudflare Tunnel, not through a public open port on `11434`.
- The Ollama service itself listens only on `127.0.0.1:11434`.
- A local macOS DNS mismatch was observed during testing where browser resolution worked before `curl` resolution did; that was a client-side resolver issue, not a remote deployment issue.

## Final Status

Completed:

- remote Ollama installation
- Cloudflare Tunnel setup for `llms.axiologic.dev`
- host-header fix for tunnel routing
- allowed-origin fix for browser requests
- CPU-only stability fix
- `gemma4:e4b` pull and verification
- successful public inference through `llms.axiologic.dev`

Best current practical model for this host:

- `gemma4:e4b`
