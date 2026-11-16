'use strict';
// CodePad desktop shell: a standalone window (no browser, no network port). The built web app is served from
// the private codepad://app/ scheme, which Chromium treats as a secure, stable origin so saved projects persist.
const { app, BrowserWindow, Menu, WebContentsView, dialog, ipcMain, protocol, session, shell } = require('electron');
const os = require('os');
const fs = require('fs');
const path = require('path');
const { Readable } = require('stream');

const SCHEME = 'codepad';
const HOST = 'app';
const ORIGIN = `${SCHEME}://${HOST}`;
// Node's URL gives origin "null" for custom schemes, so compare protocol + host instead.
const isOurUrl = (url) => { try { const u = new URL(url); return u.protocol === `${SCHEME}:` && u.host === HOST; } catch { return false; } };
const WEB_ROOT = path.resolve(process.env.CODEPAD_APP || path.join(__dirname, 'web'));
if (process.env.CODEPAD_USER_DATA) app.setPath('userData', process.env.CODEPAD_USER_DATA);

protocol.registerSchemesAsPrivileged([
  { scheme: SCHEME, privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true, corsEnabled: true, codeCache: true } },
]);

const TYPES = {
  '.html': 'text/html; charset=utf-8', '.htm': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.wasm': 'application/wasm',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.webp': 'image/webp',
  '.woff': 'font/woff', '.woff2': 'font/woff2', '.ttf': 'font/ttf', '.mp3': 'audio/mpeg', '.wav': 'audio/wav', '.ogg': 'audio/ogg',
  '.mp4': 'video/mp4', '.m4v': 'video/mp4', '.mov': 'video/quicktime', '.webm': 'video/webm', '.m4a': 'audio/mp4', '.aac': 'audio/aac', '.oga': 'audio/ogg', '.opus': 'audio/ogg', '.flac': 'audio/flac', '.zip': 'application/zip', '.task': 'application/octet-stream', '.bin': 'application/octet-stream',
  '.txt': 'text/plain; charset=utf-8', '.py': 'text/plain; charset=utf-8',
};

function resolveFile(urlPath) {
  let rel = decodeURIComponent(urlPath);
  if (rel === '/' || rel === '/launcher') rel = '/index.html';
  const file = path.normalize(path.join(WEB_ROOT, rel));
  if (file !== WEB_ROOT && !file.startsWith(WEB_ROOT + path.sep)) return null;
  let stat;
  try { stat = fs.statSync(file); } catch { return undefined; }
  if (stat.isDirectory()) return resolveFile(path.posix.join(rel, 'index.html'));
  return { file, size: stat.size };
}

function fileResponse(request, file, size) {
  const headers = {
    'Content-Type': TYPES[path.extname(file).toLowerCase()] || 'application/octet-stream',
    'Accept-Ranges': 'bytes', 'Cache-Control': 'no-cache', 'X-Content-Type-Options': 'nosniff',
  };
  const range = /^bytes=(\d*)-(\d*)$/.exec(request.headers.get('range') || '');
  let start = 0, end = size - 1, status = 200;
  if (range && (range[1] || range[2])) {
    if (range[1]) { start = Number(range[1]); if (range[2]) end = Math.min(Number(range[2]), end); }
    else { start = Math.max(0, size - Number(range[2])); }
    if (start > end || start >= size) return new Response(null, { status: 416, headers: { 'Content-Range': `bytes */${size}` } });
    status = 206; headers['Content-Range'] = `bytes ${start}-${end}/${size}`;
  }
  headers['Content-Length'] = String(end - start + 1);
  if (request.method === 'HEAD') return new Response(null, { status, headers });
  return new Response(Readable.toWeb(fs.createReadStream(file, { start, end })), { status, headers });
}

function serve(request) {
  const url = new URL(request.url);
  if (url.host !== HOST) return new Response('Forbidden', { status: 403 });
  if (url.pathname.startsWith('/__media/')) { // the user's music folder: only files from the latest scan
    const entry = mediaIndex.get(decodeURIComponent(url.pathname.slice('/__media/'.length)));
    if (!entry) return new Response('Not found', { status: 404 });
    return fileResponse(request, entry.file, entry.size);
  }
  let hit;
  try { hit = resolveFile(url.pathname); } catch { return new Response('Bad request', { status: 400 }); }
  if (hit === null) return new Response('Forbidden', { status: 403 });
  if (!hit) return new Response('Not found', { status: 404 });
  return fileResponse(request, hit.file, hit.size);
}

// ── music library (default folder: <Music>\Phonk - Video Songs; changeable) ──
const settingsFile = () => path.join(app.getPath('userData'), 'settings.json');
function loadSettings() { try { return JSON.parse(fs.readFileSync(settingsFile(), 'utf8')) || {}; } catch { return {}; } }
function saveSettings(patch) { try { fs.writeFileSync(settingsFile(), JSON.stringify({ ...loadSettings(), ...patch })); } catch { /* not critical */ } }
function musicDir() {
  return process.env.CODEPAD_MUSIC_DIR || loadSettings().musicDir || path.join(app.getPath('music') || path.join(os.homedir(), 'Music'), 'Phonk - Video Songs');
}
const MEDIA_EXT = /\.(mp3|m4a|aac|ogg|oga|opus|wav|flac|webm|mp4|m4v|mov)$/i; // formats Chromium can decode (mkv/avi/wmv cannot)
const mediaIndex = new Map();
function scanMusic(dir) {
  mediaIndex.clear();
  const out = [];
  let root;
  try { root = fs.realpathSync(dir); } catch { return { dir, exists: false, files: [] }; }
  const walk = (folder, depth) => {
    let entries;
    try { entries = fs.readdirSync(folder, { withFileTypes: true }); } catch { return; }
    for (const e of entries) {
      if (out.length >= 5000) return;
      const full = path.join(folder, e.name);
      if (e.isDirectory() && depth < 4) walk(full, depth + 1);
      else if (e.isFile() && MEDIA_EXT.test(e.name)) {
        let real, stat;
        try { real = fs.realpathSync(full); stat = fs.statSync(real); } catch { continue; }
        if (real !== root && !real.startsWith(root + path.sep)) continue; // never leave the chosen folder via links
        out.push({ rel: path.relative(root, full), name: e.name.replace(MEDIA_EXT, ''), ext: path.extname(e.name).slice(1).toLowerCase(), size: stat.size, file: real });
      }
    }
  };
  walk(root, 0);
  out.sort((a, b) => a.rel.localeCompare(b.rel, undefined, { numeric: true, sensitivity: 'base' }));
  const files = out.map((f, i) => { const id = 'm' + i; mediaIndex.set(id, { file: f.file, size: f.size }); return { id, name: f.name, rel: f.rel, ext: f.ext, size: f.size, url: `${ORIGIN}/__media/${id}` }; });
  return { dir, exists: true, files };
}

// ── embedded cyber-attack maps: third-party sites live in a separate, sandboxed view (they refuse to be iframed) ──
const MAPS = {
  kaspersky: { name: 'Kaspersky · Cyberthreat Real-time Map', url: 'https://cybermap.kaspersky.com/' },
  checkpoint: { name: 'Check Point · Live Cyber Threat Map', url: 'https://threatmap.checkpoint.com/' },
  fortiguard: { name: 'FortiGuard · Threat Map', url: 'https://threatmap.fortiguard.com/' },
  radware: { name: 'Radware · Live Threat Map', url: 'https://livethreatmap.radware.com/' },
  digitalattack: { name: 'Digital Attack Map (DDoS)', url: 'https://www.digitalattackmap.com/' },
  netscout: { name: 'NETSCOUT · Cyber Threat Horizon', url: 'https://horizon.netscout.com/' },
};
const mapUrl = (id) => process.env.CODEPAD_TEST_MAP_URL || (MAPS[id] && MAPS[id].url);
let mapView = null, mapId = null;
const trusted = (event) => !!event.senderFrame && isOurUrl(event.senderFrame.url);
function sendMapStatus(status) { if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('map:status', status); }
function ensureMapView() {
  if (mapView) return mapView;
  const mapSession = session.fromPartition('persist:attack-maps');
  mapSession.setPermissionRequestHandler((_wc, _permission, callback) => callback(false));
  mapView = new WebContentsView({ webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false, session: mapSession } });
  const wc = mapView.webContents;
  wc.setWindowOpenHandler(({ url }) => { if (/^https:\/\//i.test(url)) shell.openExternal(url); return { action: 'deny' }; });
  wc.on('did-start-loading', () => sendMapStatus({ state: 'loading', id: mapId }));
  wc.on('did-finish-load', () => sendMapStatus({ state: 'ready', id: mapId }));
  wc.on('did-fail-load', (_e, code, description, _url, isMainFrame) => { if (isMainFrame && code !== -3) sendMapStatus({ state: 'error', id: mapId, error: description }); });
  return mapView;
}
function registerIpc() {
  ipcMain.handle('music:info', (e) => (trusted(e) ? { dir: musicDir(), exists: fs.existsSync(musicDir()) } : null));
  ipcMain.handle('music:list', (e) => (trusted(e) ? scanMusic(musicDir()) : null));
  ipcMain.handle('music:choose', async (e) => {
    if (!trusted(e)) return null;
    const result = await dialog.showOpenDialog(mainWindow, { title: 'CodePad · music folder', defaultPath: musicDir(), properties: ['openDirectory'] });
    if (result.canceled || !result.filePaths[0]) return null;
    saveSettings({ musicDir: result.filePaths[0] });
    return scanMusic(result.filePaths[0]);
  });
  ipcMain.handle('map:list', (e) => (trusted(e) ? Object.entries(MAPS).map(([id, m]) => ({ id, name: m.name })) : []));
  ipcMain.handle('map:show', (e, id, rect) => {
    if (!trusted(e) || !mainWindow || !mapUrl(id)) return false;
    const r = rect && ['x', 'y', 'width', 'height'].every((k) => Number.isFinite(rect[k])) ? rect : null;
    if (!r || r.width < 20 || r.height < 20) return false;
    const view = ensureMapView();
    if (!mainWindow.contentView.children.includes(view)) mainWindow.contentView.addChildView(view);
    view.setBounds({ x: Math.round(r.x), y: Math.round(r.y), width: Math.round(r.width), height: Math.round(r.height) });
    view.setVisible(true);
    if (mapId !== id) { mapId = id; view.webContents.loadURL(mapUrl(id)).catch(() => {}); }
    return true;
  });
  ipcMain.handle('map:hide', (e) => { if (!trusted(e)) return false; if (mapView) mapView.setVisible(false); return true; });
  ipcMain.handle('map:reload', (e) => { if (trusted(e) && mapView && mapId) mapView.webContents.loadURL(mapUrl(mapId)).catch(() => {}); return true; });
  ipcMain.handle('map:external', (e, id) => { const url = trusted(e) && MAPS[id] && MAPS[id].url; if (url) shell.openExternal(url); return !!url; });
}

// ── window state (size/position/fullscreen) ──
const stateFile = () => path.join(app.getPath('userData'), 'window-state.json');
function loadState() {
  try { const s = JSON.parse(fs.readFileSync(stateFile(), 'utf8')); if (s && s.width > 300 && s.height > 300) return s; } catch { /* first run */ }
  return { width: 1280, height: 820 };
}
function saveState(win) {
  try {
    const b = win.getNormalBounds();
    fs.writeFileSync(stateFile(), JSON.stringify({ ...b, maximized: win.isMaximized(), fullscreen: win.isFullScreen() }));
  } catch { /* not critical */ }
}

let mainWindow;
function createWindow() {
  const state = loadState();
  mainWindow = new BrowserWindow({
    width: state.width, height: state.height, x: state.x, y: state.y, minWidth: 360, minHeight: 480,
    backgroundColor: '#020605', title: 'CodePad', icon: path.join(__dirname, 'icon.png'),
    autoHideMenuBar: true, show: false, fullscreen: process.argv.includes('--fullscreen') || !!state.fullscreen,
    webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true, spellcheck: false, backgroundThrottling: false, autoplayPolicy: 'no-user-gesture-required', preload: path.join(__dirname, 'preload.js') },
  });
  if (state.maximized) mainWindow.maximize();
  mainWindow.once('ready-to-show', () => mainWindow.show());
  mainWindow.on('close', () => saveState(mainWindow));
  mainWindow.on('page-title-updated', (e) => e.preventDefault()); // keep the window title "CodePad"

  const wc = mainWindow.webContents;
  wc.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//i.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  wc.on('will-navigate', (event, url) => {
    if (isOurUrl(url)) return;
    event.preventDefault();
    if (/^https?:\/\//i.test(url)) shell.openExternal(url);
  });
  wc.on('before-input-event', (event, input) => {
    if (input.type !== 'keyDown') return;
    if (input.key === 'F11') { mainWindow.setFullScreen(!mainWindow.isFullScreen()); event.preventDefault(); }
    else if (input.key === 'F5' || (input.control && input.key.toLowerCase() === 'r')) { wc.reload(); event.preventDefault(); }
    else if (process.env.CODEPAD_DEBUG && input.control && input.shift && input.key.toLowerCase() === 'i') wc.toggleDevTools();
  });
  mainWindow.loadURL(`${ORIGIN}/`);
}

// Camera (hand tracking), location and clipboard only for the app's own origin.
const ALLOWED = new Set(['media', 'geolocation', 'fullscreen', 'clipboard-sanitized-write', 'clipboard-read', 'pointerLock', 'notifications']);
function allow(permission, url) {
  return ALLOWED.has(permission) && isOurUrl(url);
}

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => { if (mainWindow) { if (mainWindow.isMinimized()) mainWindow.restore(); mainWindow.focus(); } });
  app.whenReady().then(() => {
    Menu.setApplicationMenu(null);
    registerIpc();
    protocol.handle(SCHEME, serve);
    session.defaultSession.setPermissionRequestHandler((wc, permission, callback, details) => callback(allow(permission, details.requestingUrl || wc.getURL())));
    session.defaultSession.setPermissionCheckHandler((wc, permission, origin) => allow(permission, origin));
    createWindow();
    app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
  });
  app.on('window-all-closed', () => app.quit());
}
