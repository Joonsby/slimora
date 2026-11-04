// unity/Builds/WebGL 을 로컬에서 띄운다 (개발 확인용). 실행: node unity/tools/serve-webgl.mjs [port]
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../Builds/WebGL/', import.meta.url));
const port = Number(process.argv[2] ?? 8090);
const types = { '.html': 'text/html; charset=utf-8', '.js': 'application/javascript', '.wasm': 'application/wasm', '.data': 'application/octet-stream', '.json': 'application/json', '.png': 'image/png', '.css': 'text/css' };

createServer(async (req, res) => {
  const path = normalize(decodeURIComponent(new URL(req.url, 'http://x').pathname)).replace(/^([/\\])+/, '');
  let file = join(root, path || 'index.html');
  if (!file.startsWith(root)) return res.writeHead(403).end();
  try {
    if ((await stat(file)).isDirectory()) file = join(file, 'index.html');
    const body = await readFile(file);
    const headers = { 'Cache-Control': 'no-store' };
    // .gz 는 Content-Encoding 을 붙여 브라우저가 풀게 한다 (decompressionFallback 이 있어 없어도 동작)
    let ext = extname(file);
    if (ext === '.gz') { headers['Content-Encoding'] = 'gzip'; ext = extname(file.slice(0, -3)); }
    headers['Content-Type'] = types[ext] ?? 'application/octet-stream';
    res.writeHead(200, headers).end(body);
  } catch {
    res.writeHead(404).end('not found');
  }
}).listen(port, () => console.log(`WebGL http://localhost:${port}`));
