#!/bin/sh
# Everything the pages need, from a fresh clone: the emulator (the v86_64 submodule, built to
# v86_64/build/), the Alpine guest and Bitcoin Core (staged in images/).
#
#   ./scripts/setup.sh [path/to/alpine-virt-3.19.9-x86_64.iso]
#
# The emulator build needs Node.js, Rust with the wasm32-unknown-unknown target, and clang
# (see v86_64/Readme.md); Bitcoin Core's staging needs an x86_64 glibc host.

set -e
cd "$(dirname "$0")/.."
git submodule update --init
make -C v86_64 build/libv86.js build/v86.wasm
./scripts/stage-alpine.sh "$@"
./scripts/stage-bitcoin.sh
echo
echo "ready: ./scripts/serve.sh, then open http://localhost:8000/"
