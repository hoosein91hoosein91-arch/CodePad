"""Line input shared by native CPython and the browser interpreter.

CodePad never opens a question dialog. Whatever a program asks with input(), sys.stdin or getpass is answered from the
"prepared input" box (one answer per line), exactly like a terminal that was given a file. When the answers run out the
program gets a normal EOF (EOFError) with a clear message, so it never hangs waiting for a window.
"""
import builtins
import io
import sys

SECRET_MARK = "\x01secret\x01"  # kept for compatibility with older callers; no longer shown anywhere
EOF_MESSAGE = (
    "ورودی آماده تمام شد: برنامه جواب دیگری خواست ولی در کادر «ورودی آماده» جوابی نمانده بود. "
    "جواب‌ها را (هر خط یک جواب) در همان کادر بنویس و دوباره اجرا کن."
)


class ConsoleInput(io.TextIOBase):
    def __init__(self, request=None, prefill=""):
        super().__init__()
        self.request = request  # ignored: nothing is ever asked interactively
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
        return False

    def readline(self, size=-1):
        self._checkClosed()
        if size == 0:
            return ""
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
        end = len(self.pending) if size < 0 else min(size, len(self.pending))
        result, self.pending = self.pending[:end], self.pending[end:]
        return result


def install_input(request=None, prefill=""):
    stream = ConsoleInput(request, prefill)

    def console_input(prompt=""):
        prompt = str(prompt)
        sys.stdout.write(prompt)
        sys.stdout.flush()
        line = stream.readline()
        if not line:
            sys.stdout.write("\n")
            sys.stdout.flush()
            raise EOFError(EOF_MESSAGE)
        result = line[:-1] if line.endswith("\n") else line
        sys.stdout.write(result + "\n")  # echo the prepared answer like a terminal would
        sys.stdout.flush()
        return result

    def console_getpass(prompt="Password: ", stream_=None, *, echo_char=None):
        # Same source as input(); the answer is not echoed.
        prompt = str(prompt)
        sys.stdout.write(prompt)
        sys.stdout.flush()
        line = stream.readline()
        sys.stdout.write("\n")
        sys.stdout.flush()
        if not line:
            raise EOFError(EOF_MESSAGE)
        return line[:-1] if line.endswith("\n") else line

    sys.stdin = stream
    builtins.input = console_input
    try:
        import getpass
        getpass.getpass = console_getpass
    except Exception:  # pragma: no cover - getpass is part of the standard library
        pass
    return stream
