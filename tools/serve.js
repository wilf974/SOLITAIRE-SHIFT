// tools/serve.js — zero-dependency static file server for local play.
// Serves the project root. Default port 4317; override with `node tools/serve.js <port>`
// or PORT=xxxx. If the port is taken, the server steps to the next free one
// rather than crashing.

import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { join, extname, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const PORT = parseInt(process.argv[2] || process.env.PORT || '4317', 10);
const MAX_PORT_TRIES = 20;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.md': 'text/markdown; charset=utf-8',
};

const server = createServer(async (req, res) => {
  try {
    let urlPath = decodeURIComponent(req.url.split('?')[0]);
    if (urlPath === '/') urlPath = '/index.html';
    // prevent path traversal
    const safe = normalize(join(ROOT, urlPath));
    if (!safe.startsWith(ROOT)) { res.writeHead(403); res.end('Forbidden'); return; }
    const s = await stat(safe);
    if (s.isDirectory()) { res.writeHead(404); res.end('Not found'); return; }
    const data = await readFile(safe);
    res.writeHead(200, { 'Content-Type': MIME[extname(safe)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
    res.end(data);
  } catch (e) {
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('404 Not Found');
  }
});

// If the chosen port is busy, walk forward until we find a free one.
let attempt = 0;
server.on('error', (err) => {
  if (err.code === 'EADDRINUSE' && attempt < MAX_PORT_TRIES) {
    const next = PORT + ++attempt;
    console.log(`Port ${next - 1} is in use — trying ${next}…`);
    server.listen(next, '127.0.0.1');
    return;
  }
  console.error(`Could not start server: ${err.message}`);
  process.exit(1);
});

server.on('listening', () => {
  const { port } = server.address();
  console.log(`\n  SOLITAIRE: SHIFT  →  http://127.0.0.1:${port}/\n`);
  console.log(`  Press Ctrl+C to stop.`);
});

server.listen(PORT, '127.0.0.1');