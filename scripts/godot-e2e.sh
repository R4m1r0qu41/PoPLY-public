#!/usr/bin/env bash
# Headless Godot sample integration test: boots the publisher verifier API with a throwaway
# key/state, copies the poply addon into the sample project, and runs the sample scene, which
# must obtain a signed checkpoint (201) and a structured 409 on sequence replay. No chain is
# involved — the verifier signs off-chain, which is exactly the surface an engine adapter uses.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SAMPLE="$ROOT/sdk/engines/godot/sample"
ADDON_SRC="$ROOT/sdk/engines/godot/addons/poply"

GODOT_BIN="${GODOT_BIN:-}"
if [[ -z "$GODOT_BIN" ]]; then
  if command -v godot >/dev/null 2>&1; then
    GODOT_BIN="$(command -v godot)"
  elif [[ -x "/Applications/Godot.app/Contents/MacOS/Godot" ]]; then
    GODOT_BIN="/Applications/Godot.app/Contents/MacOS/Godot"
  else
    echo "godot binary not found; install Godot 4 or set GODOT_BIN" >&2
    exit 1
  fi
fi

WORK="$(mktemp -d)"
PORT="${POPLY_PORT:-8790}"
SERVER_PID=""
cleanup() {
  [[ -n "$SERVER_PID" ]] && kill "$SERVER_PID" 2>/dev/null || true
  rm -rf "$WORK" "$SAMPLE/addons" "$SAMPLE/.godot"
}
trap cleanup EXIT

# The addon ships once under sdk/engines/godot/addons; the sample consumes a copy so the
# project is self-contained when opened in the editor. The copy is transient and ignored.
mkdir -p "$SAMPLE/addons"
cp -R "$ADDON_SRC" "$SAMPLE/addons/poply"

# Anvil's well-known dev key: throwaway, local-only, never a real secret.
POPLY_VERIFIER_PRIVATE_KEY="0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80" \
POPLY_STATE_REGISTRY="0x2000000000000000000000000000000000000002" \
POPLY_PUBLISHER_API_KEY="godot-sample-local-api-key" \
POPLY_CHAIN_ID="31337" \
POPLY_GAME_IDS="0xa807d4d4c73f90fd24fd4dfb0a08e70a249e6c267fa0ad4f9a735d2ca1059393" \
POPLY_PORT="$PORT" \
POPLY_STATE_FILE="$WORK/verifier-state.json" \
node "$ROOT/backend/src/server.ts" &
SERVER_PID=$!

for _ in $(seq 1 50); do
  if curl -sf "http://127.0.0.1:$PORT/health" >/dev/null 2>&1; then break; fi
  sleep 0.2
done
curl -sf "http://127.0.0.1:$PORT/health" >/dev/null || {
  echo "publisher verifier did not become healthy" >&2
  exit 1
}

# First pass imports project resources; second pass runs the scene.
"$GODOT_BIN" --headless --path "$SAMPLE" --import >/dev/null 2>&1 || true
POPLY_BASE_URL="http://127.0.0.1:$PORT" \
POPLY_PUBLISHER_API_KEY="godot-sample-local-api-key" \
"$GODOT_BIN" --headless --path "$SAMPLE"

echo "godot sample integration passed"
