#!/usr/bin/env bash
set -euo pipefail
BASE="$HOME/Documents/lentera_system/lentera-dashboard"
SRC="$(cd "$(dirname "$0")" && pwd)"
if [[ ! -f "$BASE/package.json" || ! -f "$BASE/src/components/DetailMap.tsx" ]]; then
  echo "Folder dashboard tidak ditemukan: $BASE"; exit 1
fi
STAMP="$(date +%Y%m%d-%H%M%S)"
BACKUP="$BASE/lentera-map-backup-$STAMP"
mkdir -p "$BACKUP" "$BASE/src/maps"
for name in RealMap.tsx DetailMap.tsx DetailScreen.tsx; do
  cp "$BASE/src/components/$name" "$BACKUP/$name"
  cp "$SRC/src/components/$name" "$BASE/src/components/$name"
done
cp "$SRC/src/maps/offlineStyle.ts" "$BASE/src/maps/offlineStyle.ts"
echo "Backup: $BACKUP"
echo 'Menjalankan build frontend...'
cd "$BASE"
npm run build
printf '\nSelesai. Jangan jalankan npm run clean.\n'
