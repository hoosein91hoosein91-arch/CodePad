/* CodePad offline libraries for HTML apps.
 *   <script src="lib:three"></script>   <script src="lib:p5"></script>   <script src="lib:matter"></script>   <script src="lib:chart"></script>
 * The preview/launcher frames have no network, so the bundled library is inlined into the page right before it is shown.
 * Works for every iframe whose srcdoc is set by the editor preview, the launcher and the Python 3-D viewer. */
(function () {
  if (window.CodePadLibs) return;
  var LIBS = {
    three: { file: 'libs/three.min.js', global: 'THREE', name: 'three.js r170 (+OrbitControls, PointerLockControls)' },
    p5: { file: 'libs/p5.min.js', global: 'p5', name: 'p5.js 1.11' },
    matter: { file: 'libs/matter.min.js', global: 'Matter', name: 'matter.js 0.20 (2-D physics)' },
    chart: { file: 'libs/chart.min.js', global: 'Chart', name: 'Chart.js 4.4' },
  };
  var cache = {}, pending = {}, waiting = [];
  var RX = /<script\b[^>]*?\bsrc\s*=\s*(["'])lib:([a-z0-9._-]+)\1[^>]*>\s*<\/script>/gi;
  function url(file) { return new URL(file, document.baseURI).href; }
  function load(key) {
    if (cache[key] !== undefined) return Promise.resolve(cache[key]);
    if (pending[key]) return pending[key];
    pending[key] = fetch(url(LIBS[key].file)).then(function (r) { if (!r.ok) throw new Error(key + ' ' + r.status); return r.text(); })
      .then(function (t) { cache[key] = t; delete pending[key]; return t; })
      .catch(function (e) { delete pending[key]; cache[key] = null; return null; });
    return pending[key];
  }
  function needed(html) { var out = [], m; RX.lastIndex = 0; while ((m = RX.exec(html))) if (LIBS[m[2].toLowerCase()] && out.indexOf(m[2].toLowerCase()) < 0) out.push(m[2].toLowerCase()); return out; }
  function inline(code) { return '<script>' + code.replace(/<\/script/gi, '<\\/script') + '</script>'; }
  function expandNow(html) {
    return html.replace(RX, function (all, q, name) {
      var key = name.toLowerCase();
      if (!LIBS[key]) return '<script>console.error("CodePad: unknown library lib:' + name.replace(/[^a-z0-9._-]/gi, '') + ' (available: ' + Object.keys(LIBS).join(', ') + ')")</script>';
      return cache[key] ? inline(cache[key]) : '<script>console.error("CodePad: library ' + key + ' could not be loaded")</script>';
    });
  }
  var LOADING = '<!doctype html><meta charset="utf-8"><body style="margin:0;background:#06100c;color:#7dffb8;font:14px system-ui;display:grid;place-items:center;height:100vh">Loading libraries…</body>';
  // returns the html to put in srcdoc now; if libraries are not in memory yet a placeholder is shown and the real page is set when they arrive
  function expand(html, apply) {
    if (typeof html !== 'string' || html.indexOf('lib:') < 0) return html;
    var keys = needed(html);
    if (!keys.length) return html;
    if (keys.every(function (k) { return cache[k] !== undefined; })) return expandNow(html);
    Promise.all(keys.map(load)).then(function () { apply(expandNow(html)); });
    return LOADING;
  }
  var desc = Object.getOwnPropertyDescriptor(HTMLIFrameElement.prototype, 'srcdoc');
  if (desc && desc.set) {
    Object.defineProperty(HTMLIFrameElement.prototype, 'srcdoc', {
      configurable: true, enumerable: desc.enumerable, get: desc.get,
      set: function (v) { var self = this; desc.set.call(this, expand(v, function (h) { desc.set.call(self, h); })); },
    });
    var setAttr = Element.prototype.setAttribute;
    Element.prototype.setAttribute = function (n, v) {
      if (typeof n === 'string' && n.toLowerCase() === 'srcdoc' && this instanceof HTMLIFrameElement) { var self = this; v = expand(v, function (h) { desc.set.call(self, h); }); }
      return setAttr.call(this, n, v);
    };
  }
  window.CodePadLibs = { list: function () { return Object.keys(LIBS).map(function (k) { return { id: k, tag: '<script src="lib:' + k + '"></script>', global: LIBS[k].global, name: LIBS[k].name }; }); }, load: load, expand: function (h) { return needed(h).length && needed(h).every(function (k) { return cache[k]; }) ? expandNow(h) : h; }, preload: function () { return Promise.all(Object.keys(LIBS).map(load)); }, ready: function () { return Object.keys(LIBS).every(function (k) { return cache[k] !== undefined; }); } };
  var idle = window.requestIdleCallback || function (f) { setTimeout(f, 2500); };
  window.addEventListener('load', function () { idle(function () { window.CodePadLibs.preload(); }); });
})();
