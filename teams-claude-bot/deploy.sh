#!/usr/bin/env bash
set -euo pipefail
cd /home/site/wwwroot
echo "Installing production npm dependencies (Linux)..."
npm install --omit=dev --no-audit --no-fund
echo "Linux deploy install complete."
