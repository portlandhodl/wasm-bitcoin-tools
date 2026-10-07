#!/bin/sh
# Serves the repository with range requests (which the emulator uses to stream the ISO):
#   ./scripts/serve.sh [--port 8000] [--host 0.0.0.0]
cd "$(dirname "$0")/.."
exec node v86_64/tools/serve.mjs --root . "$@"
