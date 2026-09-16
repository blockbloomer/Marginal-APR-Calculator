import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

const root = fileURLToPath(new URL(process.argv.includes('--dist') ? '../dist/' : '../public/', import.meta.url));
const port = Number(process.env.PORT || 5193);
const files = new Map([
  ['/', ['index.html', 'text/html; charset=utf-8']],
  ['/index.html', ['index.html', 'text/html; charset=utf-8']],
  ['/styles.css', ['styles.css', 'text/css; charset=utf-8']],
  ['/app.mjs', ['app.mjs', 'text/javascript; charset=utf-8']],
  ['/model.mjs', ['model.mjs', 'text/javascript; charset=utf-8']],
]);

if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('PORT must be an integer between 1 and 65535.');
const server = createServer(async (req, res) => {
  if (!['GET', 'HEAD'].includes(req.method)) { res.writeHead(405, { Allow: 'GET, HEAD' }); res.end(); return; }
  const pathname = new URL(req.url, 'http://localhost').pathname;
  const file = files.get(pathname);
  if (!file) { res.writeHead(404); res.end('Not found'); return; }
  try {
    const body = await readFile(resolve(root, file[0]));
    res.writeHead(200, { 'Content-Type': file[1], 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer' });
    res.end(req.method === 'HEAD' ? undefined : body);
  } catch {
    res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('页面文件缺失，请先运行 npm run build 或使用 npm run dev。');
  }
});
server.on('error', error => {
  console.error(error.code === 'EADDRINUSE' ? `端口 ${port} 已被占用。可用 PORT=5194 npm run dev 指定其他端口。` : error.message);
  process.exitCode = 1;
});
server.listen(port, '127.0.0.1', () => console.log(`${new Date().toLocaleTimeString('zh-CN')} - LP 边际年化计算器已启动 - http://127.0.0.1:${port} - 按 Ctrl+C 停止`));
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => server.close());
