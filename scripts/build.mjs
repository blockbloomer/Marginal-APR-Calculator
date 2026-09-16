import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const names = ['index.html', 'styles.css', 'app.mjs', 'model.mjs'];
for (const name of names) {
  if (name.endsWith('.mjs')) {
    const check = spawnSync(process.execPath, ['--check', fileURLToPath(new URL(`../public/${name}`, import.meta.url))], { encoding: 'utf8' });
    if (check.status !== 0) { console.error(check.stderr); process.exit(1); }
  }
}
await mkdir(new URL('../dist/', import.meta.url), { recursive: true });
for (const name of names) {
  const content = await readFile(new URL(`../public/${name}`, import.meta.url));
  await writeFile(new URL(`../dist/${name}`, import.meta.url), content);
}
console.log('构建完成：4 个本地资源写入 dist/，JavaScript 语法检查通过。');
