#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

cd "$ROOT_DIR"

required_files=(
  "README.md"
  "LICENSE"
  "CONTRIBUTING.md"
  "docs/quickstart-paid-tool.md"
  "docs/relationship-guide.md"
  "docs/choose-your-path.md"
  "docs/policy-example.md"
  "docs/export-readiness.md"
  "configs/policy.example.json"
  "configs/claude_desktop_config.example.json"
  "configs/cursor_mcp.example.json"
  "configs/openclaw_mcp.example.json"
  "scripts/verify-starter.sh"
  "examples/controlled-paid-tool/README.md"
)

for file in "${required_files[@]}"; do
  if [[ ! -f "$file" ]]; then
    echo "Missing required export file: $file"
    exit 1
  fi
done

echo "Core export files present."
bash scripts/verify-starter.sh
echo ""
echo "Export check passed."
