#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

cd "$ROOT_DIR"

if ! command -v node >/dev/null 2>&1; then
  echo "Node is required but was not found in PATH."
  exit 1
fi

echo "Verifying controlled paid-tool starter lane..."
node examples/controlled-paid-tool/validate_demo.js

echo ""
echo "Starter verification passed."
