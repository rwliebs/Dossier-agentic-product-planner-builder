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

# Native SQLite addon
copy_pkg "better-sqlite3"

# ruvector-core ships a platform-specific .node binary inside its own
# nested node_modules (e.g. ruvector-core-darwin-arm64). Copy the whole tree.
copy_pkg "ruvector-core"

# ruvector-onnx-embeddings-wasm ships a .wasm file
copy_pkg "ruvector-onnx-embeddings-wasm"

echo "[copy-native-deps] Done."
