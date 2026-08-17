import os
import sys
import importlib
import importlib.util
import inspect
import logging

logger = logging.getLogger("PythonServer.Apps")

class AppRegistry:
    def __init__(self):
        self.apps = {}

    def discover_and_load(self, apps_dir: str):
        """Scans the given directory and loads all valid app modules."""
        if not os.path.exists(apps_dir):
            return

        for entry in os.listdir(apps_dir):
            if entry.startswith("_") or entry.startswith("."):
                continue
            
            full_path = os.path.join(apps_dir, entry)
            module_name = None

            if os.path.isfile(full_path) and entry.endswith(".py"):
                module_name = entry[:-3]
            elif os.path.isdir(full_path) and os.path.isfile(os.path.join(full_path, "__init__.py")):
                module_name = entry

            if module_name:
                self._load_app_module(module_name, full_path)

    def _load_app_module(self, name: str, path: str):
        try:
            if os.path.isfile(path):
                spec = importlib.util.spec_from_file_location(f"apps.{name}", path)
            else:
                spec = importlib.util.spec_from_file_location(f"apps.{name}", os.path.join(path, "__init__.py"))

            if spec and spec.loader:
                module = importlib.util.module_from_spec(spec)
                sys.modules[f"apps.{name}"] = module
                spec.loader.exec_module(module)

                if hasattr(module, "register_app"):
                    app_info = module.register_app()
                    self.apps[name] = {
                        "name": name,
                        "metadata": getattr(module, "METADATA", app_info if isinstance(app_info, dict) else {}),
                        "module": module,
                        "handler": getattr(module, "handle_action", None)
                    }
                    logger.info(f"Loaded app: {name}")
                elif hasattr(module, "handle_action"):
                    self.apps[name] = {
                        "name": name,
                        "metadata": getattr(module, "METADATA", {}),
                        "module": module,
                        "handler": module.handle_action
                    }
                    logger.info(f"Loaded app: {name}")
        except Exception as e:
            logger.error(f"Failed to load app '{name}': {e}", exc_info=True)

    def list_apps(self):
        result = []
        for name, item in self.apps.items():
            result.append({
                "id": name,
                "metadata": item.get("metadata", {}),
                "actions": self._get_actions(item.get("module"))
            })
        return result

    def _get_actions(self, module):
        if not module:
            return []
        if hasattr(module, "ACTIONS"):
            return getattr(module, "ACTIONS")
        actions = []
        for attr_name in dir(module):
            if attr_name.startswith("action_"):
                actions.append(attr_name[7:])
        return actions

    def execute_action(self, app_id: str, action: str, params: dict):
        if app_id not in self.apps:
            raise ValueError(f"App '{app_id}' not found")
        
        app_entry = self.apps[app_id]
        module = app_entry.get("module")
        handler = app_entry.get("handler")

        # Check for action_ specific function first
        action_func_name = f"action_{action}"
        if module and hasattr(module, action_func_name):
            func = getattr(module, action_func_name)
            sig = inspect.signature(func)
            if len(sig.parameters) == 0:
                return func()
            return func(params)

        if handler and callable(handler):
            return handler(action, params)

        raise ValueError(f"Action '{action}' not found on app '{app_id}'")

registry = AppRegistry()
