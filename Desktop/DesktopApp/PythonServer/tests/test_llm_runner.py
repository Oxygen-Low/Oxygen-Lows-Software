import unittest
import os
import tempfile
import sys
from pathlib import Path
from unittest.mock import MagicMock, patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from apps import llm_runner
from apps import python_manager


class LLMRunnerTests(unittest.TestCase):
    def setUp(self):
        self.temp_dir = tempfile.TemporaryDirectory()
        self.original_models_dir = llm_runner.MODELS_DIR
        llm_runner.MODELS_DIR = self.temp_dir.name

    def tearDown(self):
        llm_runner._safe_unload_active()
        llm_runner.MODELS_DIR = self.original_models_dir
        self.temp_dir.cleanup()

    def test_list_models_empty(self):
        res = llm_runner.action_list_models()
        self.assertIn("models", res)
        self.assertEqual(len(res["models"]), 0)

    def test_list_models_with_gguf_and_safetensors(self):
        gguf_path = os.path.join(self.temp_dir.name, "test_model_Q4_K_M.gguf")
        with open(gguf_path, "wb") as f:
            f.write(b"GGUF" + b"\x00" * 100)

        st_path = os.path.join(self.temp_dir.name, "weights.safetensors")
        with open(st_path, "wb") as f:
            f.write(b"SAFETENSORS" + b"\x00" * 50)

        res = llm_runner.action_list_models()
        self.assertEqual(len(res["models"]), 2)
        models_by_fmt = {m["format"]: m for m in res["models"]}
        self.assertIn("gguf", models_by_fmt)
        self.assertIn("safetensors", models_by_fmt)
        self.assertEqual(models_by_fmt["gguf"]["quantization"], "Q4_K_M")

    def test_get_models_dir(self):
        res = llm_runner.action_get_models_dir()
        self.assertTrue(res["exists"])
        self.assertEqual(res["models_dir"], self.temp_dir.name)

    def test_status_when_stopped(self):
        status = llm_runner.action_get_status()
        self.assertEqual(status["state"], "stopped")
        self.assertFalse(status["is_active"])
        self.assertIsNone(status["active_model"])

    def test_unload_model_when_idle(self):
        res = llm_runner.action_unload_model()
        self.assertEqual(res["status"], "ok")
        self.assertEqual(res["state"], "stopped")

    def test_chat_completion_fails_if_not_running(self):
        with self.assertRaises(ValueError):
            llm_runner.action_chat_completion({"messages": [{"role": "user", "content": "hi"}]})


class PythonManagerTests(unittest.TestCase):
    def test_get_server_overview(self):
        res = python_manager.action_get_server_overview()
        self.assertEqual(res["status"], "running")
        self.assertGreater(res["pid"], 0)
        self.assertIn("python_version", res)
        self.assertIn("loaded_apps", res)

    def test_list_dependencies(self):
        res = python_manager.action_list_dependencies()
        self.assertIn("dependencies", res)
        self.assertIn("cuda", res)
        dep_names = [d["name"] for d in res["dependencies"]]
        self.assertIn("torch", dep_names)
        self.assertIn("airllm", dep_names)
        self.assertIn("llama-cpp-python", dep_names)

    def test_log_actions(self):
        clear_res = python_manager.action_clear_logs()
        self.assertTrue(clear_res["cleared"])

        # Write test log
        python_manager.logger.warning("Test warning log entry")
        logs_res = python_manager.action_get_logs({"level": "WARNING"})
        self.assertGreaterEqual(logs_res["total_count"], 1)
        found = any("Test warning log entry" in l["message"] for l in logs_res["logs"])
        self.assertTrue(found)


if __name__ == "__main__":
    unittest.main()
