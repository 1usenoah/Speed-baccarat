#!/bin/sh
# quick dev loop: build + screenshots. usage: SHOTS='[...]' tests/dev.sh
set -e
export PATH=/workspace/tools/node-v22.14.0-linux-x64/bin:$PATH
export LD_LIBRARY_PATH=/workspace/work/libs:/workspace/syslibs/root/usr/lib/x86_64-linux-gnu
cd /workspace/projects/speed-baccarat
npx vite build > tests/build.log 2>&1 || (tail -40 tests/build.log; exit 1)
SHOTS="${1:-$SHOTS}" node tests/shots.mjs
