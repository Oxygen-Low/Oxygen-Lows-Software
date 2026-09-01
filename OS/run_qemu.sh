#!/usr/bin/env bash
# Oxygen Low's Software — Interactive QEMU Launcher (Linux / macOS / WSL)
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ISO_PATH="${SCRIPT_DIR}/OxygenLowsSoftware.iso"

if [ ! -f "${ISO_PATH}" ]; then
    echo "[*] Building Oxygen Low's Software ISO image..."
    make -C "${SCRIPT_DIR}" iso
fi

echo "=================================================="
echo " Launching Oxygen Low's Software in QEMU"
echo " Image: ${ISO_PATH}"
echo " Display: 1024x768 Standard VGA"
echo " Serial: stdio"
echo "=================================================="

qemu-system-x86_64 \
    -cdrom "${ISO_PATH}" \
    -m 256M \
    -serial stdio \
    -vga std \
    -boot d
