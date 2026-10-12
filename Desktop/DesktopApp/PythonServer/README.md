# Oxygen Low's Software - Python Background Server

This directory contains the Python backend service that runs automatically in the background when the Desktop App launches.

## Architecture

- **Dedicated Environment**: The desktop app provisions and manages an isolated Python Virtual Environment (`venv`) in `%LOCALAPPDATA%\OxygenLowsSoftware\PythonEnv`.
- **Lifecycle Management**:
  - Starts automatically alongside the desktop application.
  - Automatically terminates whenever the desktop application is closed, killed, or crashes (guaranteed by Windows Job Objects, stdin pipe monitoring, and PID watchdog).
- **Extensibility**:
  - Add new modular Python apps in the `apps/` directory.
  - Add required third-party dependencies to `requirements.txt`.

## Adding a New Python App

Create a new `.py` file (e.g. `apps/my_feature.py`):

```python
METADATA = {
    "name": "My Custom App",
    "description": "Performs custom Python operations",
    "version": "1.0.0"
}

def register_app():
    return METADATA

def action_process_data(params):
    # params contains JSON object sent from the frontend/desktop
    input_text = params.get("text", "")
    return {
        "result": input_text.upper()
    }
```

The server automatically discovers your app and provides:

- Discovery: `GET /api/apps`
- Execution: `POST /api/apps/my_feature/process_data`

## Local API security

The Windows manager generates a new 256-bit token for every child process and
passes it in `OXYGEN_PYTHON_TOKEN`. The child consumes this variable at startup.
Every GET/POST endpoint, including health and shutdown, requires
`Authorization: Bearer <token>`. Trusted top-level pages obtain the current token
from `get_python_server` or `python_server_ready` through the native bridge.
Keep the token in memory and refresh it after a restart; do not put it in URLs or logs.

Only the two production HTTPS web origins may call the API from a browser.
Requests require an explicit loopback Host with the bound port. JSON bodies are
limited to 1 MiB, connections time out after five seconds, and at most 32 requests
are handled concurrently. Run regression checks with
`python3 -m unittest discover -s Desktop/DesktopApp/PythonServer/tests` from the repository root.
