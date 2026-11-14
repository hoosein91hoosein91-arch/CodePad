#!/bin/sh
set -eu
cd "$(dirname "$0")"
if curl -fsS http://127.0.0.1:8080/ >/dev/null 2>&1; then exit 0; fi
npm run dev > /tmp/codepad-preview.log 2>&1 &
