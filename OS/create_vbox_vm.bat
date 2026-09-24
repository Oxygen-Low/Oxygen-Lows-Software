@echo off
REM ==============================================================================
REM Oxygen Low's Software — Automated VirtualBox VM Creation & Tuning Script
REM Operating System: Windows (Freestanding C++17 Kernel Target)
REM ==============================================================================
setlocal enabledelayedexpansion

set VM_NAME=OxygenLowsSoftware
set SCRIPT_DIR=%~dp0
set ISO_PATH=%SCRIPT_DIR%OxygenLowsSoftware.iso
set SERIAL_LOG=%SCRIPT_DIR%vbox_serial.log

echo ==============================================================================
echo  Oxygen Low's Software — VirtualBox VM Configuration & Deployment Engine
echo ==============================================================================
echo.

REM 1. Locate VBoxManage executable
set VBOXMANAGE=
where VBoxManage.exe >nul 2>nul
if %errorlevel% equ 0 (
    set VBOXMANAGE=VBoxManage.exe
) else if exist "C:\Program Files\Oracle\VirtualBox\VBoxManage.exe" (
    set VBOXMANAGE="C:\Program Files\Oracle\VirtualBox\VBoxManage.exe"
) else if exist "C:\Program Files (x86)\Oracle\VirtualBox\VBoxManage.exe" (
    set VBOXMANAGE="C:\Program Files (x86)\Oracle\VirtualBox\VBoxManage.exe"
)

if "%VBOXMANAGE%"=="" (
    echo [-] ERROR: Oracle VM VirtualBox (VBoxManage.exe) could not be found!
    echo [*] Please verify VirtualBox is installed at "C:\Program Files\Oracle\VirtualBox\"
    echo     or add VirtualBox to your system PATH.
    echo [*] Download VirtualBox: https://www.virtualbox.org/wiki/Downloads
    echo.
    pause
    exit /b 1
)

echo [+] Located VirtualBox CLI: %VBOXMANAGE%

REM 2. Verify ISO Image Existence
if not exist "%ISO_PATH%" (
    echo [-] ERROR: Target kernel ISO '%ISO_PATH%' was not found!
    echo [*] Please build the kernel and ISO first using 'make iso'.
    echo.
    pause
    exit /b 1
)
echo [+] Kernel ISO image confirmed: %ISO_PATH%

REM 3. Clean up existing VM if present
echo [*] Checking for existing VirtualBox VM '%VM_NAME%'...
%VBOXMANAGE% showvminfo "%VM_NAME%" >nul 2>nul
if %errorlevel% equ 0 (
    echo [*] Existing VM '%VM_NAME%' detected. Powering off and removing...
    %VBOXMANAGE% controlvm "%VM_NAME%" poweroff >nul 2>nul
    timeout /t 1 >nul
    %VBOXMANAGE% unregistervm "%VM_NAME%" --delete
    if %errorlevel% neq 0 (
        echo [-] Warning: Failed to cleanly delete old VM registration.
    ) else (
        echo [+] Previous VM registration successfully removed.
    )
)

REM 4. Create New Virtual Machine
echo [*] Registering new 64-bit Virtual Machine: '%VM_NAME%'...
%VBOXMANAGE% createvm --name "%VM_NAME%" --ostype "Other_64" --register
if %errorlevel% neq 0 (
    echo [-] ERROR: Failed to register virtual machine.
    pause
    exit /b 1
)

REM 5. Apply Optimized Hardware Tuning for Oxygen Low's Software
echo [*] Applying hardware tuning (PAT VRAM, HPET, ACPI, COM1, Absolute Mouse)...
%VBOXMANAGE% modifyvm "%VM_NAME%" ^
    --cpus 1 ^
    --memory 512 ^
    --vram 64 ^
    --graphicscontroller vboxvga ^
    --accelerate2dvideo on ^
    --mouse usbtablet ^
    --keyboard ps2 ^
    --acpi on ^
    --ioapic on ^
    --hpet on ^
    --rtcuseutc on ^
    --audio-controller none ^
    --nic1 nat ^
    --nictype1 82540EM ^
    --uart1 0x3F8 4 ^
    --uartmode1 file "%SERIAL_LOG%"

if %errorlevel% neq 0 (
    echo [-] ERROR: Failed to configure VM hardware parameters.
    pause
    exit /b 1
)

REM 6. Attach IDE Storage Controller and ISO Medium
echo [*] Configuring IDE storage controller and mounting CD-ROM...
%VBOXMANAGE% storagectl "%VM_NAME%" --name "IDE Controller" --add ide --controller PIIX4 --bootable on
if %errorlevel% neq 0 (
    echo [-] ERROR: Failed to add IDE controller.
    pause
    exit /b 1
)

%VBOXMANAGE% storageattach "%VM_NAME%" ^
    --storagectl "IDE Controller" ^
    --port 0 ^
    --device 0 ^
    --type dvddrive ^
    --medium "%ISO_PATH%"

if %errorlevel% neq 0 (
    echo [-] ERROR: Failed to attach ISO image to CD-ROM.
    pause
    exit /b 1
)

echo.
echo ==============================================================================
echo [+] VirtualBox VM '%VM_NAME%' created and tuned successfully!
echo [*] Hardware Profile:
echo     - Architecture:        x86_64 (Other_64)
echo     - Memory / VRAM:       512 MB RAM / 64 MB VRAM (Write-Combining PAT)
echo     - Display Adapter:     VBoxVGA (Dynamic VBE Dispi 1024x768 / 1280x720)
echo     - Pointing Device:     Absolute Mouse Integration (VMMDev 0x80EE:0xCAFE)
echo     - Timers / Power:      HPET Drift Compensation, ACPI S5 Clean Poweroff
echo     - Serial Debug Port:   COM1 redirected to %SERIAL_LOG%
echo ==============================================================================
echo.

set /p START_CHOICE="Do you want to start the VirtualBox VM now? (Y/N): "
if /i "%START_CHOICE%"=="Y" (
    echo [*] Starting '%VM_NAME%'...
    %VBOXMANAGE% startvm "%VM_NAME%"
) else (
    echo [*] You can start the VM anytime via:
    echo     %VBOXMANAGE% startvm "%VM_NAME%"
)

echo.
pause
