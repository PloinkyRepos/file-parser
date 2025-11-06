#!/bin/sh

# installPrerequisites.sh - Ensure system packages required by the file-parser agent are available.
# This script focuses on dependencies that are not bundled with Node.js modules, such as antiword
# for legacy .doc ingestion. It supports Debian/Ubuntu (apt) and Alpine (apk) based containers.

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

ensure_privileged() {
    if [ "$(id -u)" -eq 0 ]; then
        echo ""
        return
    fi
    if command -v sudo >/dev/null 2>&1; then
        echo "sudo"
        return
    fi
    printf '%s\n' "Root privileges are required. Re-run as root or install sudo." >&2
    exit 1
}

SUDO_CMD="$(ensure_privileged)"

run_pkg() {
    if [ -n "${SUDO_CMD}" ]; then
        ${SUDO_CMD} "$@"
    else
        "$@"
    fi
}

if command -v apt-get >/dev/null 2>&1; then
    printf '%s\n' "Installing packages via apt-get: ${trimmed_packages}"
    run_pkg apt-get update -y
    run_pkg apt-get install -y --no-install-recommends ${trimmed_packages}
elif command -v apk >/dev/null 2>&1; then
    printf '%s\n' "Installing packages via apk: ${trimmed_packages}"
    run_pkg apk update
    run_pkg apk add --no-cache ${trimmed_packages}
else
    printf '%s\n' "Unsupported package manager. Install these packages manually: ${trimmed_packages}" >&2
    exit 1
fi

printf '%s\n' "Installed prerequisites: ${trimmed_packages}"
