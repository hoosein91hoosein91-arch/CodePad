/* CodePad desktop (Electron): sends Python runs to real CPython (like the Android build's embedded interpreter) and
   keeps Pyodide/WebAssembly for everything the routing rule says needs it. Inactive everywhere else (no window.cpDesktop). */
(() => {
  const desktop = window.cpDesktop && window.cpDesktop.python;
  if (!desktop) return;
  const OriginalWorker = window.Worker;
  window.CodePadBrowserWorker = OriginalWorker;
  const workers = new Map();
  let subscribed = false;

  const toBase64 = (buffer) => {
    const bytes = new Uint8Array(buffer);
    let text = '';
    for (let i = 0; i < bytes.length; i += 32768) text += String.fromCharCode.apply(null, bytes.subarray(i, i + 32768));
    return btoa(text);
  };
  const fromBase64 = (b64) => {
    const text = atob(b64), bytes = new Uint8Array(text.length);
    for (let i = 0; i < text.length; i++) bytes[i] = text.charCodeAt(i);
    return bytes.buffer;
  };

  function subscribe() {
    if (subscribed) return;
    subscribed = true;
    desktop.onEvent(({ channel, data }) => {
      const worker = workers.get(channel);
      if (worker) worker.dispatchEvent(new MessageEvent('message', { data }));
      else if (data.stream) window.dispatchEvent(new CustomEvent('codepad-runtime-stream', { detail: data }));
      if (data.phase === 'run') window.dispatchEvent(new CustomEvent('codepad-runtime-state', { detail: { running: true, engine: data.engine } }));
      if (data.done) window.dispatchEvent(new CustomEvent('codepad-runtime-state', { detail: { running: false } }));
    });
  }

  class HybridWorker extends EventTarget {
    constructor(url, options) {
      super();
      this.url = url; this.options = options;
      this.channel = crypto.randomUUID();
      this.assets = new Map();   // the runtime only sends stamps for unchanged attachments, so keep a full copy
      this.active = null; this.wasm = null;
      workers.set(this.channel, this);
      subscribe();
    }
    set onmessage(fn) { if (this.messageHandler) this.removeEventListener('message', this.messageHandler); this.messageHandler = fn; if (fn) this.addEventListener('message', fn); }
    set onerror(fn) { if (this.errorHandler) this.removeEventListener('error', this.errorHandler); this.errorHandler = fn; if (fn) this.addEventListener('error', fn); }
    wasmWorker() {
      if (!this.wasm) {
        this.wasm = new OriginalWorker(this.url, this.options);
        this.wasm.addEventListener('message', (e) => this.dispatchEvent(new MessageEvent('message', { data: e.data })));
        this.wasm.addEventListener('error', (e) => this.dispatchEvent(new ErrorEvent('error', { message: e.message })));
      }
      return this.wasm;
    }
    async postMessage(payload, transfer) {
      try {
        if (payload && payload.inputReply) {
          if (this.active === 'native') await desktop.input({ channel: this.channel, id: payload.id, requestId: payload.requestId, value: payload.value, eof: !!payload.eof });
          else this.wasmWorker().postMessage(payload);
          return;
        }
        const isRun = payload && typeof payload.code === 'string' && !payload.warm;
        if (!isRun) { if (payload && payload.warm) return; this.wasmWorker().postMessage(payload, transfer || []); return; } // no Pyodide pre-warm: real Python is the default here
        for (const asset of payload.assets || []) if (asset.buf) this.assets.set(asset.name, toBase64(asset.buf));
        const mode = localStorage.getItem('codepad-python-engine') || 'auto';
        const copy = { ...payload, assets: (payload.assets || []).map(({ buf, ...rest }) => (this.assets.has(rest.name) ? { ...rest, b64: this.assets.get(rest.name) } : rest)) };
        const native = !payload.packageCommand && window.CodePadPythonRouting && window.CodePadPythonRouting(copy, mode);
        if (native) {
          this.active = 'native';
          await desktop.start({ channel: this.channel, payload: JSON.stringify(copy) });
          return;
        }
        this.active = 'wasm';
        const assets = (payload.assets || []).map((a) => (a.buf || !this.assets.has(a.name) ? a : { ...a, buf: fromBase64(this.assets.get(a.name)) }));
        this.wasmWorker().postMessage({ ...payload, assets }, assets.map((a) => a.buf).filter(Boolean));
      } catch (error) {
        this.dispatchEvent(new MessageEvent('message', { data: { id: payload && payload.id, stdout: '', stderr: (error && error.message) || String(error), done: true } }));
      }
    }
    terminate() {
      workers.delete(this.channel);
      if (this.wasm) { this.wasm.terminate(); this.wasm = null; }
      if (this.active === 'native') desktop.stop().catch(() => {});
    }
  }

  window.Worker = class extends OriginalWorker {
    constructor(url, options) {
      if (/(?:py\.worker|python-worker)/.test(String(url))) return new HybridWorker(url, options);
      super(url, options);
    }
  };
  window.CodePadBackground = { stop: () => desktop.stop().catch(() => {}), status: () => desktop.status() };
})();
