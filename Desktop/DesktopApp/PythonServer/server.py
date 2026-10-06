import sys
import os
import time
import json
import socket
import argparse
import threading
import logging
import hmac
from http.server import HTTPServer, BaseHTTPRequestHandler
from socketserver import ThreadingMixIn
from urllib.parse import urlparse, unquote

# Add parent directory to sys.path if needed
CURRENT_DIR = os.path.dirname(os.path.abspath(__file__))
if CURRENT_DIR not in sys.path:
    sys.path.insert(0, CURRENT_DIR)

from apps import registry

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] [%(name)s] %(message)s"
)
logger = logging.getLogger("PythonServer")

START_TIME = time.time()
HTTP_SERVER = None

class ThreadedHTTPServer(ThreadingMixIn, HTTPServer):
    daemon_threads = True
    allow_reuse_address = True

    def __init__(self, address, handler, auth_token):
        if not auth_token or len(auth_token) < 64:
            raise ValueError("A per-process authentication token is required")
        self.auth_token = auth_token
        self.request_slots = threading.BoundedSemaphore(32)
        super().__init__(address, handler)

    def process_request(self, request, client_address):
        if not self.request_slots.acquire(blocking=False):
            self.shutdown_request(request)
            return
        try:
            super().process_request(request, client_address)
        except Exception:
            self.request_slots.release()
            raise

    def process_request_thread(self, request, client_address):
        try:
            super().process_request_thread(request, client_address)
        finally:
            self.request_slots.release()

class RequestHandler(BaseHTTPRequestHandler):
    server_version = "OxygenLowsPythonServer/1.0"

    MAX_BODY_BYTES = 1024 * 1024
    ALLOWED_ORIGINS = {"https://oxygenlow.com", "https://www.oxygenlow.com"}

    def setup(self):
        super().setup()
        self.connection.settimeout(5)

    def _error(self, status, message):
        self._set_headers(status)
        self.wfile.write(json.dumps({"error": message}).encode("utf-8"))

    def _authorize(self, preflight=False):
        hosts = {f"127.0.0.1:{self.server.server_port}", f"localhost:{self.server.server_port}"}
        if len(self.headers.get_all("Host", [])) != 1 or self.headers.get("Host") not in hosts:
            self._error(403, "Forbidden")
            return False
        origins = self.headers.get_all("Origin", [])
        if len(origins) > 1 or (origins and origins[0] not in self.ALLOWED_ORIGINS):
            self._error(403, "Forbidden")
            return False
        if not preflight:
            supplied = self.headers.get("Authorization", "").encode("utf-8")
            expected = ("Bearer " + self.server.auth_token).encode("utf-8")
            if len(self.headers.get_all("Authorization", [])) != 1 or not hmac.compare_digest(supplied, expected):
                self._error(401, "Unauthorized")
                return False
        return True

    def _set_headers(self, status=200, content_type="application/json"):
        self.send_response(status)
        self.send_header("Content-Type", content_type)
        origin = self.headers.get("Origin")
        if origin in self.ALLOWED_ORIGINS:
            self.send_header("Access-Control-Allow-Origin", origin)
        self.send_header("Vary", "Origin")
        self.send_header("Cache-Control", "no-store")
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Requested-With")
        self.end_headers()

    def do_OPTIONS(self):
        if self._authorize(preflight=True):
            self._set_headers(204)

    def do_GET(self):
        if not self._authorize():
            return
        parsed = urlparse(self.path)
        path = parsed.path.rstrip("/")
        if not path:
            path = "/"

        if path == "/health":
            uptime = time.time() - START_TIME
            self._set_headers(200)
            self.wfile.write(json.dumps({
                "status": "ok",
                "uptime": round(uptime, 2),
                "pid": os.getpid(),
                "port": self.server.server_port
            }).encode("utf-8"))
            return

        elif path == "/api/status":
            self._set_headers(200)
            self.wfile.write(json.dumps({
                "status": "ok",
                "python_version": sys.version,
                "executable": sys.executable,
                "environment_prefix": sys.prefix,
                "loaded_apps": [app["id"] for app in registry.list_apps()]
            }).encode("utf-8"))
            return

        elif path == "/api/apps":
            self._set_headers(200)
            self.wfile.write(json.dumps({
                "status": "ok",
                "apps": registry.list_apps()
            }).encode("utf-8"))
            return

        self._set_headers(404)
        self.wfile.write(json.dumps({
            "error": "Not Found",
            "path": self.path
        }).encode("utf-8"))

    def do_POST(self):
        if not self._authorize():
            return
        parsed = urlparse(self.path)
        path = parsed.path.rstrip("/")

        lengths = self.headers.get_all("Content-Length", [])
        if self.headers.get("Transfer-Encoding") or len(lengths) != 1 or not lengths[0].isascii() or not lengths[0].isdigit():
            self._error(400, "Invalid content length")
            return
        if len(lengths[0]) > 10 or int(lengths[0]) > self.MAX_BODY_BYTES:
            self._error(413, "Request too large")
            return
        content_length = int(lengths[0])
        try:
            body = self.rfile.read(content_length)
            if len(body) != content_length:
                self._error(400, "Incomplete request")
                return
        except (TimeoutError, socket.timeout):
            self._error(408, "Request timeout")
            return
        try:
            json_data = json.loads(body.decode("utf-8")) if body else {}
            if not isinstance(json_data, dict):
                raise ValueError()
        except (ValueError, UnicodeError):
            self._error(400, "Invalid JSON body")
            return

        if path == "/shutdown":
            self._set_headers(200)
            self.wfile.write(json.dumps({"status": "shutting_down"}).encode("utf-8"))
            logger.info("Shutdown endpoint requested. Initiating server stop.")
            threading.Thread(target=self._stop_server_delayed, daemon=True).start()
            return

        # Route /api/apps/<app_id>/<action>
        if path.startswith("/api/apps/"):
            parts = path.split("/")[3:]
            if len(parts) >= 2:
                app_id = parts[0]
                action = parts[1]
                try:
                    res = registry.execute_action(app_id, action, json_data)
                    self._set_headers(200)
                    self.wfile.write(json.dumps({"status": "ok", "data": res}).encode("utf-8"))
                    return
                except ValueError as ve:
                    self._set_headers(404)
                    self.wfile.write(json.dumps({"error": str(ve)}).encode("utf-8"))
                    return
                except Exception as ex:
                    logger.error(f"Error executing {app_id}.{action}: {ex}", exc_info=True)
                    self._set_headers(500)
                    self.wfile.write(json.dumps({"error": "Internal server error"}).encode("utf-8"))
                    return

        self._set_headers(404)
        self.wfile.write(json.dumps({
            "error": "Endpoint not found",
            "path": self.path
        }).encode("utf-8"))

    def _stop_server_delayed(self):
        time.sleep(0.3)
        if HTTP_SERVER:
            HTTP_SERVER.shutdown()
        os._exit(0)

    def log_message(self, format, *args):
        # Override default BaseHTTPRequestHandler logging to route through standard logger
        logger.debug("%s - %s", self.address_string(), format % args)


def stdin_watcher():
    """Monitors standard input for EOF. If parent closes stdin, terminates immediately."""
    try:
        while True:
            line = sys.stdin.readline()
            if not line:
                logger.info("Parent closed standard input stream. Exiting.")
                os._exit(0)
    except Exception:
        os._exit(0)


def parent_process_watcher(parent_pid: int):
    """Monitors parent process ID. When parent exits, terminates child immediately."""
    if parent_pid <= 0:
        return

    logger.info(f"Parent process watchdog active for PID {parent_pid}")

    if sys.platform == "win32":
        try:
            import ctypes
            kernel32 = ctypes.windll.kernel32
            SYNCHRONIZE = 0x00100000
            PROCESS_QUERY_LIMITED_INFORMATION = 0x1000
            process_handle = kernel32.OpenProcess(SYNCHRONIZE | PROCESS_QUERY_LIMITED_INFORMATION, False, parent_pid)
            if not process_handle:
                logger.warning(f"Unable to acquire handle to parent PID {parent_pid}. Assuming terminated.")
                os._exit(0)

            while True:
                # 1000ms wait chunk
                result = kernel32.WaitForSingleObject(process_handle, 1000)
                if result == 0:  # WAIT_OBJECT_0
                    logger.info(f"Parent process {parent_pid} exited. Stopping Python server.")
                    os._exit(0)
        except Exception as e:
            logger.error(f"Error in Windows parent process watchdog: {e}")
            os._exit(0)
    else:
        while True:
            time.sleep(1.0)
            try:
                os.kill(parent_pid, 0)
            except OSError:
                logger.info(f"Parent process {parent_pid} no longer running. Exiting.")
                os._exit(0)


def find_available_port(preferred_port: int) -> int:
    """Checks if preferred port is available, or finds an OS-assigned free port."""
    if preferred_port > 0:
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
            try:
                s.bind(("127.0.0.1", preferred_port))
                return preferred_port
            except OSError:
                logger.warning(f"Preferred port {preferred_port} is busy, selecting dynamic port...")
    
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        s.bind(("127.0.0.1", 0))
        return s.getsockname()[1]


def main():
    global HTTP_SERVER

    parser = argparse.ArgumentParser(description="Oxygen Low's Software Desktop Python Background Server")
    parser.add_argument("--port", type=int, default=54123, help="Port to bind (default: 54123)")
    parser.add_argument("--parent-pid", type=int, default=0, help="Parent process PID to monitor")
    parser.add_argument("--watch-stdin", action="store_true", help="Monitor stdin for EOF to terminate")
    args = parser.parse_args()

    # Consume the secret before loading apps; never put it in arguments or logs.
    auth_token = os.environ.pop("OXYGEN_PYTHON_TOKEN", "")
    if len(auth_token) < 64:
        parser.error("A per-process authentication token is required")

    # Start watchers
    if args.watch_stdin and sys.stdin:
        threading.Thread(target=stdin_watcher, daemon=True).start()
    if args.parent_pid > 0:
        threading.Thread(target=parent_process_watcher, args=(args.parent_pid,), daemon=True).start()

    # Discover and load apps
    apps_dir = os.path.join(CURRENT_DIR, "apps")
    registry.discover_and_load(apps_dir)

    # Bind server
    port = find_available_port(args.port)
    server_address = ("127.0.0.1", port)
    HTTP_SERVER = ThreadedHTTPServer(server_address, RequestHandler, auth_token)

    logger.info(f"Python server starting on http://127.0.0.1:{port}")
    # Write handshake to stdout for DesktopApp
    print(f"READY:{port}:http://127.0.0.1:{port}", flush=True)

    try:
        HTTP_SERVER.serve_forever()
    except KeyboardInterrupt:
        logger.info("Server received interrupt, exiting.")
    finally:
        if HTTP_SERVER:
            HTTP_SERVER.server_close()

if __name__ == "__main__":
    main()
