/**
 * 把 pnpm 的 npm 包安装成独立可执行目录（无需全局安装、不写系统目录）。
 *
 * 为什么这样做：pnpm 官方只发布 Linux/macOS 独立二进制；Windows 只有 exe 版 zip，
 * 但那个资产名在不同版本间会变、镜像也未必提供。而 npm 包 tarball 结构稳定、
 * 镜像一定有。所以：下载 tarball → 解压 → 生成 pnpm.cmd 启动器。
 *
 * 用法：node tools/setup-pnpm.mjs [版本] [目标目录]
 * 默认：版本 9.15.4，目标 D:\APP\pnpm
 */
import { createWriteStream } from 'node:fs';
import { mkdir, rm, writeFile, stat, readFile } from 'node:fs/promises';
import { pipeline } from 'node:stream/promises';
import { createGunzip } from 'node:zlib';
import https from 'node:https';
import path from 'node:path';
import { tmpdir } from 'node:os';

const VERSION = process.argv[2] ?? '9.15.4';
const TARGET = process.argv[3] ?? 'D:\\APP\\pnpm';
const TARBALL_URL = `https://registry.npmmirror.com/pnpm/-/pnpm-${VERSION}.tgz`;
const TGZ = path.join(tmpdir(), `pnpm-${VERSION}.tgz`);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

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
    req.on('timeout', () => req.destroy(new Error('超时')));
  });
}

async function sizeOf(p) {
  try {
    return (await stat(p)).size;
  } catch {
    return 0;
  }
}

/** 下载（带续传与重试），静默模式：不刷进度 */
async function download(url, dest, maxAttempts = 8) {
  let expected = 0;
  {
    const probe = await get(url);
    if (probe.statusCode !== 200) throw new Error(`请求失败 HTTP ${probe.statusCode}`);
    expected = Number(probe.headers['content-length'] ?? 0);
    probe.destroy();
  }
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const have = await sizeOf(dest);
    if (expected > 0 && have >= expected) return { size: have, expected };
    try {
      const res = await get(url, have);
      if (res.statusCode === 416) return { size: await sizeOf(dest), expected };
      const partial = res.statusCode === 206;
      if (res.statusCode !== 200 && !partial) throw new Error(`HTTP ${res.statusCode}`);
      const out = createWriteStream(dest, { flags: partial && have > 0 ? 'a' : 'w' });
      await pipeline(res, out);
      const now = await sizeOf(dest);
      if (expected === 0 || now >= expected) return { size: now, expected };
      throw new Error(`大小不足 ${now}/${expected}`);
    } catch (err) {
      const backoff = Math.min(15_000, 800 * 2 ** Math.min(attempt - 1, 4));
      console.log(`  第 ${attempt} 次中断（${err.message}），${backoff / 1000}s 后续传…`);
      await sleep(backoff);
    }
  }
  throw new Error(`重试 ${maxAttempts} 次仍未完成`);
}

/** 最小 tar 解析器 + gzip 解压（npm tarball 只用到普通文件/目录与 GNU 长名） */
async function extractTarGz(tgzPath, destDir) {
  const gz = await readFile(tgzPath);
  const tar = await new Promise((resolve, reject) => {
    const chunks = [];
    const gunzip = createGunzip();
    gunzip.on('data', (c) => chunks.push(c));
    gunzip.on('end', () => resolve(Buffer.concat(chunks)));
    gunzip.on('error', reject);
    gunzip.end(gz);
  });

  let offset = 0;
  let files = 0;
  let pendingLongName = null;

  while (offset + 512 <= tar.length) {
    const header = tar.subarray(offset, offset + 512);
    if (header.every((b) => b === 0)) break;

    const nameRaw = header.subarray(0, 100).toString('utf8').replace(/\0.*$/, '');
    const sizeRaw = header.subarray(124, 136).toString('ascii').replace(/\0.*$/, '').trim();
    const typeFlag = String.fromCharCode(header[156] ?? 48);
    const prefix = header.subarray(345, 500).toString('utf8').replace(/\0.*$/, '');
    const size = parseInt(sizeRaw, 8) || 0;
    offset += 512;

    let name = nameRaw;
    if (typeFlag === 'L') {
      pendingLongName = tar.subarray(offset, offset + size).toString('utf8').replace(/\0.*$/, '');
      offset += Math.ceil(size / 512) * 512;
      continue;
    }
    if (pendingLongName) {
      name = pendingLongName;
      pendingLongName = null;
    } else if (prefix) {
      name = `${prefix}/${name}`;
    }

    const content = tar.subarray(offset, offset + size);
    offset += Math.ceil(size / 512) * 512;

    const rel = name.replace(/^package\//, '');
    if (!rel) continue;
    if (typeFlag === '5') {
      await mkdir(path.join(destDir, rel), { recursive: true });
      continue;
    }
    const outPath = path.join(destDir, rel);
    await mkdir(path.dirname(outPath), { recursive: true });
    await writeFile(outPath, content);
    files += 1;
  }
  return files;
}

console.log('pnpm 安装器');
console.log(`  版本: ${VERSION}`);
console.log(`  目标: ${TARGET}`);
await mkdir(TARGET, { recursive: true });

console.log(`  下载: ${TARBALL_URL}`);
const { size, expected } = await download(TARBALL_URL, TGZ);
console.log(`  下载完成: ${(size / 1048576).toFixed(2)} MB${expected ? ` / ${(expected / 1048576).toFixed(2)} MB` : ''}`);

const files = await extractTarGz(TGZ, TARGET);
console.log(`  已解压: ${files} 个文件`);

const cjs = path.join(TARGET, 'bin', 'pnpm.cjs');
await stat(cjs);
const cmd = ['@echo off', 'setlocal', 'node "%~dp0bin\\pnpm.cjs" %*', ''].join('\r\n');
await writeFile(path.join(TARGET, 'pnpm.cmd'), cmd, 'ascii');
console.log(`  已生成启动器: ${path.join(TARGET, 'pnpm.cmd')}`);

await rm(TGZ, { force: true });
console.log('完成');
