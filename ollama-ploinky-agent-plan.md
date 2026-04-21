# Plan: Ollama Ploinky Agent for Local LLM Serving

This version closes the remaining issues:

- no coarse sentinel
- no misuse of global `prod` / `dev` profiles for model sizing
- no `latest` image tag
- correct `restart` vs `reinstall` semantics
- corrected model names and `127.0.0.1` examples

As of April 16, 2026, Docker Hub shows `ollama/ollama:0.20.7`, so the plan pins that exact tag instead of `latest`.

## Agent Structure

Create `basic/ollama/` with 3 files:

```text
basic/ollama/
  manifest.json
  bootstrap.sh
  healthcheck.sh
```

No extra repo files are required.

## 1. `manifest.json`

```json
{
  "container": "docker.io/ollama/ollama:0.20.7",
  "about": "Ollama local LLM server with OpenAI-compatible API",
  "start": "serve",
  "cli": "ollama",
  "volumes": {
    "ollama/models": "/root/.ollama"
  },
  "health": {
    "readiness": {
      "script": "healthcheck.sh",
      "interval": 5,
      "timeout": 10,
      "failureThreshold": 24
    }
  },
  "profiles": {
    "default": {
      "ports": ["11434:11434"],
      "env": {
        "OLLAMA_HOST": { "default": "0.0.0.0:11434" },
        "OLLAMA_MODELS": { "default": "/root/.ollama/models" },
        "OLLAMA_NUM_PARALLEL": { "default": "1" },
        "OLLAMA_MAX_LOADED_MODELS": { "default": "1" },
        "OLLAMA_KEEP_ALIVE": { "default": "5m" },
        "OLLAMA_DEFAULT_MODEL": { "default": "gemma4:e2b" },
        "OLLAMA_BOOTSTRAP_MODELS": { "required": false, "default": "" },
        "OLLAMA_BOOTSTRAP_ENABLED": { "default": "true" },
        "CUDA_VISIBLE_DEVICES": { "default": "" }
      },
      "postinstall": "sh /code/bootstrap.sh"
    }
  }
}
```

### Key decisions

- `start` stays `serve`, not `ollama serve`, because the image entrypoint already invokes `ollama`.
- The image is pinned to `0.20.7`, not `latest`.
- Only `profiles.default` is used.
  This avoids coupling model size to Ploinky's global environment profiles.
- Host binding remains `127.0.0.1:11434:11434` through Ploinky's normal port behavior.
- The default bootstrap model is intentionally small: `gemma4:e2b`.
  Large models stay opt-in.
- `OLLAMA_BOOTSTRAP_MODELS` is additive.
  It can include models like `qwen3-coder:30b`, `deepseek-r1`, or `gemma4:31b`.
- `OLLAMA_BOOTSTRAP_ENABLED=false` gives a clean escape hatch for slow networks or manual-only installs.

## 2. `bootstrap.sh`

Use reconciliation, not a sentinel.

Behavior:

1. Wait for the local server with `OLLAMA_HOST=127.0.0.1:11434 ollama list`.
2. If `OLLAMA_BOOTSTRAP_ENABLED` is false, exit successfully.
3. Build the desired model set as:

```text
union(
  OLLAMA_DEFAULT_MODEL,
  comma_split(OLLAMA_BOOTSTRAP_MODELS)
)
```

4. Normalize:
- trim whitespace
- drop empties
- deduplicate

5. Read currently installed models from `ollama list`.
6. Pull only missing models.
7. Never auto-remove models.
8. Exit `0` even if some pulls fail, but print clear warnings.

### Shell shape

```sh
#!/bin/sh
set -eu

HOST="127.0.0.1:11434"

wait_for_ollama() {
  i=0
  while [ "$i" -lt 30 ]; do
    if OLLAMA_HOST="$HOST" ollama list >/dev/null 2>&1; then
      return 0
    fi
    i=$((i + 1))
    sleep 1
  done
  echo "[bootstrap] Ollama did not become ready in time."
  return 1
}

if ! wait_for_ollama; then
  exit 0
fi

case "${OLLAMA_BOOTSTRAP_ENABLED:-true}" in
  false|FALSE|0|no|NO)
    echo "[bootstrap] Automatic bootstrap disabled."
    exit 0
    ;;
esac

DESIRED="$(printf '%s\n%s\n' \
  "${OLLAMA_DEFAULT_MODEL:-}" \
  "$(printf '%s' "${OLLAMA_BOOTSTRAP_MODELS:-}" | tr ',' '\n')")"

INSTALLED="$(OLLAMA_HOST="$HOST" ollama list 2>/dev/null | awk 'NR > 1 {print $1}')"

echo "$DESIRED" | awk 'NF {gsub(/^[ \t]+|[ \t]+$/, ""); if (!seen[$0]++) print $0}' | while read -r model; do
  echo "$INSTALLED" | grep -Fxq "$model" && {
    echo "[bootstrap] Present: $model"
    continue
  }

  echo "[bootstrap] Pulling missing model: $model"
  OLLAMA_HOST="$HOST" ollama pull "$model" || echo "[bootstrap] WARNING: failed to pull $model"
done

echo "[bootstrap] Reconciliation complete."
```

### Why this fixes the earlier issues

- Changing `OLLAMA_DEFAULT_MODEL` or `OLLAMA_BOOTSTRAP_MODELS` works on the next `reinstall`.
- Partial failures are retried later, because no sentinel suppresses future attempts.
- Existing models are not re-downloaded.
- User-downloaded models are preserved, because reconciliation is additive only.

## 3. `healthcheck.sh`

```sh
#!/bin/sh
OLLAMA_HOST=127.0.0.1:11434 ollama list >/dev/null 2>&1
```

This keeps the probe curl-free and matches the minimal runtime image.

## 4. GPU Support

Ship this agent as CPU-first.

Current plan:

- `CUDA_VISIBLE_DEVICES=""` by default
- no GPU-specific profile
- no claim that env vars alone enable GPU

Future GPU enablement should be a separate Ploinky enhancement:

- add a manifest-level `devices` or `gpus` field in Ploinky runtime code
- then optionally introduce a separate GPU-oriented agent variant or documented override path

That keeps this agent correct today and reusable later.

## 5. Usage

```bash
# Enable and start
ploinky enable agent basic/ollama
ploinky start

# Inspect installed models
ploinky cli ollama list

# Pull models manually
ploinky cli ollama pull qwen3-coder:30b
ploinky cli ollama pull deepseek-r1
ploinky cli ollama pull gemma4:31b

# Add models to the bootstrap set, then recreate the container so postinstall runs again
ploinky var OLLAMA_BOOTSTRAP_MODELS "gemma4:e2b,qwen3-coder:30b,deepseek-r1"
ploinky reinstall agent ollama

# Disable automatic pulls entirely
ploinky var OLLAMA_BOOTSTRAP_ENABLED false
ploinky reinstall agent ollama

# Test the OpenAI-compatible API
curl -H "Content-Type: application/json" \
  http://127.0.0.1:11434/v1/chat/completions \
  -d '{"model":"gemma4:e2b","messages":[{"role":"user","content":"hello"}]}'
```

## 6. Verification

1. `ploinky enable agent basic/ollama && ploinky start`
   Expect server readiness to pass and `ploinky cli ollama list` to show `gemma4:e2b`.

2. `ploinky restart ollama`
   Expect a fast warm restart with the same models still present.
   This verifies persistent storage across stop/start.

3. `ploinky var OLLAMA_BOOTSTRAP_MODELS "gemma4:e2b,qwen3-coder:30b" && ploinky reinstall agent ollama`
   Expect bootstrap to skip `gemma4:e2b` and pull only `qwen3-coder:30b`.

4. Remove a model from `OLLAMA_BOOTSTRAP_MODELS` and reinstall again.
   Expect no deletion.
   Model removal remains an explicit user action via `ploinky cli ollama rm ...`.

5. Call `http://127.0.0.1:11434/v1/chat/completions`
   Expect a normal OpenAI-compatible chat completion response.

## References

- Ploinky profile/runtime behavior: [profileService.js](/Users/danielsava/work/file-parser/ploinky/cli/services/profileService.js), [agentServiceManager.js](/Users/danielsava/work/file-parser/ploinky/cli/services/docker/agentServiceManager.js), [cli.js](/Users/danielsava/work/file-parser/ploinky/cli/commands/cli.js)
- Ollama Docker image tags: https://hub.docker.com/r/ollama/ollama/tags
- Ollama OpenAI compatibility: https://docs.ollama.com/api/openai-compatibility
- Gemma 4 library page: https://ollama.com/library/gemma4
- Qwen3-Coder library page: https://ollama.com/library/qwen3-coder:30b
- DeepSeek-R1 library page: https://ollama.com/library/deepseek-r1
