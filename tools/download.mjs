/**
 * 通用下载器：带断点续传、多源回退、重试。
 *
 * 为什么需要它：本机直连 GitHub 会中途 ECONNRESET（实测两次），
 * 因此必须支持 Range 续传 + 换源 + 退避重试，否则大文件永远下不完。
 *
 * 用法：node tools/download.mjs <目标文件> <url1> [url2] ...
 * 已下完则跳过；中途失败会保留已下部分，下次重跑接着下。
 */
import { createWriteStream } from 'node:fs';
import { mkdir, stat, rm } from 'node:fs/promises';
import https from 'node:https';
import path from 'node:path';

const MAX_ATTEMPTS_PER_SOURCE = 6;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function sizeOf(p) {
  try {
    return (await stat(p)).size;
  } catch {
    return 0;
  }
}

function head(url) {
  return new Promise((resolve, reject) => {
    const req = https.request(url, { method: 'HEAD', headers: { 'User-Agent': 'petfocus-setup' }, timeout: 30_000 }, (res) => {
      if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        res.resume();
        resolve(head(new URL(res.headers.location, url).href));
        return;
      }
      resolve({ status: res.statusCode, length: Number(res.headers['content-length'] ?? 0), accepts: res.headers['accept-ranges'] });
      res.resume();
    });
    req.on('error', reject);
    req.on('timeout', () => req.destroy(new Error('HEAD 超时')));
    req.end();
  });
}

function get(url, startAt = 0) {
  return new Promise((resolve, reject) => {
    const headers = { 'User-Agent': 'petfocus-setup' };
    if (startAt > 0) headers.Range = `bytes=${startAt}-`;
    const req = https.get(url, { headers, timeout: 60_000 }, (res) => {
      if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        res.resume();
        resolve(get(new URL(res.headers.location, url).href, startAt));
        return;
      }
      resolve(res);
    });
    req.on('error', reject);
    req.on('timeout', () => req.destroy(new Error('请求超时')));
  });
}

/** 单源下载（自动续传）；返回 true 表示完整下载成功 */
async function downloadFrom(url, dest, expected) {
  for (let attempt = 1; attempt <= MAX_ATTEMPTS_PER_SOURCE; attempt += 1) {
    const have = await sizeOf(dest);
    if (expected > 0 && have >= expected) return true;
    try {
      const res = await get(url, have);
      if (res.statusCode === 416) return true; // 已完整
      const partial = res.statusCode === 206;
      if (res.statusCode !== 200 && !partial) {
        res.resume();
        throw new Error(`HTTP ${res.statusCode}`);
      }
      const append = partial && have > 0;
      const out = createWriteStream(dest, { flags: append ? 'a' : 'w' });
      let received = append ? have : 0;
      res.on('data', (c) => {
        received += c.length;
        if (expected > 0) {
          process.stdout.write(`\r    ${(received / 1048576).toFixed(1)} / ${(expected / 1048576).toFixed(1)} MB`);
        }
      });
      await new Promise((resolve, reject) => {
        res.pipe(out);
        res.on('error', reject);
        out.on('error', reject);
        out.on('finish', resolve);
      });
      const now = await sizeOf(dest);
      if (expected === 0 || now >= expected) {
        process.stdout.write('\n');
        return true;
      }
      throw new Error(`大小不足 ${now}/${expected}`);
    } catch (err) {
      const now = await sizeOf(dest);
      const backoff = Math.min(20_000, 1_000 * 2 ** Math.min(attempt - 1, 4));
      process.stdout.write(`\n    第 ${attempt} 次中断（${err.message}），已存 ${(now / 1048576).toFixed(1)} MB，${backoff / 1000}s 后续传…\n`);
      await sleep(backoff);
    }
  }
  return false;
}

const [, , dest, ...urls] = process.argv;
if (!dest || urls.length === 0) {
  console.error('用法: node tools/download.mjs <目标文件> <url1> [url2] ...');
  process.exit(1);
}

await mkdir(path.dirname(path.resolve(dest)), { recursive: true });

for (const url of urls) {
  let expected = 0;
  try {
    const info = await head(url);
    if (info.status !== 200) {
      console.log(`  源不可用（HTTP ${info.status}）: ${url}`);
      continue;
    }
    expected = info.length;
    console.log(`源: ${url}`);
    console.log(`大小: ${(expected / 1048576).toFixed(1)} MB，续传支持: ${info.accepts ?? '未知'}`);
  } catch (err) {
    console.log(`  源探测失败（${err.message}）: ${url}`);
    continue;
  }
  const ok = await downloadFrom(url, dest, expected);
  if (ok) {
    await rm(`${dest}.part`, { force: true });
    console.log(`完成 → ${dest}`);
    process.exit(0);
  }
  console.log(`  该源重试耗尽，尝试下一个源…`);
}

console.error(`全部源均失败: ${dest}`);
process.exit(2);
