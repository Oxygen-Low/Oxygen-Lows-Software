import http.client
import json
import socket
import sys
import threading
import unittest
from pathlib import Path
from unittest.mock import Mock, patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from server import RequestHandler, ThreadedHTTPServer


class ConcurrencyTests(unittest.TestCase):
    def setUp(self):
        # Synthetic local fixture, never a production credential.
        self.token = "a" * 64
        self.server = ThreadedHTTPServer(("127.0.0.1", 0), RequestHandler, self.token)
        self.addCleanup(self.server.server_close)
        # Reserve every worker slot deterministically, without timing sleeps.
        for _ in range(32):
            self.assertTrue(self.server.request_slots.acquire(blocking=False))
            self.addCleanup(self.server.request_slots.release)

    def test_overload_returns_503_and_recovers_when_capacity_is_available(self):
        thread = threading.Thread(target=self.server.serve_forever, daemon=True)
        thread.start()
        self.addCleanup(thread.join)
        self.addCleanup(self.server.shutdown)

        conn = http.client.HTTPConnection("127.0.0.1", self.server.server_port, timeout=3)
        self.addCleanup(conn.close)
        conn.request("GET", "/health", headers={"Authorization": "Bearer " + self.token})
        response = conn.getresponse()
        body = response.read()
        self.assertEqual(response.status, 503)
        self.assertEqual(response.getheader("Content-Type"), "application/json")
        self.assertEqual(response.getheader("Connection"), "close")
        self.assertEqual(int(response.getheader("Content-Length")), len(body))
        self.assertEqual(json.loads(body), {"error": "Server busy"})
        self.assertFalse(self.server.request_slots.acquire(blocking=False))

        self.server.request_slots.release()
        try:
            conn.request("GET", "/health", headers={"Authorization": "Bearer " + self.token})
            response = conn.getresponse()
            self.assertEqual(response.status, 200)
            self.assertEqual(json.loads(response.read())["status"], "ok")
        finally:
            # Wait for the worker to finish before restoring the reserved slot.
            self.assertTrue(self.server.request_slots.acquire(timeout=3))

    def test_overload_closes_failed_sends_without_releasing_a_slot(self):
        for error in (BrokenPipeError(), ConnectionResetError(), socket.timeout()):
            with self.subTest(error=type(error).__name__):
                request = Mock(spec=socket.socket)
                request.sendall.side_effect = error
                with patch.object(self.server, "shutdown_request") as shutdown, patch.object(
                    self.server, "process_request_thread"
                ) as worker:
                    self.server.process_request(request, ("127.0.0.1", 12345))
                request.settimeout.assert_called_once_with(1)
                request.sendall.assert_called_once()
                shutdown.assert_called_once_with(request)
                worker.assert_not_called()
                self.assertFalse(self.server.request_slots.acquire(blocking=False))


if __name__ == "__main__":
    unittest.main()
