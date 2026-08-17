import sys
import platform
import time

METADATA = {
    "name": "Example App",
    "description": "Demonstration Python app integrated with Oxygen Low's Software desktop environment",
    "version": "1.0.0"
}

def register_app():
    return METADATA

def action_ping(params=None):
    """Simple ping action returning pong with timestamp."""
    return {
        "status": "pong",
        "timestamp": time.time()
    }

def action_echo(params=None):
    """Echoes received parameters back."""
    params = params or {}
    return {
        "echo": params.get("message", "No message provided"),
        "received_params": params
    }

def action_system_info(params=None):
    """Returns basic python runtime and host information."""
    return {
        "python_version": sys.version,
        "platform": platform.platform(),
        "architecture": platform.architecture(),
        "processor": platform.processor()
    }
