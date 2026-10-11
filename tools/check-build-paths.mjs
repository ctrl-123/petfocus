/**
 * 检查构建产物在指定 base 下的资源路径是否正确。
 *
 * 为什么需要它：部署到 GitHub Pages 时站点在 `/petfocus/` 子目录下，
 * 如果 HTML 里的资源路径没带上 base，线上会全部 404 白屏——
 * 而这个问题在本地开发时**永远看不到**（本地 base 是 `/`）。
 *
 * 用法：
 *   node tools/check-build-paths.mjs               # 期望 base = /
 *   node tools/check-build-paths.mjs /petfocus/    # 期望 base = /petfocus/
 */
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';

const expectedBase = process.argv[2] ?? '/';
const root = path.resolve(import.meta.dirname, '..');
const dist = path.join(root, 'apps', 'web', 'dist');
const htmlPath = path.join(dist, 'index.html');

if (!existsSync(htmlPath)) {
  console.error(`找不到 ${htmlPath}，请先运行 pnpm build`);
  process.exit(1);
}

const html = readFileSync(htmlPath, 'utf8');

// 抓取所有 src= / href= 的本地路径（排除外链与 data:）
const refs = [];
for (const match of html.matchAll(/(?:src|href)="([^"]+)"/g)) {
  const value = match[1];
  if (value === undefined) continue;
  if (/^(https?:|data:|mailto:)/.test(value)) continue;
  refs.push(value);
}

console.log(`期望 base: ${expectedBase}`);
console.log(`index.html 里的本地资源引用：`);

let failures = 0;
for (const ref of refs) {
  const ok = ref.startsWith(expectedBase);
  if (!ok) failures += 1;
  console.log(`  ${ok ? 'OK  ' : 'FAIL'} ${ref}`);
}

// Service Worker 与 manifest 是 public/ 下的原样文件，单独确认它们在产物里
for (const name of ['sw.js', 'manifest.webmanifest', 'icon.svg', 'icon-maskable.svg']) {
  const exists = existsSync(path.join(dist, name));
  if (!exists) failures += 1;
  console.log(`  ${exists ? 'OK  ' : 'FAIL'} ${name} 存在于 dist/`);
}

// SW 里不能残留写死的根路径（会导致子路径部署时离线功能失效）
const sw = readFileSync(path.join(dist, 'sw.js'), 'utf8');
const hardcodedRoot = /['"]\/(index\.html|assets\/)['"]/.test(sw);
if (hardcodedRoot) failures += 1;
console.log(`  ${hardcodedRoot ? 'FAIL' : 'OK  '} sw.js 未写死根路径（子路径部署安全）`);

console.log('');
if (failures > 0) {
  console.error(`有 ${failures} 项不合格。`);
  process.exit(1);
}
console.log('全部通过。');
