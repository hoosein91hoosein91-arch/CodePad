"""CodePad output helpers: Pillow images, and reports/files the user can Save or Share."""
import base64
import io
import json
import mimetypes
from pathlib import Path

_display = None


def display(image, title="Python graphics"):
    """Show a Pillow image (or image path) in CodePad's image output panel."""
    from PIL import Image
    if _display is None:
        raise RuntimeError("CodePad image output is not connected")
    if isinstance(image, (str, Path)):
        with Image.open(image) as original:
            value = original.copy()
    elif isinstance(image, Image.Image):
        value = image.copy()
    else:
        raise TypeError("display() needs a Pillow Image or image file path")
    value.thumbnail((2048, 2048))
    stream = io.BytesIO()
    value.save(stream, format="PNG")
    _display(json.dumps({"title":str(title)[:200],"mime":"image/png","b64":base64.b64encode(stream.getvalue()).decode("ascii")},ensure_ascii=False))


MAX_SHARE_BYTES = 4 * 1024 * 1024


def share_file(source, name=None, title=None, mime=None):
    """Offer a report or file to the user: CodePad shows a card with Save (to a public folder) and Share buttons.

    source: a file path, or the text/bytes of the report itself (then give `name`, e.g. "report.txt").
    """
    if _display is None:
        raise RuntimeError("CodePad file sharing is not connected")
    if isinstance(source, (str, Path)) and Path(str(source)).is_file():
        path = Path(str(source))
        data = path.read_bytes()
        name = name or path.name
    elif isinstance(source, bytes):
        data = source
    elif isinstance(source, str):
        data = source.encode("utf-8")
    else:
        raise TypeError("share_file() needs a file path, text or bytes")
    if not name:
        raise ValueError("share_file() needs a file name for text or bytes")
    if len(data) > MAX_SHARE_BYTES:
        raise ValueError("file is too large to share (max 4 MB)")
    name = Path(str(name)).name[:120]
    mime = mime or mimetypes.guess_type(name)[0] or ("text/plain" if name.lower().endswith((".txt", ".log", ".md")) else "application/octet-stream")
    _display(json.dumps({"kind": "file", "name": name, "title": str(title or name)[:200], "mime": mime,
                         "b64": base64.b64encode(data).decode("ascii")}, ensure_ascii=False))
