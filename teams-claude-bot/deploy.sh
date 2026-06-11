#!/usr/bin/env bash
set -euo pipefail
cd /home/site/wwwroot
# Prevent Oryx or leftover src from recompiling stale code over prebuilt dist/.
rm -rf src
echo "Installing production npm dependencies (Linux)..."
npm install --omit=dev --no-audit --no-fund
echo "Deployed dist build tag:"
grep -o 'build: "[^"]*"' dist/index.js || true
echo "Linux deploy install complete."
