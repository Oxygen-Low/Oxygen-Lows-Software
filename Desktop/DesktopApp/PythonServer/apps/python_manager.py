import sys
import os
import time
import subprocess
import importlib.metadata
import re
import logging
import threading

logger = logging.getLogger("PythonServer.PythonManager")

METADATA = {
    "name": "Python Manager",
    "description": "Monitors Python runtime status, tracks dependencies, and manages server logs for Oxygen Low's Software.",
    "version": "1.0.0"
}

INSTALL_LOCK = threading.Lock()
CURRENT_INSTALL = {
    "package": None,
    "status": "idle",
    "percent": 0.0,
    "stage": "",
    "error": None,
    "log": ""
}

def register_app():
    return METADATA

TRACKED_PACKAGES = [
    {
        "name": "airllm",
        "import_name": "airllm",
        "required": ">=4.0.0",
        "description": "Layer-wise massive model runner on low VRAM"
    },
    {
        "name": "llama-cpp-python",
        "import_name": "llama_cpp",
        "required": ">=0.3.0",
        "description": "High-performance GGUF quantization runtime"
    },
    {
        "name": "transformers",
        "import_name": "transformers",
        "required": ">=4.49.0",
        "description": "Hugging Face model architectures and tokenizers"
    },
    {
        "name": "torch",
        "import_name": "torch",
        "required": ">=2.4.0",
        "description": "PyTorch deep learning tensor engine"
    },
    {
        "name": "safetensors",
        "import_name": "safetensors",
        "required": ">=0.4.0",
        "description": "Safe, fast zero-copy tensor serialization format"
    },
    {
        "name": "accelerate",
        "import_name": "accelerate",
        "required": ">=1.0.0",
        "description": "Hardware device placement & offloading helper"
    },
    {
        "name": "huggingface-hub",
        "import_name": "huggingface_hub",
        "required": ">=0.24.0",
        "description": "Downloader for open-source AI weights and repositories"
    },
    {
        "name": "sentencepiece",
        "import_name": "sentencepiece",
        "required": ">=0.2.0",
        "description": "Tokenizer dependency for LLaMA and AirLLM"
    },
    {
        "name": "psutil",
        "import_name": "psutil",
        "required": ">=5.9.0",
        "description": "Process and system hardware telemetry monitor"
    }
]

def action_get_server_overview(params=None):
    """Returns general server health, runtime paths, and resource utilization."""
    from apps import registry
    uptime = 0.0
    try:
        import server
        uptime = round(time.time() - server.START_TIME, 2)
    except Exception:
        pass

    cpu_percent = 0.0
    memory_mb = 0.0
    try:
        import psutil
        proc = psutil.Process(os.getpid())
        cpu_percent = proc.cpu_percent(interval=None)
        mem_info = proc.memory_info()
        memory_mb = round(mem_info.rss / (1024 * 1024), 2)
    except Exception:
        pass

    loaded_apps = [app["id"] for app in registry.list_apps()]

    return {
        "status": "running",
        "pid": os.getpid(),
        "uptime_seconds": uptime,
        "python_version": sys.version,
        "executable": sys.executable,
        "environment_prefix": sys.prefix,
        "cpu_percent": cpu_percent,
        "memory_mb": memory_mb,
        "loaded_apps": loaded_apps
    }

def action_list_dependencies(params=None):
    """Checks whether tracked AI dependencies are installed, their versions, and CUDA availability."""
    results = []
    for pkg in TRACKED_PACKAGES:
        installed = False
        version = None
        # Try metadata lookup first
        try:
            version = importlib.metadata.version(pkg["name"])
            installed = True
        except Exception:
            # Fallback to direct module check
            try:
                mod = __import__(pkg["import_name"])
                version = getattr(mod, "__version__", "installed")
                installed = True
            except Exception:
                installed = False

        results.append({
            "name": pkg["name"],
            "import_name": pkg["import_name"],
            "required": pkg["required"],
            "description": pkg["description"],
            "installed": installed,
            "version": version
        })

    cuda_info = {
        "available": False,
        "device_count": 0,
        "device_name": None,
        "total_vram_mb": 0.0
    }

    try:
        import torch
        if torch.cuda.is_available():
            count = torch.cuda.device_count()
            name = torch.cuda.get_device_name(0) if count > 0 else None
            vram = round(torch.cuda.get_device_properties(0).total_memory / (1024 * 1024), 2) if count > 0 else 0.0
            cuda_info = {
                "available": True,
                "device_count": count,
                "device_name": name,
                "total_vram_mb": vram
            }
    except Exception:
        pass

    return {
        "dependencies": results,
        "cuda": cuda_info
    }

def action_install_dependency(params=None):
    """Installs or upgrades a Python dependency asynchronously into the active virtual environment."""
    params = params or {}
    pkg_name = params.get("package", "").strip()
    if not pkg_name:
        raise ValueError("Package name is required")

    # Security check: only allow standard pip package specs (no shell injection characters)
    if not re.match(r"^[a-zA-Z0-9_\-\.\=\>\<~]+$", pkg_name):
        raise ValueError(f"Invalid package name format: '{pkg_name}'")

    with INSTALL_LOCK:
        if CURRENT_INSTALL["status"] == "installing":
            if CURRENT_INSTALL["package"] == pkg_name:
                return {"success": True, "status": "installing", "package": pkg_name}
            raise ValueError(f"Installation of '{CURRENT_INSTALL['package']}' is already in progress.")

        CURRENT_INSTALL.update({
            "package": pkg_name,
            "status": "installing",
            "percent": 12.0,
            "stage": f"Resolving dependencies for '{pkg_name}'...",
            "error": None,
            "log": ""
        })

    def _worker():
        global CURRENT_INSTALL
        logger.info(f"Initiating installation of '{pkg_name}' into virtualenv...")
        cmd = [sys.executable, "-u", "-m", "pip", "install", "--no-input", pkg_name]
        output_lines = []
        stop_ticker = threading.Event()

        def _ticker():
            while not stop_ticker.is_set():
                stop_ticker.wait(1.0)
                if stop_ticker.is_set():
                    break
                with INSTALL_LOCK:
                    if CURRENT_INSTALL["status"] == "installing":
                        cur = CURRENT_INSTALL["percent"]
                        if cur < 92.0:
                            CURRENT_INSTALL["percent"] = round(cur + max(0.4, (92.0 - cur) * 0.05), 1)

        threading.Thread(target=_ticker, daemon=True).start()

        try:
            proc = subprocess.Popen(
                cmd,
                stdout=subprocess.PIPE,
                stderr=subprocess.STDOUT,
                text=True,
                bufsize=1
            )

            buffer = ""
            while True:
                char = proc.stdout.read(1)
                if not char:
                    if proc.poll() is not None:
                        break
                    continue
                if char in ("\r", "\n"):
                    clean = buffer.strip()
                    buffer = ""
                    if not clean:
                        continue
                    output_lines.append(clean)
                    lower = clean.lower()

                    with INSTALL_LOCK:
                        CURRENT_INSTALL["log"] = clean
                        if "collecting" in lower or "requirement already satisfied" in lower:
                            CURRENT_INSTALL["percent"] = max(CURRENT_INSTALL["percent"], 25.0)
                            CURRENT_INSTALL["stage"] = "Collecting packages..."
                        elif "downloading" in lower:
                            CURRENT_INSTALL["percent"] = min(75.0, max(CURRENT_INSTALL["percent"], 40.0) + 2.0)
                            CURRENT_INSTALL["stage"] = "Downloading package wheels..."
                        elif "installing build dependencies" in lower or "getting requirements" in lower:
                            CURRENT_INSTALL["percent"] = max(CURRENT_INSTALL["percent"], 78.0)
                            CURRENT_INSTALL["stage"] = "Preparing packages..."
                        elif "building wheel" in lower:
                            CURRENT_INSTALL["percent"] = max(CURRENT_INSTALL["percent"], 82.0)
                            CURRENT_INSTALL["stage"] = "Building wheels..."
                        elif "installing collected packages" in lower:
                            CURRENT_INSTALL["percent"] = max(CURRENT_INSTALL["percent"], 88.0)
                            CURRENT_INSTALL["stage"] = "Installing packages into environment..."
                        elif "successfully installed" in lower:
                            CURRENT_INSTALL["percent"] = 100.0
                            CURRENT_INSTALL["stage"] = "Installed"
                else:
                    buffer += char

            proc.wait(timeout=300)
            stop_ticker.set()
            success = (proc.returncode == 0)

            with INSTALL_LOCK:
                if success:
                    CURRENT_INSTALL["status"] = "completed"
                    CURRENT_INSTALL["percent"] = 100.0
                    CURRENT_INSTALL["stage"] = "Installed"
                    logger.info(f"Successfully installed package '{pkg_name}'")
                else:
                    CURRENT_INSTALL["status"] = "error"
                    err_msg = "\n".join(output_lines[-10:]) if output_lines else f"Process exited with code {proc.returncode}"
                    CURRENT_INSTALL["error"] = err_msg
                    logger.warning(f"Failed to install '{pkg_name}': {err_msg[:300]}")
        except subprocess.TimeoutExpired:
            stop_ticker.set()
            with INSTALL_LOCK:
                CURRENT_INSTALL["status"] = "error"
                CURRENT_INSTALL["error"] = "Installation timed out after 300 seconds."
            logger.error(f"Timed out installing package '{pkg_name}'")
        except Exception as e:
            stop_ticker.set()
            with INSTALL_LOCK:
                CURRENT_INSTALL["status"] = "error"
                CURRENT_INSTALL["error"] = str(e)
            logger.error(f"Error installing '{pkg_name}': {e}", exc_info=True)

    t = threading.Thread(target=_worker, daemon=True)
    t.start()
    return {"success": True, "status": "started", "package": pkg_name}

def action_get_install_progress(params=None):
    """Retrieves the current background package installation progress."""
    with INSTALL_LOCK:
        return dict(CURRENT_INSTALL)

def action_get_logs(params=None):
    """Retrieves server logs from the in-memory ring buffer with optional filtering."""
    params = params or {}
    level = params.get("level")
    query = params.get("query")
    limit = int(params.get("limit", 200))

    try:
        import server
        logs = server.get_buffered_logs(level=level, query=query, limit=limit)
        return {
            "total_count": len(logs),
            "logs": logs
        }
    except Exception as e:
        logger.error(f"Failed to retrieve buffered logs: {e}")
        return {
            "total_count": 0,
            "logs": []
        }

def action_clear_logs(params=None):
    """Clears the in-memory log ring buffer."""
    try:
        import server
        server.clear_buffered_logs()
        return {"status": "ok", "cleared": True}
    except Exception as e:
        logger.error(f"Failed to clear logs: {e}")
        return {"status": "error", "error": str(e)}
