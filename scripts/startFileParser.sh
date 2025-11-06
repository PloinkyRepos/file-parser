#!/bin/sh

# startFileParser.sh - Convenience wrapper for running the process_documents tool locally.
# Loads secrets exported via `ploinky var` (from .ploinky/.secrets) and pipes a JSON
# payload into the Node entrypoint so developers can reproduce router calls outside
# the container runtime.

set -eu

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

INITIAL_WORKSPACE_DIR="${PLOINKY_WORKSPACE_DIR:-$(pwd)}"

find_workspace_root() {
    local current="$1"
    while [ -n "${current}" ] && [ "${current}" != "/" ]; do
        if [ -d "${current}/.ploinky" ]; then
            printf '%s' "${current}"
            return 0
        fi
        local parent
        parent="$(dirname "${current}")"
        if [ "${parent}" = "${current}" ]; then
            break
        fi
        current="${parent}"
    done
    printf '%s' "$1"
}

WORKSPACE_DIR="$(find_workspace_root "${INITIAL_WORKSPACE_DIR}")"
SECRETS_FILE="${WORKSPACE_DIR}/.ploinky/.secrets"
TOOL_ENTRY="${REPO_ROOT}/src/tools/process-documents.mjs"

DEBUG="${DEBUG:-0}"

debug_log() {
    if [ "${DEBUG}" = "1" ]; then
        printf '[startFileParser] %s\n' "$*" >&2
    fi
}

if [ ! -f "${TOOL_ENTRY}" ]; then
    printf '%s\n' "Could not find process-documents entrypoint at ${TOOL_ENTRY}" >&2
    exit 1
fi

export NODE_NO_WARNINGS="${NODE_NO_WARNINGS:-1}"

read_secret() {
    local var_name="$1"
    if [ -f "${SECRETS_FILE}" ]; then
        local value
        value="$(grep "^${var_name}=" "${SECRETS_FILE}" 2>/dev/null | head -n 1 | cut -d'=' -f2-)"
        if [ -n "${value}" ]; then
            debug_log "Loaded ${var_name} from secrets"
        fi
        printf '%s' "${value}"
    fi
}

export_from_secrets() {
    local var_name="$1"
    local current_value
    # shellcheck disable=SC2039
    eval "current_value=\${${var_name}:-}"
    if [ -z "${current_value}" ]; then
        local secret_value
        secret_value="$(read_secret "${var_name}")"
        if [ -n "${secret_value}" ]; then
            export "${var_name}=${secret_value}"
        fi
    fi
}

ENV_VARS="OPENAI_API_KEY ANTHROPIC_API_KEY GEMINI_API_KEY MISTRAL_API_KEY DEEPSEEK_API_KEY OPENROUTER_API_KEY LLM_API_KEY LLM_PROVIDER LLM_MODEL WORKSPACE_PATH"

for var in ${ENV_VARS}; do
    export_from_secrets "${var}"
done

if [ -z "${WORKSPACE_PATH:-}" ]; then
    export WORKSPACE_PATH="${WORKSPACE_DIR}"
fi

usage() {
    cat <<'EOF'
Usage: scripts/startFileParser.sh <payload.json|->

Provide a JSON payload matching the process_documents schema. Passing '-' reads from STDIN.
Environment variables are loaded from the closest .ploinky/.secrets file if present.
Set DEBUG=1 for verbose logging.
EOF
}

if [ "$#" -lt 1 ]; then
    usage >&2
    exit 64
fi

PAYLOAD_SOURCE="$1"
shift || true

if [ "${DEBUG}" = "1" ]; then
    debug_log "Workspace=${WORKSPACE_DIR}"
    debug_log "Secrets=${SECRETS_FILE}"
    debug_log "Payload=${PAYLOAD_SOURCE}"
    debug_log "Forwarding Node args: $*"
fi

if [ "${PAYLOAD_SOURCE}" != "-" ] && [ ! -f "${PAYLOAD_SOURCE}" ]; then
    printf '%s\n' "Payload file not found: ${PAYLOAD_SOURCE}" >&2
    exit 66
fi

NODE_CMD="node"

if [ "${PAYLOAD_SOURCE}" = "-" ]; then
    exec "${NODE_CMD}" --no-warnings "${TOOL_ENTRY}" "$@"
else
    exec "${NODE_CMD}" --no-warnings "${TOOL_ENTRY}" "$@" < "${PAYLOAD_SOURCE}"
fi
