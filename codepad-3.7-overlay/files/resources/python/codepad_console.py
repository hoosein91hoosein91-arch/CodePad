"""Line input shared by native CPython and the browser interpreter.

In the CodePad editor nothing is ever asked in a dialog: whatever a program asks with input(), sys.stdin or getpass is
answered from the "prepared input" box (one answer per line), like a terminal that was given a file. When the answers run
out the program gets a normal EOFError with a clear message, so it never hangs waiting for a window.

Exported standalone apps (interactive=True) have no such box, so there the app asks its user through `request`.
Returning None from `request` means EOF; an empty string is a valid submitted line.
"""
import builtins
import io
import sys

SECRET_MARK = "\x01secret\x01"  # marks a masked prompt for the exported apps' own input dialog
EOF_MESSAGE = (
    "ورودی آماده تمام شد: برنامه جواب دیگری خواست ولی در کادر «ورودی آماده» جوابی نمانده بود. "
    "جواب‌ها را (هر خط یک جواب) در همان کادر بنویس و دوباره اجرا کن."
)


class ConsoleInput(io.TextIOBase):
    def __init__(self, request=None, prefill="", interactive=False):
        super().__init__()
        self.request = request if interactive else None  # the editor never asks interactively
        self.interactive = bool(interactive and request)
        self.pending = str(prefill or "")
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
        return self.interactive

    def _fill(self):
        if not self.interactive or self.eof:
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
        end = len(self.pending) if size < 0 else min(size, len(self.pending))
        result, self.pending = self.pending[:end], self.pending[end:]
        return result


def install_input(request=None, prefill="", interactive=False):
    stream = ConsoleInput(request, prefill, interactive)

    def console_input(prompt=""):
        prompt = str(prompt)
        sys.stdout.write(prompt)
        sys.stdout.flush()
        stream.prompt = prompt
        line = stream.readline()
        if not line:
            sys.stdout.write("\n")
            sys.stdout.flush()
            raise EOFError(EOF_MESSAGE if not stream.interactive else "EOF when reading a line")
        result = line[:-1] if line.endswith("\n") else line
        sys.stdout.write(result + "\n")  # echo the prepared answer like a terminal would
        sys.stdout.flush()
        return result

    def console_getpass(prompt="Password: ", stream_=None, *, echo_char=None):
        # Same source as input(); the answer is not echoed.
        prompt = str(prompt)
        sys.stdout.write(prompt)
        sys.stdout.flush()
        stream.prompt = SECRET_MARK + prompt if stream.interactive else ""
        line = stream.readline()
        sys.stdout.write("\n")
        sys.stdout.flush()
        if not line:
            raise EOFError(EOF_MESSAGE if not stream.interactive else "EOF when reading a line")
        return line[:-1] if line.endswith("\n") else line

    sys.stdin = stream
    builtins.input = console_input
    try:
        import getpass
        getpass.getpass = console_getpass
    except Exception:  # pragma: no cover - getpass is part of the standard library
        pass
    return stream
