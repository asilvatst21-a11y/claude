#!/bin/bash
set -euo pipefail

if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  exit 0
fi

install_if_needed() {
  local dir="$1"
  if [ -f "$CLAUDE_PROJECT_DIR/$dir/package.json" ]; then
    echo "Installing deps: $dir"
    cd "$CLAUDE_PROJECT_DIR/$dir"
    npm install
  fi
}

install_if_needed fastfood-gestao
install_if_needed golnet
install_if_needed matriculas-whatsapp
install_if_needed safety-dashboard-next
install_if_needed safety-dashboard
install_if_needed vales-log20
