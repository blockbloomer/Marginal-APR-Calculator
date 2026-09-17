import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const names = ['index.html', 'styles.css', 'app.mjs', 'model.mjs'];
for (const name of names) {
  if (name.endsWith('.mjs')) {
    const check = spawnSync(process.execPath, ['--check', fileURLToPath(new URL(`../public/${name}`, import.meta.url))], { encoding: 'utf8' });
    if (check.status !== 0) { console.error(check.stderr); process.exit(1); }
  }
}
await mkdir(new URL('../dist/', import.meta.url), { recursive: true });
for (const name of names) {
  if (name === 'app.mjs') continue;
  const content = await readFile(new URL(`../public/${name}`, import.meta.url));
  await writeFile(new URL(`../dist/${name}`, import.meta.url), content);
}
await build({ entryPoints: [fileURLToPath(new URL('../public/app.mjs', import.meta.url))], outfile: fileURLToPath(new URL('../dist/app.mjs', import.meta.url)), bundle: true, format: 'esm', platform: 'browser', target: 'es2022', minify: true, legalComments: 'inline' });
console.log('构建完成：4 个静态资源写入 dist/，依赖已打包，无需 CDN 或后端。');
