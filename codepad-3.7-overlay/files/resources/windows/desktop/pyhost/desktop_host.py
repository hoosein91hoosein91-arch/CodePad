"""CodePad desktop host: runs one project with real CPython and talks to the app over JSON lines.

stdout carries protocol messages only (user output is wrapped as {"stream": ...}); stdin carries input replies.
It reuses codepad_runtime.run (the same runner as the Android build), so argv/env/getpass/input() behave identically.
"""
import json
import os
import sys
import threading

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)

_out = sys.stdout
_in = sys.__stdin__
for _stream, _kw in ((_out, {"encoding": "utf-8", "newline": "\n"}), (_in, {"encoding": "utf-8"})):
    try:
        _stream.reconfigure(**_kw)
    except Exception:  # pragma: no cover - very old interpreters
        pass
_lock = threading.Lock()


def send(obj):
    line = json.dumps(obj, ensure_ascii=False)
    with _lock:
        _out.write(line + "\n")
        _out.flush()


import codepad_runtime  # noqa: E402  (needs HERE on sys.path)


class Bridge:
    def __init__(self):
        self.sequence = 0

    def write(self, kind, text):
        send({"stream": True, "kind": kind, "text": text})

    def flush(self):
        pass

    def finish(self, failure):
        send({"done": True, "failure": failure or ""})

    def requestInput(self, prompt):
        self.sequence += 1
        send({"inputRequest": True, "requestId": self.sequence, "prompt": str(prompt)})
        line = _in.readline()
        if not line:
            return None
        reply = json.loads(line)
        return None if reply.get("eof") else str(reply.get("value", ""))

    def display(self, payload):
        send({"image": json.loads(payload)})


def main():
    payload = open(sys.argv[1], encoding="utf-8").read()
    codepad_runtime.run(payload, sys.argv[2], Bridge())


if __name__ == "__main__":
    main()
