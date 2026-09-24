#!/usr/bin/env bash
# ==============================================================================
# Oxygen Low's Software — Automated VirtualBox VM Creation & Tuning Script
# Operating System: Linux / macOS (Freestanding C++17 Kernel Target)
# ==============================================================================
set -e

VM_NAME="OxygenLowsSoftware"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ISO_PATH="${SCRIPT_DIR}/OxygenLowsSoftware.iso"
SERIAL_LOG="${SCRIPT_DIR}/vbox_serial.log"

echo "=============================================================================="
echo " Oxygen Low's Software — VirtualBox VM Configuration & Deployment Engine"
echo "=============================================================================="
echo ""

# 1. Locate VBoxManage executable
VBOXMANAGE=""
if command -v VBoxManage >/dev/null 2>&1; then
    VBOXMANAGE="VBoxManage"
elif [ -x "/c/Program Files/Oracle/VirtualBox/VBoxManage.exe" ]; then
    VBOXMANAGE="/c/Program Files/Oracle/VirtualBox/VBoxManage.exe"
elif [ -x "/mnt/c/Program Files/Oracle/VirtualBox/VBoxManage.exe" ]; then
    VBOXMANAGE="/mnt/c/Program Files/Oracle/VirtualBox/VBoxManage.exe"
fi

if [ -z "$VBOXMANAGE" ]; then
    echo "[-] ERROR: Oracle VM VirtualBox (VBoxManage) could not be found!"
    echo "[*] Please verify VirtualBox is installed and added to PATH."
    echo "[*] Download VirtualBox: https://www.virtualbox.org/wiki/Downloads"
    echo ""
    exit 1
fi

echo "[+] Located VirtualBox CLI: ${VBOXMANAGE}"

# 2. Verify ISO Image Existence
if [ ! -f "${ISO_PATH}" ]; then
    echo "[-] ERROR: Target kernel ISO '${ISO_PATH}' was not found!"
    echo "[*] Please build the kernel and ISO first using 'make iso'."
    echo ""
    exit 1
fi
echo "[+] Kernel ISO image confirmed: ${ISO_PATH}"

# 3. Clean up existing VM if present
echo "[*] Checking for existing VirtualBox VM '${VM_NAME}'..."
if "${VBOXMANAGE}" showvminfo "${VM_NAME}" >/dev/null 2>&1; then
    echo "[*] Existing VM '${VM_NAME}' detected. Powering off and removing..."
    "${VBOXMANAGE}" controlvm "${VM_NAME}" poweroff >/dev/null 2>&1 || true
    sleep 1
    "${VBOXMANAGE}" unregistervm "${VM_NAME}" --delete >/dev/null 2>&1 || true
    echo "[+] Previous VM registration removed."
fi

# 4. Create New Virtual Machine
echo "[*] Registering new 64-bit Virtual Machine: '${VM_NAME}'..."
"${VBOXMANAGE}" createvm --name "${VM_NAME}" --ostype "Other_64" --register

# 5. Apply Optimized Hardware Tuning for Oxygen Low's Software
echo "[*] Applying hardware tuning (PAT VRAM, HPET, ACPI, COM1, Absolute Mouse)..."
"${VBOXMANAGE}" modifyvm "${VM_NAME}" \
    --cpus 1 \
    --memory 512 \
    --vram 64 \
    --graphicscontroller vboxvga \
    --accelerate2dvideo on \
    --mouse usbtablet \
    --keyboard ps2 \
    --acpi on \
    --ioapic on \
    --hpet on \
    --rtcuseutc on \
    --audio-controller none \
    --nic1 nat \
    --nictype1 82540EM \
    --uart1 0x3F8 4 \
    --uartmode1 file "${SERIAL_LOG}"

# 6. Attach IDE Storage Controller and ISO Medium
echo "[*] Configuring IDE storage controller and mounting CD-ROM..."
"${VBOXMANAGE}" storagectl "${VM_NAME}" --name "IDE Controller" --add ide --controller PIIX4 --bootable on

"${VBOXMANAGE}" storageattach "${VM_NAME}" \
    --storagectl "IDE Controller" \
    --port 0 \
    --device 0 \
    --type dvddrive \
    --medium "${ISO_PATH}"

echo ""
echo "=============================================================================="
echo "[+] VirtualBox VM '${VM_NAME}' created and tuned successfully!"
echo "[*] Hardware Profile:"
echo "    - Architecture:        x86_64 (Other_64)"
echo "    - Memory / VRAM:       512 MB RAM / 64 MB VRAM (Write-Combining PAT)"
echo "    - Display Adapter:     VBoxVGA (Dynamic VBE Dispi 1024x768 / 1280x720)"
echo "    - Pointing Device:     Absolute Mouse Integration (VMMDev 0x80EE:0xCAFE)"
echo "    - Timers / Power:      HPET Drift Compensation, ACPI S5 Clean Poweroff"
echo "    - Serial Debug Port:   COM1 redirected to ${SERIAL_LOG}"
echo "=============================================================================="
echo ""

read -r -p "Do you want to start the VirtualBox VM now? (y/N): " START_CHOICE
if [[ "$START_CHOICE" =~ ^[Yy]$ ]]; then
    echo "[*] Starting '${VM_NAME}'..."
    "${VBOXMANAGE}" startvm "${VM_NAME}"
else
    echo "[*] You can start the VM anytime via:"
    echo "    ${VBOXMANAGE} startvm \"${VM_NAME}\""
fi
