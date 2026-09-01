#!/usr/bin/env python3
"""
Oxygen Low's Software — Automated Headless QEMU Verification Test Runner
Operating System: Oxygen Low's Software (x86_64 Bare-Metal OS)
Author: Oxygen Low's Software QA Team
Version: 1.0.0

This script provides end-to-end automated headless verification of the
Oxygen Low's Software operating system image (OxygenLowsSoftware.iso).
It spawns QEMU in headless mode (-serial stdio -display none -no-reboot),
monitors COM1 serial UART telemetry in real-time, matches log tokens against
multi-tier requirement assertions, and verifies kernel boot, memory managers,
drivers, GUI blitter/window manager, applications, and forensic integrity.

Usage:
    python test_runner.py [options]
    python test_runner.py --self-test
    python test_runner.py --iso OxygenLowsSoftware.iso --timeout 25
"""

import argparse
import json
import os
import re
import shutil
import subprocess
import sys
import threading
import time
from typing import List, Dict, Optional, Tuple, Set

# ==============================================================================
# Terminal Color Formatting (with ANSI fallback for older terminals)
# ==============================================================================
class Colors:
    HEADER = "\033[95m"
    BLUE = "\033[94m"
    CYAN = "\033[96m"
    GREEN = "\033[92m"
    YELLOW = "\033[93m"
    RED = "\033[91m"
    BOLD = "\033[1m"
    UNDERLINE = "\033[4m"
    RESET = "\033[0m"

    @classmethod
    def disable(cls):
        cls.HEADER = ""
        cls.BLUE = ""
        cls.CYAN = ""
        cls.GREEN = ""
        cls.YELLOW = ""
        cls.RED = ""
        cls.BOLD = ""
        cls.UNDERLINE = ""
        cls.RESET = ""

# Auto-detect terminal color support
if not sys.stdout.isatty() or os.name == "nt" and "WT_SESSION" not in os.environ and "ANSICON" not in os.environ:
    # On Windows without Windows Terminal / ANSICON, attempt enabling VT mode or disable colors
    try:
        import ctypes
        kernel32 = ctypes.windll.kernel32
        kernel32.SetConsoleMode(kernel32.GetStdHandle(-11), 7)
    except Exception:
        pass


# ==============================================================================
# Test Assertion Definitions (Multi-Tier Coverage Matrix)
# ==============================================================================
class TestCase:
    def __init__(self, test_id: str, name: str, pattern: str, tier: str, description: str, required: bool = True):
        self.test_id = test_id
        self.name = name
        self.pattern = re.compile(pattern, re.IGNORECASE)
        self.raw_pattern = pattern
        self.tier = tier
        self.description = description
        self.required = required
        self.matched = False
        self.matched_line = ""
        self.matched_time = 0.0

    def match(self, line: str, elapsed: float) -> bool:
        if not self.matched and self.pattern.search(line):
            self.matched = True
            self.matched_line = line.strip()
            self.matched_time = elapsed
            return True
        return False

    def reset(self):
        self.matched = False
        self.matched_line = ""
        self.matched_time = 0.0


def create_default_test_suite() -> List[TestCase]:
    """
    Builds the complete multi-tier test suite covering Tier 1 (Core Kernel & Boot),
    Tier 2 (Memory & Drivers), Tier 3 (Graphics & Window Manager), Tier 4 (Apps & Diagnostics),
    and Tier 5 (Forensic Branding & Stability).
    """
    return [
        # ----------------------------------------------------------------------
        # Tier 1: Core Subsystem Boot & Architecture
        # ----------------------------------------------------------------------
        TestCase(
            test_id="T1.1_BOOT_LOADER",
            name="Multiboot2 Boot & 64-bit Entry",
            pattern=r"\[(?:BOOT|MULTIBOOT2)\].*(?:Oxygen Low's Software|Bootloader magic|kernel loaded|x86_64)",
            tier="Tier 1: Kernel Boot",
            description="Validates Multiboot2 header handshake and 64-bit long mode kernel entry."
        ),
        TestCase(
            test_id="T1.2_GDT_TSS",
            name="64-bit GDT & TSS64 Setup",
            pattern=r"\[GDT\].*(?:64-bit GDT|TSS|initialized|loaded)",
            tier="Tier 1: Architecture",
            description="Verifies 64-bit Global Descriptor Table, kernel segments, and 104-byte TSS64."
        ),
        TestCase(
            test_id="T1.3_IDT_ISRS",
            name="64-bit IDT & ISR Exception Handlers",
            pattern=r"\[IDT\].*(?:64-bit IDT|ISRs|Exception|initialized|loaded)",
            tier="Tier 1: Architecture",
            description="Verifies 64-bit Interrupt Descriptor Table and CPU exception vectors 0-31."
        ),
        TestCase(
            test_id="T1.4_PIC_REMAP",
            name="8259 PIC Interrupt Routing",
            pattern=r"\[PIC\].*(?:8259 PIC|remapped|vectors 32-47|initialized)",
            tier="Tier 1: Architecture",
            description="Verifies 8259 PIC remapping to vectors 32-47 to prevent CPU exception conflicts."
        ),
        TestCase(
            test_id="T1.5_PIT_TIMER",
            name="8254 PIT System Timer (1000Hz)",
            pattern=r"\[PIT\].*(?:8254|Timer|1000Hz|100 Hz|active|initialized)",
            tier="Tier 1: Architecture",
            description="Verifies 8254 PIT system timer and monotonic millisecond tick counter."
        ),
        TestCase(
            test_id="T1.6_UART_SERIAL",
            name="16550 UART Serial Telemetry (COM1)",
            pattern=r"\[(?:UART|SERIAL|COM1)\].*(?:16550|COM1|logging|ready|initialized)",
            tier="Tier 1: Telemetry",
            description="Verifies 16550 UART COM1 serial logger initialization (115200 8N1)."
        ),

        # ----------------------------------------------------------------------
        # Tier 2: Memory Subsystem & Input Drivers
        # ----------------------------------------------------------------------
        TestCase(
            test_id="T2.1_PMM_ALLOC",
            name="Physical Frame Bitmap Allocator",
            pattern=r"\[(?:PMM|MEM)\].*(?:Physical|bitmap|frame allocator|initialized)",
            tier="Tier 2: Memory",
            description="Verifies Multiboot2 MMAP parsing and 4KB physical page bitmap allocator."
        ),
        TestCase(
            test_id="T2.2_VMM_PAGING",
            name="Virtual Memory 4-Level Paging",
            pattern=r"\[(?:VMM|PAGING)\].*(?:4-level|PML4|paging|virtual memory|initialized|active)",
            tier="Tier 2: Memory",
            description="Verifies 4-level x86_64 paging tables (PML4, PDPT, PD, PT) and page mapping."
        ),
        TestCase(
            test_id="T2.3_HEAP_ALLOC",
            name="Kernel Heap Allocator (kmalloc/kfree)",
            pattern=r"\[HEAP\].*(?:kmalloc|heap|boundary-tag|allocator|initialized)",
            tier="Tier 2: Memory",
            description="Verifies kernel heap memory allocator with dynamic expansion and coalescing."
        ),
        TestCase(
            test_id="T2.4_CXX_RUNTIME",
            name="Freestanding C++ Runtime & .init_array",
            pattern=r"\[CXX\].*(?:Freestanding|C\+\+|runtime|constructors|initialized)",
            tier="Tier 2: Runtime",
            description="Verifies global new/delete, placement new, and static constructor execution."
        ),
        TestCase(
            test_id="T2.5_PS2_DRIVERS",
            name="PS/2 Keyboard & Mouse Input Drivers",
            pattern=r"\[(?:DRV|PS2|INPUT)\].*(?:PS/2|keyboard|mouse|initialized|active)",
            tier="Tier 2: Drivers",
            description="Verifies PS/2 dual-channel controller, keyboard event queue, and mouse packets."
        ),

        # ----------------------------------------------------------------------
        # Tier 3: Framebuffer, 2D Blitter & Window Manager
        # ----------------------------------------------------------------------
        TestCase(
            test_id="T3.1_FRAMEBUFFER",
            name="Multiboot2 Linear Framebuffer Driver",
            pattern=r"\[(?:FB|FRAMEBUFFER)\].*(?:Framebuffer|linear|direct RGB|initialized)",
            tier="Tier 3: Graphics",
            description="Verifies Multiboot2 tag 8 parsing, linear VRAM mapping, and 32bpp RGB setup."
        ),
        TestCase(
            test_id="T3.2_BLITTER_GFX",
            name="Double-Buffered 2D Software Blitter",
            pattern=r"\[(?:GFX|GUI|BLITTER)\].*(?:Double-buffered|software blitter|blitter|initialized)",
            tier="Tier 3: Graphics",
            description="Verifies offscreen backbuffer rendering, dirty rect blits, and alpha blending."
        ),
        TestCase(
            test_id="T3.3_WINDOW_MGR",
            name="Window Manager & Compositor",
            pattern=r"\[WM\].*(?:Window manager|z-order|initialized|started)",
            tier="Tier 3: Windowing",
            description="Verifies z-ordered window hierarchy, titlebars, dragging state machine, and focus."
        ),
        TestCase(
            test_id="T3.4_DESKTOP_SHELL",
            name="Desktop Shell, Taskbar & System Clock",
            pattern=r"\[(?:DESKTOP|SHELL)\].*(?:Oxygen Low's Software|desktop ready|taskbar started|desktop started)",
            tier="Tier 3: Shell",
            description="Verifies branded desktop wallpaper, acrylic taskbar, start menu, and live clock."
        ),

        # ----------------------------------------------------------------------
        # Tier 4: Interactive Applications & Subsystem Diagnostics
        # ----------------------------------------------------------------------
        TestCase(
            test_id="T4.1_APPS_LOADED",
            name="5 Interactive Desktop Applications",
            pattern=r"\[APPS\].*(?:5 desktop applications|applications registered|Terminal|SysInfo|Notepad|Calculator|Explorer)",
            tier="Tier 4: Applications",
            description="Verifies loading of Terminal, SysInfo, Notepad, Calculator, and File Explorer."
        ),
        TestCase(
            test_id="T4.2_SELFTESTS_PASSED",
            name="In-Kernel Subsystem Diagnostics & Sanity",
            pattern=r"\[(?:SELFTEST|TEST|DIAG)\].*(?:PASSED|passed|All kernel|sanity checks|success)",
            tier="Tier 4: Diagnostics",
            description="Verifies in-kernel unit diagnostics (heap stress, VFS RamFS integrity, math bounds)."
        ),

        # ----------------------------------------------------------------------
        # Tier 5: Forensic Brand Integrity & Security Audit
        # ----------------------------------------------------------------------
        TestCase(
            test_id="T5.1_BRAND_INTEGRITY",
            name="Strict Brand Compliance: Oxygen Low's Software",
            pattern=r"Oxygen Low's Software",
            tier="Tier 5: Brand Integrity",
            description="Verifies OS brand string 'Oxygen Low's Software' is strictly adhered to without deviation."
        )
    ]


# Critical error patterns indicating kernel panic or fatal crash
FATAL_PANIC_PATTERNS = [
    re.compile(r"\[PANIC\]", re.IGNORECASE),
    re.compile(r"KERNEL PANIC", re.IGNORECASE),
    re.compile(r"Triple Fault", re.IGNORECASE),
    re.compile(r"General Protection Fault", re.IGNORECASE),
    re.compile(r"Page Fault Exception", re.IGNORECASE),
    re.compile(r"DOUBLE FAULT", re.IGNORECASE),
    re.compile(r"CRASH DUMP", re.IGNORECASE),
    re.compile(r"UNHANDLED EXCEPTION", re.IGNORECASE),
]


# ==============================================================================
# QEMU Locator & Environment Resolver
# ==============================================================================
def find_qemu_executable(custom_bin: Optional[str] = None) -> Optional[str]:
    """
    Locates the qemu-system-x86_64 binary across Linux, macOS, and Windows.
    """
    if custom_bin:
        if os.path.isfile(custom_bin) and os.access(custom_bin, os.X_OK):
            return os.path.abspath(custom_bin)
        which_path = shutil.which(custom_bin)
        if which_path:
            return os.path.abspath(which_path)
        return None

    # Check environment variable
    env_bin = os.environ.get("QEMU_BIN")
    if env_bin and shutil.which(env_bin):
        return os.path.abspath(shutil.which(env_bin) or env_bin)

    # Check PATH standard names
    for bin_name in ["qemu-system-x86_64", "qemu-system-x86_64.exe"]:
        path = shutil.which(bin_name)
        if path:
            return os.path.abspath(path)

    # Windows standard installation directories
    if sys.platform == "win32":
        standard_dirs = [
            os.path.join(os.environ.get("ProgramFiles", r"C:\Program Files"), "qemu"),
            os.path.join(os.environ.get("ProgramFiles(x86)", r"C:\Program Files (x86)"), "qemu"),
            r"C:\qemu",
            r"D:\qemu",
            os.path.join(os.environ.get("LOCALAPPDATA", ""), "Programs", "qemu")
        ]
        for sdir in standard_dirs:
            candidate = os.path.join(sdir, "qemu-system-x86_64.exe")
            if os.path.isfile(candidate):
                return candidate

    return None


def resolve_iso_path(specified_path: Optional[str]) -> str:
    """
    Resolves the target ISO path, searching common directories if not explicitly given.
    """
    if specified_path:
        return os.path.abspath(specified_path)

    script_dir = os.path.dirname(os.path.abspath(__file__))
    candidates = [
        os.path.join(script_dir, "OxygenLowsSoftware.iso"),
        os.path.join(script_dir, "..", "OxygenLowsSoftware.iso"),
        os.path.join(os.getcwd(), "OxygenLowsSoftware.iso"),
        os.path.join(os.getcwd(), "OS", "OxygenLowsSoftware.iso")
    ]
    for cand in candidates:
        if os.path.isfile(cand):
            return os.path.abspath(cand)

    return os.path.abspath(candidates[0])


# ==============================================================================
# Stream Verifier Engine
# ==============================================================================
class StreamVerifier:
    def __init__(self, test_suite: List[TestCase], verbose: bool = False):
        self.test_suite = test_suite
        self.verbose = verbose
        self.captured_logs: List[str] = []
        self.fatal_errors: List[str] = []
        self.start_time = 0.0

    def process_line(self, line: str, elapsed: float) -> Tuple[bool, Optional[str]]:
        """
        Processes a single serial line.
        Returns (is_panic, panic_message).
        """
        line_clean = line.rstrip("\r\n")
        self.captured_logs.append(line_clean)

        # Check fatal error patterns
        for panic_regex in FATAL_PANIC_PATTERNS:
            if panic_regex.search(line_clean):
                msg = f"Fatal kernel condition detected: '{line_clean}'"
                self.fatal_errors.append(msg)
                return True, msg

        # Match test cases
        for test in self.test_suite:
            if test.match(line_clean, elapsed):
                if self.verbose:
                    print(f"  {Colors.GREEN}[+] Verified {test.test_id} [{test.name}] @ {elapsed:.2f}s{Colors.RESET}")

        return False, None

    def is_all_passed(self) -> bool:
        return all(t.matched for t in self.test_suite if t.required) and len(self.fatal_errors) == 0

    def get_progress_summary(self) -> str:
        passed = sum(1 for t in self.test_suite if t.matched)
        total = len(self.test_suite)
        return f"{passed}/{total} tests satisfied"


# ==============================================================================
# Headless QEMU Runner Execution
# ==============================================================================
def run_headless_qemu_test(
    iso_path: str,
    qemu_bin: str,
    timeout_sec: float = 25.0,
    memory: str = "128M",
    verbose: bool = False,
    log_file: Optional[str] = None,
    json_output: Optional[str] = None
) -> int:
    """
    Spawns QEMU in headless mode and monitors COM1 serial output.
    Returns 0 on success, 1 on test failure, timeout, or crash.
    """
    print(f"{Colors.BOLD}{Colors.CYAN}===================================================================={Colors.RESET}")
    print(f"{Colors.BOLD}{Colors.CYAN} Oxygen Low's Software — Automated Headless QEMU Test Runner{Colors.RESET}")
    print(f"{Colors.BOLD}{Colors.CYAN}===================================================================={Colors.RESET}")
    print(f"[*] Target ISO Image : {Colors.YELLOW}{iso_path}{Colors.RESET}")
    print(f"[*] QEMU Executable  : {Colors.YELLOW}{qemu_bin}{Colors.RESET}")
    print(f"[*] Allocated Memory : {memory}")
    print(f"[*] Execution Timeout: {timeout_sec:.1f} seconds")
    print(f"[*] Verbose Logging  : {'Enabled' if verbose else 'Disabled'}")
    print(f"--------------------------------------------------------------------")

    if not os.path.isfile(iso_path):
        print(f"{Colors.RED}[-] ERROR: Target ISO file '{iso_path}' does not exist.{Colors.RESET}")
        print(f"[*] Please build the OS image first using 'make all' or 'make' in the OS directory.")
        return 1

    test_suite = create_default_test_suite()
    verifier = StreamVerifier(test_suite, verbose=verbose)

    # Construct QEMU command arguments
    # -serial stdio routes COM1 directly to standard output
    # -display none disables SDL/GTK GUI window for headless CI execution
    # -no-reboot stops QEMU from infinite reboot loops on triple fault
    qemu_cmd = [
        qemu_bin,
        "-cdrom", iso_path,
        "-serial", "stdio",
        "-display", "none",
        "-no-reboot",
        "-no-shutdown",
        "-m", memory,
        "-boot", "d"
    ]

    print(f"[*] Launching QEMU subprocess:\n    {' '.join(qemu_cmd)}\n")
    print(f"{Colors.BOLD}[*] Monitoring serial output over COM1...{Colors.RESET}")
    print(f"--------------------------------------------------------------------")

    start_time = time.time()
    process = None

    try:
        process = subprocess.Popen(
            qemu_cmd,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            stdin=subprocess.DEVNULL,
            bufsize=1,
            universal_newlines=True,
            encoding="utf-8",
            errors="replace"
        )
    except Exception as ex:
        print(f"{Colors.RED}[-] Failed to spawn QEMU process: {ex}{Colors.RESET}")
        return 1

    # Threaded output reader to prevent pipe deadlocks
    line_queue: List[str] = []
    queue_lock = threading.Lock()
    process_finished = threading.Event()

    def reader_thread():
        try:
            for line in process.stdout:
                with queue_lock:
                    line_queue.append(line)
        except Exception:
            pass
        finally:
            process_finished.set()

    t = threading.Thread(target=reader_thread, daemon=True)
    t.start()

    timed_out = False
    panic_occurred = False
    panic_msg = ""

    while True:
        elapsed = time.time() - start_time

        # Process queued lines
        lines_to_process = []
        with queue_lock:
            if line_queue:
                lines_to_process = list(line_queue)
                line_queue.clear()

        for raw_line in lines_to_process:
            clean_line = raw_line.rstrip("\r\n")
            if verbose:
                print(f"[SERIAL {elapsed:05.2f}s] {clean_line}")
            else:
                # Print non-verbose serial output
                print(f"[SERIAL] {clean_line}")

            is_panic, p_msg = verifier.process_line(clean_line, elapsed)
            if is_panic:
                panic_occurred = True
                panic_msg = p_msg or "Kernel Panic"
                break

        if panic_occurred:
            print(f"\n{Colors.RED}[!] FATAL ERROR DETECTED: {panic_msg}{Colors.RESET}")
            break

        if verifier.is_all_passed():
            print(f"\n{Colors.GREEN}[+] SUCCESS: All required multi-tier boot tokens satisfied!{Colors.RESET}")
            break

        if elapsed > timeout_sec:
            timed_out = True
            print(f"\n{Colors.RED}[!] TIMEOUT: Exceeded maximum wait time of {timeout_sec}s{Colors.RESET}")
            break

        if process.poll() is not None and not lines_to_process and process_finished.is_set():
            # Process terminated early
            break

        time.sleep(0.02)

    # Clean up QEMU process
    try:
        if process.poll() is None:
            process.terminate()
            try:
                process.wait(timeout=1.0)
            except subprocess.TimeoutExpired:
                process.kill()
                process.wait(timeout=1.0)
    except Exception:
        pass

    total_duration = time.time() - start_time

    # ==========================================================================
    # Verification Report Generation
    # ==========================================================================
    print(f"\n{Colors.BOLD}{Colors.CYAN}===================================================================={Colors.RESET}")
    print(f"{Colors.BOLD}{Colors.CYAN}                   E2E Verification Summary Report                  {Colors.RESET}")
    print(f"{Colors.BOLD}{Colors.CYAN}===================================================================={Colors.RESET}")

    current_tier = ""
    for test in test_suite:
        if test.tier != current_tier:
            current_tier = test.tier
            print(f"\n{Colors.BOLD}{Colors.UNDERLINE}{current_tier}{Colors.RESET}")

        status_str = f"{Colors.GREEN}[PASS]{Colors.RESET}" if test.matched else f"{Colors.RED}[FAIL]{Colors.RESET}"
        time_info = f"({test.matched_time:.2f}s)" if test.matched else "(missing)"
        print(f"  {status_str} {test.test_id:<20} {test.name:<40} {time_info}")
        if not test.matched:
            print(f"         Expected Pattern: {test.raw_pattern}")

    passed_count = sum(1 for t in test_suite if t.matched)
    total_count = len(test_suite)
    pass_rate = (passed_count / total_count) * 100.0 if total_count > 0 else 0.0

    print(f"\n--------------------------------------------------------------------")
    print(f"Execution Duration : {total_duration:.2f} seconds")
    print(f"Test Pass Rate     : {passed_count} / {total_count} ({pass_rate:.1f}%)")
    print(f"Panic / Crash Free : {'Yes' if not verifier.fatal_errors else 'NO (Panics Detected)'}")

    # Write log file if requested
    if log_file:
        try:
            with open(log_file, "w", encoding="utf-8") as lf:
                lf.write("\n".join(verifier.captured_logs))
            print(f"[+] Serial log successfully written to: {log_file}")
        except Exception as e:
            print(f"[-] Failed to write log file '{log_file}': {e}")

    # Write JSON results if requested
    if json_output:
        try:
            json_data = {
                "os_name": "Oxygen Low's Software",
                "iso_path": iso_path,
                "duration_seconds": total_duration,
                "passed": verifier.is_all_passed(),
                "pass_rate_percent": pass_rate,
                "total_tests": total_count,
                "passed_tests": passed_count,
                "fatal_errors": verifier.fatal_errors,
                "tests": [
                    {
                        "id": t.test_id,
                        "name": t.name,
                        "tier": t.tier,
                        "passed": t.matched,
                        "time_seconds": t.matched_time if t.matched else None,
                        "matched_line": t.matched_line if t.matched else None,
                        "pattern": t.raw_pattern
                    } for t in test_suite
                ]
            }
            with open(json_output, "w", encoding="utf-8") as jf:
                json.dump(json_data, jf, indent=2)
            print(f"[+] Structured JSON test results written to: {json_output}")
        except Exception as e:
            print(f"[-] Failed to write JSON output '{json_output}': {e}")

    print(f"====================================================================")
    if verifier.is_all_passed():
        print(f"{Colors.BOLD}{Colors.GREEN}[SUCCESS] Oxygen Low's Software passed all verification gates!{Colors.RESET}")
        return 0
    else:
        missing_tests = [t for t in test_suite if t.required and not t.matched]
        print(f"{Colors.BOLD}{Colors.RED}[FAILED] Verification failed. {len(missing_tests)} requirements unsatisfied.{Colors.RESET}")
        return 1


# ==============================================================================
# Built-in Self-Test Suite (Harness Unit & Adversarial Tests)
# ==============================================================================
def run_self_test() -> int:
    """
    Executes mock serial streams to verify test runner parser logic,
    regex matching accuracy, panic detection, and failure reporting.
    """
    print(f"{Colors.BOLD}{Colors.CYAN}===================================================================={Colors.RESET}")
    print(f"{Colors.BOLD}{Colors.CYAN} Oxygen Low's Software — Test Runner Self-Test & Mock Verification  {Colors.RESET}")
    print(f"{Colors.BOLD}{Colors.CYAN}===================================================================={Colors.RESET}")

    # Case 1: Complete Valid Boot Stream
    mock_valid_stream = [
        "[BOOT] Oxygen Low's Software x86_64 kernel loaded",
        "[GDT] 64-bit GDT & TSS initialized at 0x100000",
        "[IDT] 64-bit IDT & Exception handlers initialized (vectors 0-31)",
        "[PIC] 8259 PIC remapped to vectors 32-47",
        "[PIT] 8254 Timer initialized at 1000Hz monotonic tick",
        "[UART] COM1 16550 Serial logging ready (115200 8N1)",
        "[PMM] Physical frame bitmap allocator initialized (128MB RAM)",
        "[VMM] 4-level paging initialized with PML4 tables",
        "[HEAP] Kernel heap allocator initialized (kmalloc dynamic boundary tag)",
        "[CXX] Freestanding C++ runtime initialized with static constructors",
        "[DRV] PS/2 keyboard and mouse initialized",
        "[FB] Framebuffer initialized: 1024x768x32 direct RGB",
        "[GFX] Double-buffered software blitter initialized",
        "[WM] Window manager initialized with z-order stack",
        "[DESKTOP] Oxygen Low's Software desktop ready (taskbar and system clock)",
        "[APPS] 5 desktop applications loaded: Terminal, SysInfo, Notepad, Calculator, Explorer",
        "[SELFTEST] All kernel & GUI sanity checks PASSED (Heap, VFS, Blitter, Math)",
    ]

    suite1 = create_default_test_suite()
    verifier1 = StreamVerifier(suite1, verbose=False)
    for idx, line in enumerate(mock_valid_stream):
        verifier1.process_line(line, elapsed=idx * 0.05)

    assert verifier1.is_all_passed(), "Self-Test Case 1 (Valid Boot Stream) failed to pass!"
    print(f"{Colors.GREEN}[PASS] Self-Test 1: Full Valid Boot Serial Handshake Verification{Colors.RESET}")

    # Case 2: Incomplete Boot Stream (Missing Heap & Blitter)
    mock_incomplete_stream = [
        "[BOOT] Oxygen Low's Software x86_64 kernel loaded",
        "[GDT] 64-bit GDT & TSS initialized",
        "[IDT] 64-bit IDT & Exception handlers initialized",
        "[PIC] 8259 PIC remapped to vectors 32-47",
        "[PIT] 8254 Timer initialized at 1000Hz",
        "[UART] COM1 16550 Serial logging ready",
        "[PMM] Physical frame bitmap allocator initialized",
        # Heap missing intentionally
        "[DRV] PS/2 keyboard and mouse initialized",
        "[FB] Framebuffer initialized",
        # Blitter missing intentionally
        "[WM] Window manager initialized",
        "[DESKTOP] Oxygen Low's Software desktop ready",
    ]

    suite2 = create_default_test_suite()
    verifier2 = StreamVerifier(suite2, verbose=False)
    for idx, line in enumerate(mock_incomplete_stream):
        verifier2.process_line(line, elapsed=idx * 0.05)

    assert not verifier2.is_all_passed(), "Self-Test Case 2 (Incomplete Stream) should have failed!"
    assert not suite2[7].matched, "Heap allocator was expected to be unmatched!"
    print(f"{Colors.GREEN}[PASS] Self-Test 2: Incomplete Boot & Missing Token Detection{Colors.RESET}")

    # Case 3: Kernel Panic Detection
    mock_panic_stream = [
        "[BOOT] Oxygen Low's Software x86_64 kernel loaded",
        "[GDT] 64-bit GDT & TSS initialized",
        "[PANIC] General Protection Fault (Vector 13, Error Code 0x0000)",
        "RIP: 0x0000000000102340 RSP: 0x0000000000205FF0",
    ]

    suite3 = create_default_test_suite()
    verifier3 = StreamVerifier(suite3, verbose=False)
    panic_detected = False
    for idx, line in enumerate(mock_panic_stream):
        is_panic, _ = verifier3.process_line(line, elapsed=idx * 0.05)
        if is_panic:
            panic_detected = True
            break

    assert panic_detected, "Self-Test Case 3 (Kernel Panic) should have caught fatal panic!"
    print(f"{Colors.GREEN}[PASS] Self-Test 3: Fatal Kernel Crash & Panic Interception{Colors.RESET}")

    # Case 4: Brand Integrity Verification
    mock_bad_brand_stream = [
        "[BOOT] GenericOS x86_64 kernel loaded",
        "[GDT] 64-bit GDT & TSS initialized",
        "[DESKTOP] GenericOS desktop ready",
    ]
    suite4 = create_default_test_suite()
    verifier4 = StreamVerifier(suite4, verbose=False)
    for idx, line in enumerate(mock_bad_brand_stream):
        verifier4.process_line(line, elapsed=idx * 0.05)

    brand_test = next(t for t in suite4 if t.test_id == "T5.1_BRAND_INTEGRITY")
    assert not brand_test.matched, "Self-Test Case 4 (Brand Integrity) should reject unbranded OS!"
    print(f"{Colors.GREEN}[PASS] Self-Test 4: Strict Brand Integrity Enforcement{Colors.RESET}")

    print(f"\n{Colors.BOLD}{Colors.GREEN}[ALL SELF-TESTS PASSED] Test harness logic verified successfully.{Colors.RESET}")
    return 0


# ==============================================================================
# CLI Argument Parser & Entry Point
# ==============================================================================
def main():
    parser = argparse.ArgumentParser(
        description="Oxygen Low's Software — Automated Headless QEMU Verification Test Runner",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  python test_runner.py
  python test_runner.py --iso OxygenLowsSoftware.iso --timeout 25
  python test_runner.py --qemu-bin /usr/bin/qemu-system-x86_64
  python test_runner.py --self-test
  python test_runner.py --json-output results.json --log-file serial.log
        """
    )

    parser.add_argument(
        "-i", "--iso",
        dest="iso_path",
        help="Path to the OxygenLowsSoftware.iso bootable image"
    )
    parser.add_argument(
        "-t", "--timeout",
        dest="timeout",
        type=float,
        default=25.0,
        help="Maximum execution timeout in seconds (default: 25.0s)"
    )
    parser.add_argument(
        "-q", "--qemu-bin",
        dest="qemu_bin",
        help="Path or name of the qemu-system-x86_64 executable"
    )
    parser.add_argument(
        "-m", "--memory",
        dest="memory",
        default="128M",
        help="Virtual RAM size allocated to QEMU (default: 128M)"
    )
    parser.add_argument(
        "-v", "--verbose",
        dest="verbose",
        action="store_true",
        help="Enable verbose serial log streaming with timestamps"
    )
    parser.add_argument(
        "-l", "--log-file",
        dest="log_file",
        help="Save raw serial log output to specified file"
    )
    parser.add_argument(
        "-j", "--json-output",
        dest="json_output",
        help="Export structured test metrics in JSON format"
    )
    parser.add_argument(
        "--self-test",
        dest="self_test",
        action="store_true",
        help="Execute internal test runner verification against mock serial streams"
    )
    parser.add_argument(
        "--no-color",
        dest="no_color",
        action="store_true",
        help="Disable ANSI terminal color output"
    )

    args = parser.parse_args()

    if args.no_color:
        Colors.disable()

    if args.self_test:
        sys.exit(run_self_test())

    resolved_iso = resolve_iso_path(args.iso_path)
    qemu_executable = find_qemu_executable(args.qemu_bin)

    if not qemu_executable:
        print(f"{Colors.RED}[-] ERROR: Could not locate 'qemu-system-x86_64' executable.{Colors.RESET}")
        print(f"[*] On Ubuntu/Debian: sudo apt-get install qemu-system-x86")
        print(f"[*] On Windows      : Install QEMU and ensure it is added to PATH or use --qemu-bin")
        print(f"[*] On macOS        : brew install qemu")
        sys.exit(1)

    exit_code = run_headless_qemu_test(
        iso_path=resolved_iso,
        qemu_bin=qemu_executable,
        timeout_sec=args.timeout,
        memory=args.memory,
        verbose=args.verbose,
        log_file=args.log_file,
        json_output=args.json_output
    )

    sys.exit(exit_code)


if __name__ == "__main__":
    main()
