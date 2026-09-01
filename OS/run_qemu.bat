@echo off
REM Oxygen Low's Software — Interactive QEMU Launcher for Windows
setlocal enabledelayedexpansion

set SCRIPT_DIR=%~dp0
set ISO_PATH=%SCRIPT_DIR%OxygenLowsSoftware.iso

echo ==================================================
echo  Oxygen Low's Software — Windows QEMU Launcher
echo  Image: %ISO_PATH%
echo ==================================================

REM Locate QEMU executable
set QEMU_BIN=
where qemu-system-x86_64.exe >nul 2>nul
if %errorlevel% equ 0 (
    set QEMU_BIN=qemu-system-x86_64.exe
) else if exist "C:\Program Files\qemu\qemu-system-x86_64.exe" (
    set QEMU_BIN="C:\Program Files\qemu\qemu-system-x86_64.exe"
) else if exist "C:\Program Files (x86)\qemu\qemu-system-x86_64.exe" (
    set QEMU_BIN="C:\Program Files (x86)\qemu\qemu-system-x86_64.exe"
) else if exist "C:\qemu\qemu-system-x86_64.exe" (
    set QEMU_BIN="C:\qemu\qemu-system-x86_64.exe"
)

if "%QEMU_BIN%"=="" (
    echo [-] ERROR: Could not find qemu-system-x86_64.exe in PATH or Program Files.
    echo [*] Please install QEMU from https://www.qemu.org/download/#windows
    pause
    exit /b 1
)

if not exist "%ISO_PATH%" (
    echo [-] ERROR: ISO image '%ISO_PATH%' not found.
    echo [*] Build the ISO first or check directory contents.
    pause
    exit /b 1
)

echo [*] Starting QEMU with serial stdio and standard VGA...
%QEMU_BIN% -cdrom "%ISO_PATH%" -m 256M -serial stdio -vga std -boot d
pause
