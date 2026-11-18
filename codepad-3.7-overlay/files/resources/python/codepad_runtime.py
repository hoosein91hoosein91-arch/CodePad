"""Native CPython entry point. User source remains unchanged on disk.

Each run uses its own Android process. Android's app permissions still apply.
"""
import asyncio
import base64
import builtins
import importlib
import hashlib
import io
import json
import os
from pathlib import Path, PurePosixPath
import shutil
import sys
import traceback
import types

from codepad_console import install_input


def safe_path(name):
    if (not isinstance(name, str) or not name or len(name) > 240
            or name.startswith("/") or "\\" in name or ":" in name
            or any(ord(c) < 32 or ord(c) == 127 for c in name)
            or any(part in ("", ".", "..") for part in name.split("/"))):
        raise ValueError("مسیر فایل پروژه نامعتبر است.")
    return PurePosixPath(name)


class Output(io.TextIOBase):
    def __init__(self, bridge, kind):
        super().__init__()
        self.bridge, self.kind = bridge, kind

    @property
    def encoding(self):
        return "utf-8"

    def writable(self):
        return True

    def write(self, text):
        if not isinstance(text, str):
            raise TypeError("write() argument must be str")
        if text:
            self.bridge.write(self.kind, text)
        return len(text)

    def flush(self):
        self.bridge.flush()


BLOCKED_ENV = {"LD_PRELOAD", "LD_LIBRARY_PATH", "PYTHONPATH", "PYTHONHOME", "PYTHONSTARTUP", "PATH"}


def run(payload, files_dir, bridge):
    saved_env = {}
    previous = (sys.stdin, sys.stdout, sys.stderr, builtins.input,
                os.getcwd(), sys.path[:], sys.argv[:], sys.modules.get("__main__"))
    failure = ""
    try:
        sys.stdout, sys.stderr = Output(bridge, "out"), Output(bridge, "err")
        import codepad
        codepad._display = bridge.display if hasattr(bridge,"display") else None
        data = json.loads(payload)
        identity = str(data.get("projectKey") or "console")
        home = Path(files_dir) / "codepad-cpython" / hashlib.sha256(identity.encode()).hexdigest()[:24]
        root = home / "workspace"
        if root.is_symlink():
            raise ValueError("پوشهٔ پروژه نباید پیوند باشد.")
        root.mkdir(parents=True, exist_ok=True)
        manifest = home / "mounted.json"
        old = json.loads(manifest.read_text()) if manifest.is_file() else []
        names = set()
        def destination(name):
            file = root / str(safe_path(name))
            if not file.resolve().is_relative_to(root.resolve()):
                raise ValueError("مسیر فایل خارج از پروژه است.")
            if file.is_symlink():
                raise ValueError("فایل پروژه نباید پیوند باشد.")
            return file
        for asset in data.get("assets", []):
            name = str(safe_path(asset["name"]))
            if name in names:
                raise ValueError("فایل تکراری در پروژه: " + name)
            names.add(name)
            file = destination(name)
            file.parent.mkdir(parents=True, exist_ok=True)
            if asset.get("localPath"):
                cache = Path(files_dir).parent / "cache" / "codepad-cpython-imports"
                source = Path(asset["localPath"]).resolve()
                if not source.is_relative_to(cache.resolve()) or not source.is_file():
                    raise ValueError("پیوست آماده‌شده در دسترس نیست.")
                shutil.copyfile(source, file)
            else:
                file.write_bytes(base64.b64decode(asset.get("b64", ""), validate=True))
        entry_name = str(safe_path(data.get("entryFile") or "main.py"))
        names.add(entry_name)
        for name in set(old) - names:
            file = destination(name)
            if file.is_file():
                file.unlink()
        manifest.write_text(json.dumps(sorted(names)), encoding="utf-8")
        entry = destination(entry_name)
        entry.parent.mkdir(parents=True, exist_ok=True)
        source = data.get("code", "")
        entry.write_text(source, encoding="utf-8")
        os.chdir(root)
        sys.dont_write_bytecode = True
        sys.path[:0] = [str(entry.parent), str(root)]
        config = data.get("runConfig") if isinstance(data.get("runConfig"), dict) else {}
        sys.argv = [str(entry)] + [str(a) for a in (config.get("argv") or [])][:64]
        for key, value in (config.get("env") or {}).items():
            if isinstance(key, str) and key.isidentifier() and key.upper() not in BLOCKED_ENV:
                saved_env.setdefault(key, os.environ.get(key))
                os.environ[key] = str(value)[:4000]
        importlib.invalidate_caches()
        install_input(bridge.requestInput, data.get("stdin", ""), bool(data.get("interactive")))
        module = types.ModuleType("__main__")
        module.__file__ = str(entry)
        module.__package__ = None
        sys.modules["__main__"] = module
        # A regular native Python interpreter: compile once, execute once.
        exec(compile(source, str(entry), "exec"), module.__dict__)
    except SystemExit as error:
        if error.code not in (None, 0):
            failure = "SystemExit: " + str(error.code) + "\n"
    except BaseException:
        failure = traceback.format_exc()
    finally:
        bridge.finish(failure)
        (sys.stdin, sys.stdout, sys.stderr, builtins.input, cwd,
         paths, argv, main) = previous
        os.chdir(cwd)
        for key, value in saved_env.items():
            if value is None:
                os.environ.pop(key, None)
            else:
                os.environ[key] = value
        sys.path[:] = paths
        sys.argv = argv
        if main is not None:
            sys.modules["__main__"] = main
