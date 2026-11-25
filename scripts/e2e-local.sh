#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PORT="${POPLY_ANVIL_PORT:-8547}"

cd "$ROOT"
forge build >/dev/null
anvil --silent --port "$PORT" >"${TMPDIR:-/tmp}/poply-anvil.log" 2>&1 &
ANVIL_PID=$!
trap 'kill "$ANVIL_PID" 2>/dev/null || true' EXIT

for _ in $(seq 1 40); do
  if cast chain-id --rpc-url "http://127.0.0.1:$PORT" >/dev/null 2>&1; then
    POPLY_RPC_URL="http://127.0.0.1:$PORT" npm run demo:local
    exit 0
  fi
  sleep 0.1
done

echo "Anvil did not become ready" >&2
exit 1
