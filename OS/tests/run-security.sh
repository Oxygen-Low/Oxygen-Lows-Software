#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
binary="$(mktemp /tmp/oxygen-security.XXXXXX)"
trap 'rm -f "$binary"' EXIT
g++ -std=c++17 -Wall -Wextra -fsanitize=address,undefined -fno-omit-frame-pointer -fno-sanitize-recover=all -I include tests/security.cpp src/mm/heap.cpp src/fs/fat32.cpp src/fs/vfs.cpp -o "$binary"
"$binary"
