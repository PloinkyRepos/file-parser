#!/bin/sh

# installPrerequisites.sh - Ensure system packages required by the file-parser agent are available.
# This variant targets the node:22.20-alpine base image and installs missing packages via apk.

set -eu

REQUIRED_PACKAGES="antiword"

missing_packages=""
for pkg in ${REQUIRED_PACKAGES}; do
    if ! command -v "${pkg}" >/dev/null 2>&1; then
        missing_packages="${missing_packages} ${pkg}"
    fi
done

trimmed_packages="${missing_packages# }"

if [ -z "${trimmed_packages}" ]; then
    printf '%s\n' "All prerequisites already installed (${REQUIRED_PACKAGES})."
    exit 0
fi

if ! command -v apk >/dev/null 2>&1; then
    printf '%s\n' "apk is not available. This script must run inside the node:22.20-alpine image." >&2
    exit 1
fi

SUDO_CMD=""
if [ "$(id -u)" -ne 0 ]; then
    if command -v sudo >/dev/null 2>&1; then
        SUDO_CMD="sudo"
    else
        printf '%s\n' "Root privileges are required. Re-run as root or install sudo." >&2
        exit 1
    fi
fi

run_pkg() {
    if [ -n "${SUDO_CMD}" ]; then
        ${SUDO_CMD} "$@"
    else
        "$@"
    fi
}

printf '%s\n' "Installing packages via apk: ${trimmed_packages}"
run_pkg apk update
run_pkg apk add --no-cache ${trimmed_packages}

printf '%s\n' "Installed prerequisites: ${trimmed_packages}"
