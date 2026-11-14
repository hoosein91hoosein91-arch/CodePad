import test from "node:test";
import assert from "node:assert/strict";
import { stdlib } from "../mobile-src/assets/python-stdlib.js";
import { useNativePython } from "../mobile-src/assets/python-engine.js";

const m = (name, source) => ({ name, source });
const route = (code, modules, extra = {}) => useNativePython({ code, ...extra }, "auto", stdlib, modules);

test("stdlib-only project with local modules runs on native CPython", () => {
  assert.equal(route("import json, desk\n", [m("desk.py", "import re\n")]), true);
});

test("a test file importing the entry module no longer forces WebAssembly", () => {
  const modules = [m("desk.py", "import re\n"), m("tests/test_desk.py", "import unittest\nimport bale_bot\nimport desk\n")];
  assert.equal(route("import desk\n", modules, { entryFile: "bale_bot.py" }), true);
});

test("unreachable modules do not decide the engine, reachable third-party imports do", () => {
  assert.equal(route("import desk\n", [m("desk.py", "import re\n"), m("unused.py", "import requests\n")]), true);
  assert.equal(route("import desk\n", [m("desk.py", "import requests\n")]), false);
  assert.equal(route("import numpy\n", []), false);
});

test("dynamic imports and exec in reachable code select the compatible engine; packages stay local", () => {
  assert.equal(route("import desk\n", [m("desk.py", "exec('1')\n")]), false);
  assert.equal(route("print(1)\n", [m("a/b.py", "exec('1')\n")]), true);
  assert.equal(route("from pkg import x\n", [m("pkg/__init__.py", "from . import x\n"), m("pkg/x.py", "import os\n")]), true);
  assert.equal(useNativePython({ code: "import desk\n", packageCommand: { action: "install" } }, "auto", stdlib, []), false);
  assert.equal(useNativePython({ code: "import numpy\n" }, "native", stdlib, []), true);
  assert.equal(useNativePython({ code: "print(1)\n" }, "wasm", stdlib, []), false);
});
