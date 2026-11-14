import http from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { resolve, extname, dirname, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../dist/client');
const args = process.argv.slice(2);
const port = args.includes('--port') ? Number(args[args.indexOf('--port') + 1]) : 8080;
const mime = { '.html': 'text/html; charset=utf-8', '.js': 'application/javascript', '.mjs': 'application/javascript', '.css': 'text/css', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.wasm': 'application/wasm', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.woff': 'font/woff', '.woff2': 'font/woff2' };
http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://local');
    let name = resolve(root, '.' + decodeURIComponent(['/','/launcher'].includes(url.pathname) ? '/index.html' : url.pathname));
    if (name !== root && !name.startsWith(root + sep)) { res.writeHead(403).end(); return; }
    if ((await stat(name)).isDirectory()) name = resolve(name, 'index.html');
    const bytes = await readFile(name);
    res.setHeader('Content-Type', mime[extname(name)] || 'application/octet-stream');
    res.setHeader('Cache-Control', 'no-store');
    res.end(bytes);
  } catch { res.writeHead(404).end('Not found'); }
}).listen(port, '0.0.0.0', () => console.log(`CodePad preview ready on ${port}`));
