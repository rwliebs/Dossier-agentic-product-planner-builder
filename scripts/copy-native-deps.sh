#!/usr/bin/env bash
# Copy native/wasm dependencies into the Next.js standalone output so the
# published npm package can load them at runtime without a separate install.
#
# Must be run after `next build` (standalone output must already exist).

set -euo pipefail

STANDALONE=".next/standalone/node_modules"

mkdir -p "$STANDALONE"

copy_pkg() {
  local pkg="$1"
  local src="node_modules/$pkg"
  local dest="$STANDALONE/$pkg"

  if [ ! -d "$src" ]; then
    echo "  [copy-native-deps] WARNING: $src not found, skipping"
    return
  fi

  rm -rf "$dest"
  cp -r "$src" "$dest"
  echo "  [copy-native-deps] copied $pkg"
}

echo "[copy-native-deps] Copying native/wasm deps into standalone output..."

# better-sqlite3 and ruvector-core: Do NOT copy — they contain
# platform-specific native binaries. The postinstall script in
# package.json installs them for the user's platform at npm install / npx time.

# ruvector-onnx-embeddings-wasm ships a .wasm file (platform-independent)
copy_pkg "ruvector-onnx-embeddings-wasm"

echo "[copy-native-deps] Done."
