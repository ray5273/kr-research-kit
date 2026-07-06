#!/usr/bin/env sh
set -eu

TARGET_PATH="${1:-${SKILL_INSTALL_TARGET:-}}"
SOURCE_PATH="${SKILL_INSTALL_SOURCE:-}"

if [ -z "$TARGET_PATH" ] || [ -z "$SOURCE_PATH" ]; then
    echo "Usage: post-install.sh <target-skill-path>" >&2
    exit 1
fi

REPO_ROOT=$(CDPATH= cd -- "$SOURCE_PATH/../.." && pwd)

mkdir -p "$TARGET_PATH/scripts/lib"
cp "$REPO_ROOT/scripts/send-telegram.js" "$TARGET_PATH/scripts/send-telegram.js"
cp "$REPO_ROOT/scripts/lib/telegram.js" "$TARGET_PATH/scripts/lib/telegram.js"

chmod +x "$TARGET_PATH/scripts/send-telegram.js"
