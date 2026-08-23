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
