import sys
import os
import time
import json
import threading
import gc
import re
import logging
from typing import Generator, Dict, Any, List, Optional

logger = logging.getLogger("PythonServer.LLMRunner")

METADATA = {
    "name": "LLM Runner",
    "description": "Executes local GGUF, SafeTensors, and AirLLM models on desktop hardware.",
    "version": "1.0.0"
}

def register_app():
    return METADATA

MODELS_DIR = os.path.join(
    os.environ.get("LOCALAPPDATA", os.path.expanduser("~")),
    "OxygenLowsSoftware",
    "Models"
)
os.makedirs(MODELS_DIR, exist_ok=True)

# Global Runner State
ACTIVE_MODEL_LOCK = threading.Lock()
ACTIVE_MODEL: Dict[str, Any] = {
    "path": None,
    "name": None,
    "format": None,
    "engine_type": None,
    "instance": None,
    "tokenizer": None,
    "loaded_at": None,
    "params": {}
}
RUNNER_STATE = "stopped"  # "stopped" | "loading" | "running" | "error"
LAST_ERROR: Optional[str] = None
METRICS = {
    "last_prompt_tokens": 0,
    "last_completion_tokens": 0,
    "last_tokens_per_sec": 0.0,
    "last_ttft_ms": 0.0
}

# Hugging Face Downloader State
DOWNLOAD_LOCK = threading.Lock()
CURRENT_DOWNLOAD: Optional[Dict[str, Any]] = None
CANCEL_DOWNLOAD_FLAG = threading.Event()


def _format_size(size_bytes: int) -> str:
    """Formats bytes into human readable string (KB, MB, GB)."""
    if size_bytes < 1024:
        return f"{size_bytes} B"
    elif size_bytes < 1024 * 1024:
        return f"{round(size_bytes / 1024, 1)} KB"
    elif size_bytes < 1024 * 1024 * 1024:
        return f"{round(size_bytes / (1024 * 1024), 2)} MB"
    else:
        return f"{round(size_bytes / (1024 * 1024 * 1024), 2)} GB"


def _extract_quantization(filename: str) -> str:
    """Detects quantization scheme from file name (e.g. Q4_K_M, Q8_0, FP16)."""
    match = re.search(r"(Q[0-9]_[A-Z0-9_]+|IQ[0-9]_[A-Z0-9_]+|FP16|BF16|FP32)", filename, re.IGNORECASE)
    if match:
        return match.group(1).upper()
    return "Standard"


def action_get_models_dir(params=None):
    """Returns the storage path for LLM models."""
    os.makedirs(MODELS_DIR, exist_ok=True)
    return {
        "models_dir": MODELS_DIR,
        "exists": os.path.exists(MODELS_DIR)
    }


def action_list_models(params=None):
    """Scans the models storage directory and returns detected .gguf, .safetensors, and model folders."""
    params = params or {}
    scan_dir = params.get("directory") or MODELS_DIR
    if not os.path.exists(scan_dir):
        os.makedirs(scan_dir, exist_ok=True)

    models = []
    try:
        entries = sorted(os.listdir(scan_dir))
        for entry in entries:
            full_path = os.path.join(scan_dir, entry)

            # Check for GGUF or single Safetensors file
            if os.path.isfile(full_path):
                lower = entry.lower()
                if lower.endswith(".gguf") or lower.endswith(".safetensors"):
                    fmt = "gguf" if lower.endswith(".gguf") else "safetensors"
                    size = os.path.getsize(full_path)
                    mod_time = os.path.getmtime(full_path)
                    is_active = (ACTIVE_MODEL.get("path") == full_path and RUNNER_STATE == "running")
                    models.append({
                        "id": entry,
                        "name": entry,
                        "path": full_path,
                        "format": fmt,
                        "size_bytes": size,
                        "size_display": _format_size(size),
                        "quantization": _extract_quantization(entry),
                        "modified_at": time.strftime("%Y-%m-%d %H:%M:%S", time.localtime(mod_time)),
                        "is_active": is_active,
                        "is_directory": False
                    })

            # Check for directory containing safetensors / HuggingFace checkpoints
            elif os.path.isdir(full_path) and not entry.startswith("."):
                sub_files = os.listdir(full_path)
                has_safetensors = any(f.lower().endswith(".safetensors") for f in sub_files)
                has_config = any(f.lower() == "config.json" for f in sub_files)
                if has_safetensors or has_config:
                    total_size = sum(
                        os.path.getsize(os.path.join(full_path, f))
                        for f in sub_files if os.path.isfile(os.path.join(full_path, f))
                    )
                    mod_time = os.path.getmtime(full_path)
                    is_active = (ACTIVE_MODEL.get("path") == full_path and RUNNER_STATE == "running")
                    models.append({
                        "id": entry,
                        "name": entry,
                        "path": full_path,
                        "format": "safetensors" if has_safetensors else "directory",
                        "size_bytes": total_size,
                        "size_display": _format_size(total_size),
                        "quantization": _extract_quantization(entry),
                        "modified_at": time.strftime("%Y-%m-%d %H:%M:%S", time.localtime(mod_time)),
                        "is_active": is_active,
                        "is_directory": True
                    })
    except Exception as e:
        logger.error(f"Error scanning models in {scan_dir}: {e}", exc_info=True)

    return {
        "models_dir": scan_dir,
        "models": models
    }


def action_delete_model(params=None):
    """Safely removes a model file or folder from the Models storage directory."""
    params = params or {}
    model_path = params.get("path")
    if not model_path:
        raise ValueError("Model path is required")

    canonical_path = os.path.realpath(model_path)
    canonical_models_dir = os.path.realpath(MODELS_DIR)

    # Security check: must reside inside MODELS_DIR
    if not canonical_path.startswith(canonical_models_dir):
        raise ValueError("Cannot delete files outside of the designated Models directory.")

    if not os.path.exists(canonical_path):
        raise ValueError("Model does not exist.")

    # Prevent deleting currently active model
    with ACTIVE_MODEL_LOCK:
        if ACTIVE_MODEL.get("path") == canonical_path and RUNNER_STATE == "running":
            raise ValueError("Cannot delete a model that is currently loaded. Unload it first.")

    try:
        if os.path.isdir(canonical_path):
            import shutil
            shutil.rmtree(canonical_path)
        else:
            os.remove(canonical_path)
        logger.info(f"Deleted model at {canonical_path}")
        return {"status": "ok", "deleted": True, "path": canonical_path}
    except Exception as e:
        logger.error(f"Failed to delete model {canonical_path}: {e}")
        raise ValueError(f"Failed to delete model: {e}")


def action_download_hf_model(params=None):
    """Downloads a model file from Hugging Face into the Models folder in a background thread."""
    global CURRENT_DOWNLOAD
    params = params or {}
    repo_id = params.get("repo_id", "").strip()
    filename = params.get("filename", "").strip()

    if not repo_id:
        raise ValueError("Hugging Face repo_id is required (e.g., 'TheBloke/Llama-2-7B-Chat-GGUF').")

    with DOWNLOAD_LOCK:
        if CURRENT_DOWNLOAD and CURRENT_DOWNLOAD.get("status") == "downloading":
            raise ValueError("Another download is already in progress.")

        CANCEL_DOWNLOAD_FLAG.clear()
        CURRENT_DOWNLOAD = {
            "repo_id": repo_id,
            "filename": filename,
            "status": "downloading",
            "percent": 0.0,
            "downloaded_bytes": 0,
            "total_bytes": 0,
            "speed_mb_s": 0.0,
            "error": None,
            "target_path": None
        }

    def _download_worker():
        global CURRENT_DOWNLOAD
        try:
            from huggingface_hub import hf_hub_download
            logger.info(f"Starting HF download for {repo_id} / {filename}...")
            
            # If filename specified, download single file into MODELS_DIR
            if filename:
                target_dest = os.path.join(MODELS_DIR, filename)
                CURRENT_DOWNLOAD["target_path"] = target_dest
                
                # hf_hub_download handles cached download and symlinks/copies
                local_path = hf_hub_download(
                    repo_id=repo_id,
                    filename=filename,
                    local_dir=MODELS_DIR
                )
                with DOWNLOAD_LOCK:
                    CURRENT_DOWNLOAD["status"] = "completed"
                    CURRENT_DOWNLOAD["percent"] = 100.0
                    CURRENT_DOWNLOAD["target_path"] = local_path
                logger.info(f"Completed HF download for {filename}: {local_path}")
            else:
                # If no filename, download snapshot repo folder
                from huggingface_hub import snapshot_download
                repo_slug = repo_id.replace("/", "_")
                local_dir = os.path.join(MODELS_DIR, repo_slug)
                CURRENT_DOWNLOAD["target_path"] = local_dir
                local_path = snapshot_download(
                    repo_id=repo_id,
                    local_dir=local_dir
                )
                with DOWNLOAD_LOCK:
                    CURRENT_DOWNLOAD["status"] = "completed"
                    CURRENT_DOWNLOAD["percent"] = 100.0
                    CURRENT_DOWNLOAD["target_path"] = local_path
                logger.info(f"Completed HF snapshot download for {repo_id}: {local_path}")
        except Exception as e:
            logger.error(f"HF download failed: {e}", exc_info=True)
            with DOWNLOAD_LOCK:
                if CURRENT_DOWNLOAD:
                    CURRENT_DOWNLOAD["status"] = "error"
                    CURRENT_DOWNLOAD["error"] = str(e)

    threading.Thread(target=_download_worker, daemon=True).start()
    return {"status": "started", "repo_id": repo_id, "filename": filename}


def action_get_download_progress(params=None):
    """Returns the current status of the active Hugging Face download."""
    with DOWNLOAD_LOCK:
        if not CURRENT_DOWNLOAD:
            return {"status": "idle", "percent": 0.0}
        return dict(CURRENT_DOWNLOAD)


def action_cancel_download(params=None):
    """Cancels any ongoing model download."""
    global CURRENT_DOWNLOAD
    with DOWNLOAD_LOCK:
        if CURRENT_DOWNLOAD and CURRENT_DOWNLOAD.get("status") == "downloading":
            CANCEL_DOWNLOAD_FLAG.set()
            CURRENT_DOWNLOAD["status"] = "cancelled"
            return {"status": "cancelled"}
    return {"status": "no_active_download"}


def _safe_unload_active():
    """Unloads active model, calls garbage collection, and clears CUDA cache."""
    global ACTIVE_MODEL, RUNNER_STATE
    with ACTIVE_MODEL_LOCK:
        if ACTIVE_MODEL["instance"] is not None:
            logger.info(f"Unloading active model: {ACTIVE_MODEL.get('name')}")
            ACTIVE_MODEL["instance"] = None
            ACTIVE_MODEL["tokenizer"] = None
            ACTIVE_MODEL["path"] = None
            ACTIVE_MODEL["name"] = None
            ACTIVE_MODEL["format"] = None
            ACTIVE_MODEL["engine_type"] = None
            ACTIVE_MODEL["loaded_at"] = None
            ACTIVE_MODEL["params"] = {}
        
        gc.collect()
        try:
            import torch
            if torch.cuda.is_available():
                torch.cuda.empty_cache()
        except Exception:
            pass

        RUNNER_STATE = "stopped"


def action_unload_model(params=None):
    """Action to unload currently active model and reclaim memory."""
    _safe_unload_active()
    return {"status": "ok", "state": "stopped"}


def action_load_model(params=None):
    """Loads a .gguf, .safetensors, or AirLLM model into memory."""
    global ACTIVE_MODEL, RUNNER_STATE, LAST_ERROR
    params = params or {}
    model_path = params.get("path")
    if not model_path:
        raise ValueError("Model path is required")

    canonical_path = os.path.realpath(model_path)
    if not os.path.exists(canonical_path):
        raise ValueError(f"Model file or directory not found at: {canonical_path}")

    model_name = os.path.basename(canonical_path)
    engine_choice = params.get("engine", "auto").lower()
    n_ctx = int(params.get("n_ctx", 4096))
    n_gpu_layers = int(params.get("n_gpu_layers", 0))
    n_threads = int(params.get("n_threads", os.cpu_count() or 4))
    use_airllm = (engine_choice == "airllm") or params.get("use_airllm", False)

    _safe_unload_active()

    RUNNER_STATE = "loading"
    LAST_ERROR = None

    try:
        is_gguf = canonical_path.lower().endswith(".gguf")

        # 1. GGUF Engine via llama-cpp-python
        if is_gguf or engine_choice == "llama-cpp":
            try:
                from llama_cpp import Llama
            except ImportError:
                raise RuntimeError(
                    "The 'llama-cpp-python' library is not installed. "
                    "Open 'Python Manager' to install it, or compile it for your GPU."
                )

            logger.info(f"Loading GGUF model via llama.cpp: {canonical_path} (gpu_layers={n_gpu_layers}, ctx={n_ctx})")
            llm_inst = Llama(
                model_path=canonical_path,
                n_ctx=n_ctx,
                n_gpu_layers=n_gpu_layers,
                n_threads=n_threads,
                verbose=False
            )
            with ACTIVE_MODEL_LOCK:
                ACTIVE_MODEL["instance"] = llm_inst
                ACTIVE_MODEL["tokenizer"] = None
                ACTIVE_MODEL["path"] = canonical_path
                ACTIVE_MODEL["name"] = model_name
                ACTIVE_MODEL["format"] = "gguf"
                ACTIVE_MODEL["engine_type"] = "llama-cpp"
                ACTIVE_MODEL["loaded_at"] = time.time()
                ACTIVE_MODEL["params"] = {
                    "n_ctx": n_ctx,
                    "n_gpu_layers": n_gpu_layers,
                    "n_threads": n_threads
                }
                RUNNER_STATE = "running"

        # 2. AirLLM Engine for massive models on constrained hardware
        elif use_airllm:
            try:
                from airllm import AutoModel
                from transformers import AutoTokenizer
            except ImportError as ie:
                raise RuntimeError(
                    f"Required libraries for AirLLM are not installed ({ie}). "
                    "Open 'Python Manager' to install 'airllm' and 'transformers'."
                )

            logger.info(f"Loading massive model via AirLLM: {canonical_path}")
            model_inst = AutoModel.from_pretrained(canonical_path)
            tokenizer_inst = AutoTokenizer.from_pretrained(canonical_path)

            with ACTIVE_MODEL_LOCK:
                ACTIVE_MODEL["instance"] = model_inst
                ACTIVE_MODEL["tokenizer"] = tokenizer_inst
                ACTIVE_MODEL["path"] = canonical_path
                ACTIVE_MODEL["name"] = model_name
                ACTIVE_MODEL["format"] = "safetensors"
                ACTIVE_MODEL["engine_type"] = "airllm"
                ACTIVE_MODEL["loaded_at"] = time.time()
                ACTIVE_MODEL["params"] = {
                    "n_ctx": n_ctx,
                    "use_airllm": True
                }
                RUNNER_STATE = "running"

        # 3. Standard SafeTensors / HuggingFace Transformers Engine
        else:
            try:
                import torch
                from transformers import AutoModelForCausalLM, AutoTokenizer
            except ImportError as ie:
                raise RuntimeError(
                    f"Required libraries for Transformers are not installed ({ie}). "
                    "Open 'Python Manager' to install 'torch' and 'transformers'."
                )

            logger.info(f"Loading SafeTensors model via Transformers: {canonical_path}")
            device = "cuda" if (torch.cuda.is_available() and n_gpu_layers != 0) else "cpu"
            dtype = torch.float16 if device == "cuda" else torch.float32

            tokenizer_inst = AutoTokenizer.from_pretrained(canonical_path)
            model_inst = AutoModelForCausalLM.from_pretrained(
                canonical_path,
                torch_dtype=dtype,
                device_map="auto" if device == "cuda" else None
            )
            if device != "cuda":
                model_inst = model_inst.to(device)

            with ACTIVE_MODEL_LOCK:
                ACTIVE_MODEL["instance"] = model_inst
                ACTIVE_MODEL["tokenizer"] = tokenizer_inst
                ACTIVE_MODEL["path"] = canonical_path
                ACTIVE_MODEL["name"] = model_name
                ACTIVE_MODEL["format"] = "safetensors"
                ACTIVE_MODEL["engine_type"] = "transformers"
                ACTIVE_MODEL["loaded_at"] = time.time()
                ACTIVE_MODEL["params"] = {
                    "n_ctx": n_ctx,
                    "device": device
                }
                RUNNER_STATE = "running"

        return {
            "status": "ok",
            "state": "running",
            "model_name": model_name,
            "engine": ACTIVE_MODEL["engine_type"]
        }

    except Exception as ex:
        logger.error(f"Failed to load model {model_name}: {ex}", exc_info=True)
        RUNNER_STATE = "error"
        LAST_ERROR = str(ex)
        _safe_unload_active()
        raise RuntimeError(f"Failed to load model: {ex}")


def action_get_status(params=None):
    """Returns current runtime state, active model info, and performance metrics."""
    with ACTIVE_MODEL_LOCK:
        is_active = (RUNNER_STATE == "running" and ACTIVE_MODEL["instance"] is not None)
        active_info = None
        if is_active:
            active_info = {
                "name": ACTIVE_MODEL["name"],
                "path": ACTIVE_MODEL["path"],
                "format": ACTIVE_MODEL["format"],
                "engine_type": ACTIVE_MODEL["engine_type"],
                "loaded_at": ACTIVE_MODEL["loaded_at"],
                "params": ACTIVE_MODEL["params"]
            }

    cuda_available = False
    vram_mb = 0.0
    try:
        import torch
        cuda_available = torch.cuda.is_available()
        if cuda_available and torch.cuda.device_count() > 0:
            vram_mb = round(torch.cuda.get_device_properties(0).total_memory / (1024 * 1024), 2)
    except Exception:
        pass

    return {
        "state": RUNNER_STATE,
        "is_active": is_active,
        "active_model": active_info,
        "metrics": METRICS,
        "error": LAST_ERROR,
        "hardware": {
            "cuda_available": cuda_available,
            "vram_mb": vram_mb
        }
    }


def action_list_openai_models(params=None):
    """Returns OpenAI-compatible model listing for active model."""
    with ACTIVE_MODEL_LOCK:
        if RUNNER_STATE == "running" and ACTIVE_MODEL.get("name"):
            name = ACTIVE_MODEL["name"]
            return {
                "object": "list",
                "data": [
                    {
                        "id": name,
                        "object": "model",
                        "created": int(ACTIVE_MODEL.get("loaded_at") or time.time()),
                        "owned_by": "local-llm-runner"
                    }
                ]
            }
    return {"object": "list", "data": []}


def action_chat_completion(params=None):
    """Generates OpenAI-compatible chat completion. If stream=True, returns generator yielding SSE chunks."""
    global METRICS
    params = params or {}
    messages = params.get("messages", [])
    stream = params.get("stream", True)
    temperature = float(params.get("temperature", 0.7))
    max_tokens = int(params.get("max_tokens", 1024))
    top_p = float(params.get("top_p", 0.95))

    with ACTIVE_MODEL_LOCK:
        if RUNNER_STATE != "running" or ACTIVE_MODEL["instance"] is None:
            raise ValueError("No model is currently loaded in LLM Runner. Please load a model first.")
        engine_type = ACTIVE_MODEL["engine_type"]
        instance = ACTIVE_MODEL["instance"]
        tokenizer = ACTIVE_MODEL.get("tokenizer")
        model_name = ACTIVE_MODEL.get("name", "local-llm")

    # 1. GGUF via llama.cpp
    if engine_type == "llama-cpp":
        if stream:
            def _gguf_stream():
                start_time = time.time()
                first_token_time = None
                token_count = 0
                completion_stream = instance.create_chat_completion(
                    messages=messages,
                    temperature=temperature,
                    max_tokens=max_tokens,
                    top_p=top_p,
                    stream=True
                )
                for chunk in completion_stream:
                    if first_token_time is None:
                        first_token_time = time.time()
                    token_count += 1
                    yield chunk

                total_time = max(0.001, time.time() - start_time)
                ttft = round(((first_token_time or start_time) - start_time) * 1000, 2)
                tps = round(token_count / total_time, 2)
                METRICS["last_ttft_ms"] = ttft
                METRICS["last_tokens_per_sec"] = tps
                METRICS["last_completion_tokens"] = token_count

            return _gguf_stream()
        else:
            res = instance.create_chat_completion(
                messages=messages,
                temperature=temperature,
                max_tokens=max_tokens,
                top_p=top_p,
                stream=False
            )
            return res

    # 2. AirLLM Generator
    elif engine_type == "airllm":
        prompt_text = ""
        for m in messages:
            role = m.get("role", "user")
            content = m.get("content", "")
            prompt_text += f"{role.capitalize()}: {content}\n"
        prompt_text += "Assistant: "

        inputs = tokenizer(prompt_text, return_tensors="pt")
        start_time = time.time()
        output_ids = instance.generate(
            inputs['input_ids'],
            max_new_tokens=max_tokens,
            use_cache=True
        )
        resp_text = tokenizer.decode(output_ids[0][len(inputs['input_ids'][0]):], skip_special_tokens=True)
        total_time = max(0.001, time.time() - start_time)
        METRICS["last_tokens_per_sec"] = round(len(resp_text.split()) / total_time, 2)
        METRICS["last_ttft_ms"] = round(total_time * 1000, 2)

        if stream:
            def _airllm_stream():
                # Stream words simulating chunks
                words = resp_text.split(" ")
                for i, w in enumerate(words):
                    time.sleep(0.015)
                    content = (w + " ") if i < len(words) - 1 else w
                    yield {
                        "id": f"chatcmpl-{int(time.time())}",
                        "object": "chat.completion.chunk",
                        "created": int(time.time()),
                        "model": model_name,
                        "choices": [{"index": 0, "delta": {"content": content}, "finish_reason": None}]
                    }
                yield {
                    "id": f"chatcmpl-{int(time.time())}",
                    "object": "chat.completion.chunk",
                    "created": int(time.time()),
                    "model": model_name,
                    "choices": [{"index": 0, "delta": {}, "finish_reason": "stop"}]
                }
            return _airllm_stream()
        else:
            return {
                "id": f"chatcmpl-{int(time.time())}",
                "object": "chat.completion",
                "created": int(time.time()),
                "model": model_name,
                "choices": [
                    {
                        "index": 0,
                        "message": {"role": "assistant", "content": resp_text},
                        "finish_reason": "stop"
                    }
                ]
            }

    # 3. Transformers HuggingFace Generator
    elif engine_type == "transformers":
        import torch
        from transformers import TextIteratorStreamer

        prompt_text = ""
        for m in messages:
            role = m.get("role", "user")
            content = m.get("content", "")
            prompt_text += f"<|im_start|>{role}\n{content}<|im_end|>\n"
        prompt_text += "<|im_start|>assistant\n"

        inputs = tokenizer(prompt_text, return_tensors="pt")
        device = next(instance.parameters()).device
        inputs = {k: v.to(device) for k, v in inputs.items()}

        if stream:
            streamer = TextIteratorStreamer(tokenizer, skip_prompt=True, skip_special_tokens=True)
            gen_kwargs = dict(
                inputs,
                streamer=streamer,
                max_new_tokens=max_tokens,
                temperature=temperature,
                top_p=top_p,
                do_sample=(temperature > 0.0)
            )

            threading.Thread(target=instance.generate, kwargs=gen_kwargs, daemon=True).start()

            def _transformers_stream():
                start_time = time.time()
                first_token = None
                tokens = 0
                for new_text in streamer:
                    if first_token is None:
                        first_token = time.time()
                    tokens += 1
                    yield {
                        "id": f"chatcmpl-{int(time.time())}",
                        "object": "chat.completion.chunk",
                        "created": int(time.time()),
                        "model": model_name,
                        "choices": [{"index": 0, "delta": {"content": new_text}, "finish_reason": None}]
                    }
                total_time = max(0.001, time.time() - start_time)
                METRICS["last_ttft_ms"] = round(((first_token or start_time) - start_time) * 1000, 2)
                METRICS["last_tokens_per_sec"] = round(tokens / total_time, 2)
                yield {
                    "id": f"chatcmpl-{int(time.time())}",
                    "object": "chat.completion.chunk",
                    "created": int(time.time()),
                    "model": model_name,
                    "choices": [{"index": 0, "delta": {}, "finish_reason": "stop"}]
                }

            return _transformers_stream()
        else:
            with torch.no_grad():
                output = instance.generate(
                    **inputs,
                    max_new_tokens=max_tokens,
                    temperature=temperature,
                    top_p=top_p
                )
            generated_text = tokenizer.decode(output[0][len(inputs["input_ids"][0]):], skip_special_tokens=True)
            return {
                "id": f"chatcmpl-{int(time.time())}",
                "object": "chat.completion",
                "created": int(time.time()),
                "model": model_name,
                "choices": [
                    {
                        "index": 0,
                        "message": {"role": "assistant", "content": generated_text},
                        "finish_reason": "stop"
                    }
                ]
            }

    raise ValueError(f"Unsupported engine type: {engine_type}")
