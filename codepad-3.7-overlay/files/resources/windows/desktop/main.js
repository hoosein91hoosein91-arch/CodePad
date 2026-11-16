'use strict';
// CodePad desktop shell: a standalone window (no browser, no network port). The built web app is served from
// the private codepad://app/ scheme, which Chromium treats as a secure, stable origin so saved projects persist.
const { app, BrowserWindow, Menu, protocol, session, shell } = require('electron');
const fs = require('fs');
const path = require('path');
const { Readable } = require('stream');

const SCHEME = 'codepad';
const HOST = 'app';
const ORIGIN = `${SCHEME}://${HOST}`;
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
  '.mp4': 'video/mp4', '.webm': 'video/webm', '.zip': 'application/zip', '.task': 'application/octet-stream', '.bin': 'application/octet-stream',
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

function serve(request) {
  const url = new URL(request.url);
  if (url.host !== HOST) return new Response('Forbidden', { status: 403 });
  let hit;
  try { hit = resolveFile(url.pathname); } catch { return new Response('Bad request', { status: 400 }); }
  if (hit === null) return new Response('Forbidden', { status: 403 });
  if (!hit) return new Response('Not found', { status: 404 });
  const headers = {
    'Content-Type': TYPES[path.extname(hit.file).toLowerCase()] || 'application/octet-stream',
    'Accept-Ranges': 'bytes', 'Cache-Control': 'no-cache', 'X-Content-Type-Options': 'nosniff',
  };
  const range = /^bytes=(\d*)-(\d*)$/.exec(request.headers.get('range') || '');
  let start = 0, end = hit.size - 1, status = 200;
  if (range && (range[1] || range[2])) {
    if (range[1]) { start = Number(range[1]); if (range[2]) end = Math.min(Number(range[2]), end); }
    else { start = Math.max(0, hit.size - Number(range[2])); }
    if (start > end || start >= hit.size) return new Response(null, { status: 416, headers: { 'Content-Range': `bytes */${hit.size}` } });
    status = 206; headers['Content-Range'] = `bytes ${start}-${end}/${hit.size}`;
  }
  headers['Content-Length'] = String(end - start + 1);
  if (request.method === 'HEAD') return new Response(null, { status, headers });
  return new Response(Readable.toWeb(fs.createReadStream(hit.file, { start, end })), { status, headers });
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
    webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true, spellcheck: false, backgroundThrottling: false },
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
    if (new URL(url).origin === ORIGIN) return;
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
  try { return ALLOWED.has(permission) && new URL(url).origin === ORIGIN; } catch { return false; }
}

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => { if (mainWindow) { if (mainWindow.isMinimized()) mainWindow.restore(); mainWindow.focus(); } });
  app.whenReady().then(() => {
    Menu.setApplicationMenu(null);
    protocol.handle(SCHEME, serve);
    session.defaultSession.setPermissionRequestHandler((wc, permission, callback, details) => callback(allow(permission, details.requestingUrl || wc.getURL())));
    session.defaultSession.setPermissionCheckHandler((wc, permission, origin) => allow(permission, origin));
    createWindow();
    app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
  });
  app.on('window-all-closed', () => app.quit());
}
