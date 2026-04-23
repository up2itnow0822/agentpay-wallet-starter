#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

cd "$ROOT_DIR"

echo "agentpay-wallet-starter setup"
echo ""
echo "This scaffold already includes a runnable controlled paid-tool demo."
echo ""
echo "Next steps:"
echo "  1. bash scripts/verify-starter.sh"
echo "  2. node examples/controlled-paid-tool/run_demo.js allowed"
echo "  3. NEMOCLAW_AUTO_APPROVE=yes node examples/controlled-paid-tool/run_demo.js approval"
echo "  4. node examples/controlled-paid-tool/run_demo.js blocked"
