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
    if command -v dnf >/dev/null 2>&1; then
        PKG_MGR="dnf"
    elif command -v yum >/dev/null 2>&1; then
        PKG_MGR="yum"
    elif command -v apt-get >/dev/null 2>&1; then
        PKG_MGR="apt-get"
    else
        printf '%s\n' "Warning: No supported package manager found. Missing packages: ${trimmed_packages}" >&2
        printf '%s\n' "Install them manually on the host if needed." >&2
        exit 0
    fi
else
    PKG_MGR="apk"
fi

SUDO_CMD=""
if [ "$(id -u)" -ne 0 ]; then
    if command -v sudo >/dev/null 2>&1 && sudo -n true 2>/dev/null; then
        SUDO_CMD="sudo"
    else
        printf '%s\n' "Warning: Cannot install packages (no root/sudo). Missing: ${trimmed_packages}" >&2
        printf '%s\n' "Install them on the host if needed. Continuing without them." >&2
        exit 0
    fi
fi

run_pkg() {
    if [ -n "${SUDO_CMD}" ]; then
        ${SUDO_CMD} "$@"
    else
        "$@"
    fi
}

printf '%s\n' "Installing packages via ${PKG_MGR}: ${trimmed_packages}"
case "${PKG_MGR}" in
    apk)
        run_pkg apk update
        run_pkg apk add --no-cache ${trimmed_packages}
        ;;
    dnf|yum)
        run_pkg ${PKG_MGR} install -y ${trimmed_packages}
        ;;
    apt-get)
        run_pkg apt-get update
        run_pkg apt-get install -y ${trimmed_packages}
        ;;
esac

printf '%s\n' "Installed prerequisites: ${trimmed_packages}"
