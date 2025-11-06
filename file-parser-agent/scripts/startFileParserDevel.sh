#!/bin/sh

# startFileParserDevel.sh - Automate common Ploinky setup for local file-parser runs.
# 1. Adds/enables the repository in the current workspace.
# 2. Enables the file-parser agent.
# 3. Propagates available LLM API keys to the workspace secrets store.
# 4. Starts the agent container.

set -eu

if ! command -v ploinky >/dev/null 2>&1; then
    printf '%s\n' "ploinky CLI is not installed or not on PATH." >&2
    exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

REPO_NAME="${FILE_PARSER_REPO_NAME:-file-parser}"
AGENT_NAME="${FILE_PARSER_AGENT_NAME:-file-parser}"

detect_repo_url() {
    if [ -n "${FILE_PARSER_REPO_URL:-}" ]; then
        printf '%s' "${FILE_PARSER_REPO_URL}"
        return
    fi
    if git -C "${REPO_ROOT}" config --get remote.origin.url >/dev/null 2>&1; then
        git -C "${REPO_ROOT}" config --get remote.origin.url
        return
    fi
    if [ -d "${REPO_ROOT}/.git" ]; then
        printf 'file://%s' "${REPO_ROOT}"
        return
    fi
    printf ''
}

REPO_URL="$(detect_repo_url)"

if [ -z "${REPO_URL}" ]; then
    cat >&2 <<'EOF'
Unable to determine repository URL. Set FILE_PARSER_REPO_URL or configure a git
remote in this checkout so Ploinky can clone the agent into the workspace.
EOF
    exit 1
fi

printf 'Registering repo %s (%s)\n' "${REPO_NAME}" "${REPO_URL}"
ploinky add repo "${REPO_NAME}" "${REPO_URL}"
ploinky enable repo "${REPO_NAME}"
ploinky enable agent "${AGENT_NAME}"

propagate_secret() {
    local var_name="$1"
    local value
    # shellcheck disable=SC2039
    eval "value=\${${var_name}:-}"
    if [ -n "${value}" ]; then
        printf 'Syncing %s from environment\n' "${var_name}"
        ploinky var "${var_name}" "${value}"
    else
        printf 'Skipping %s (not set)\n' "${var_name}"
    fi
}

for secret in OPENAI_API_KEY ANTHROPIC_API_KEY GEMINI_API_KEY MISTRAL_API_KEY DEEPSEEK_API_KEY OPENROUTER_API_KEY LLM_API_KEY LLM_PROVIDER LLM_MODEL; do
    propagate_secret "${secret}"
done

printf '%s\n' "Starting agent ${AGENT_NAME}"
ploinky start "${AGENT_NAME}"
