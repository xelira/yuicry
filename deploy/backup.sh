#!/bin/bash
set -euo pipefail

DB="/var/lib/yuicry/yuicry.db"
DIR="/var/backups/yuicry"
KEEP=7

mkdir -p "$DIR"
chmod 700 "$DIR"

STAMP="$(date +%Y%m%d-%H%M%S)"
TARGET="$DIR/yuicry-$STAMP.db"

sqlite3 "$DB" ".backup '$TARGET'"
chmod 600 "$TARGET"

ls -1t "$DIR"/yuicry-*.db | tail -n +$((KEEP + 1)) | xargs -r rm -f

echo "backup: $TARGET"
