"""Line input shared by native CPython and the browser interpreter.

The transport blocks/suspends this stack, never replays the user's program.
Returning None means EOF; an empty string is a valid submitted line.
"""
import builtins
import io
import sys

SECRET_MARK = "\x01secret\x01"


class ConsoleInput(io.TextIOBase):
    def __init__(self, request, prefill=""):
        super().__init__()
        self.request = request
        self.pending = str(prefill)
        if self.pending and not self.pending.endswith("\n"):
            self.pending += "\n"
        self.eof = False
        self.prompt = ""

    @property
    def encoding(self):
        return "utf-8"

    def readable(self):
        return True

    def isatty(self):
        return True

    def _fill(self):
        if self.eof:
            return False
        sys.stdout.flush()
        sys.stderr.flush()
        answer = self.request(self.prompt)
        self.prompt = ""
        if answer is None:
            self.eof = True
            return False
        self.pending += str(answer) + "\n"
        return True

    def readline(self, size=-1):
        self._checkClosed()
        if size == 0:
            return ""
        while not self.pending and self._fill():
            pass
        end = self.pending.find("\n") + 1
        if end == 0:
            end = len(self.pending)
        if size >= 0:
            end = min(end, size)
        result, self.pending = self.pending[:end], self.pending[end:]
        return result

    def read(self, size=-1):
        self._checkClosed()
        if size == 0:
            return ""
        while (size < 0 or len(self.pending) < size) and self._fill():
            pass
        end = len(self.pending) if size < 0 else size
        result, self.pending = self.pending[:end], self.pending[end:]
        return result


def install_input(request, prefill=""):
    stream = ConsoleInput(request, prefill)

    def console_input(prompt=""):
        prompt = str(prompt)
        sys.stdout.write(prompt)
        sys.stdout.flush()
        stream.prompt = prompt
        line = stream.readline()
        if not line:
            raise EOFError("EOF when reading a line")
        result = line[:-1] if line.endswith("\n") else line
        sys.stdout.write(result + "\n")
        sys.stdout.flush()
        return result

    def console_getpass(prompt="Password: ", stream_=None, *, echo_char=None):
        # Same prompt channel as input(), marked secret so the UI masks it; the answer is never echoed.
        prompt = str(prompt)
        sys.stdout.write(prompt)
        sys.stdout.flush()
        stream.prompt = SECRET_MARK + prompt
        line = stream.readline()
        sys.stdout.write("\n")
        sys.stdout.flush()
        if not line:
            raise EOFError("EOF when reading a line")
        return line[:-1] if line.endswith("\n") else line

    sys.stdin = stream
    builtins.input = console_input
    try:
        import getpass
        getpass.getpass = console_getpass
    except Exception:  # pragma: no cover - getpass is part of the standard library
        pass
    return stream
