import http.client
import sys
import threading
import unittest
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from server import RequestHandler, ThreadedHTTPServer


class SecurityTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        # Synthetic local fixture, never a production credential.
        cls.token = "a" * 64
        cls.server = ThreadedHTTPServer(("127.0.0.1", 0), RequestHandler, cls.token)
        cls.thread = threading.Thread(target=cls.server.serve_forever, daemon=True)
        cls.thread.start()

    @classmethod
    def tearDownClass(cls):
        cls.server.shutdown()
        cls.server.server_close()
        cls.thread.join()

    def request(self, path="/health", method="GET", headers=None, body=None):
        conn = http.client.HTTPConnection("127.0.0.1", self.server.server_port, timeout=3)
        conn.request(method, path, body=body, headers=headers or {})
        response = conn.getresponse()
        status, response_headers, data = response.status, dict(response.getheaders()), response.read()
        conn.close()
        return status, response_headers, data

    def auth(self, **headers):
        return {"Authorization": "Bearer " + self.token, **headers}

    def test_health_requires_current_token(self):
        self.assertEqual(self.request()[0], 401)
        self.assertEqual(self.request(headers={"Authorization": "Bearer old-token"})[0], 401)
        self.assertEqual(self.request(headers=self.auth())[0], 200)

    def test_untrusted_browser_and_host_rejected_even_with_token(self):
        for headers in [self.auth(Origin="https://evil.example"), self.auth(Origin="null"), self.auth(Host="rebind.example")]:
            self.assertEqual(self.request(headers=headers)[0], 403)

    def test_only_trusted_preflights(self):
        status, headers, _ = self.request(method="OPTIONS", headers={"Origin": "https://oxygenlow.com"})
        self.assertEqual(status, 204)
        self.assertEqual(headers["Access-Control-Allow-Origin"], "https://oxygenlow.com")
        self.assertEqual(self.request(method="OPTIONS", headers={"Origin": "https://evil.example"})[0], 403)

    def test_shutdown_and_actions_cannot_be_called_without_auth(self):
        with patch.object(RequestHandler, "_stop_server_delayed") as stop, patch("server.registry.execute_action") as action:
            for path in ["/shutdown", "/api/apps/example/ping"]:
                self.assertEqual(self.request(path, "POST", body="{}")[0], 401)
            stop.assert_not_called()
            action.assert_not_called()

    def test_authorized_action_and_safe_errors(self):
        with patch("server.registry.execute_action", return_value={"pong": True}) as action:
            self.assertEqual(self.request("/api/apps/example/ping", "POST", self.auth(), "{}")[0], 200)
            action.assert_called_once_with("example", "ping", {})
        with patch("server.registry.execute_action", side_effect=RuntimeError("private-path")):
            status, _, data = self.request("/api/apps/example/ping", "POST", self.auth(), "{}")
            self.assertEqual(status, 500)
            self.assertNotIn(b"private-path", data)

    def test_malformed_and_oversized_requests(self):
        for length, status in [("-1", 400), ("bad", 400), (str(RequestHandler.MAX_BODY_BYTES + 1), 413)]:
            self.assertEqual(self.request("/api/apps/example/ping", "POST", self.auth(**{"Content-Length": length}), "")[0], status)
        for body in ["[]", "null", "{broken"]:
            self.assertEqual(self.request("/api/apps/example/ping", "POST", self.auth(), body)[0], 400)
        self.assertEqual(self.request("/api/apps/example/ping", "POST", self.auth(**{"Transfer-Encoding": "chunked"}), "{}")[0], 400)


if __name__ == "__main__":
    unittest.main()
