/**
 * 修复「本机 Git 连不上 GitHub」的问题。
 *
 * ── 背景（这是本机真实遇到问题的根因）──
 * 本机装了 Steam++（Watt Toolkit）加速器。它通过**修改 hosts** 把 github.com 等域名
 * 指向 127.0.0.1，并在本地 443 端口做 **TLS 中间人**转发，用自己签发的证书
 * （颁发者 `SteamTools Certificate`）替换真实证书。
 *
 * 由此产生两个失败：
 * 1. `schannel` 后端：Windows 要去网上查该证书的吊销状态，查不通 →
 *    `CRYPT_E_NO_REVOCATION_CHECK (0x80092012)` → 连接被掐断。
 *    （`http.schannelCheckRevoke=false` 在 Git for Windows 2.56 上不生效）
 * 2. `openssl` 后端：Git 自带的 CA 包（121 张公共根证书）里**没有** SteamTools 根证书 →
 *    `unable to get local issuer certificate (20)`
 *
 * ── 解法 ──
 * 从 Windows 证书库导出 SteamTools 根证书 → 转 PEM → **追加**到 Git 自带 CA 包 →
 * 让 Git 用 openssl 后端 + 这个合并后的 CA 包。
 *
 * ⚠️ 该证书有效期到 **2027-05-29**。到期后、或加速器更新证书后若又连不上，
 * 重新运行本脚本即可（它是幂等的：会重新导出并重建合并包）。
 *
 * 用法：node tools/setup-git-tls.mjs
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const GIT_CA_BUNDLE = 'D:\\APP\\git\\usr\\ssl\\certs\\ca-bundle.crt';
const OUT_DIR = path.join(os.homedir(), 'AppData', 'Local', 'PetFocusTls');
const CER_PATH = path.join(OUT_DIR, 'steamtools-root.cer');
const PEM_PATH = path.join(OUT_DIR, 'steamtools-root.pem');
const BUNDLE_PATH = path.join(OUT_DIR, 'ca-bundle-with-steamtools.crt');

/** Steam++ 根证书在证书库里的可识别名 */
const CERT_MARKER = 'SteamTools';

function run(command, args) {
  return execFileSync(command, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
}

function log(message) {
  console.log(message);
}

/**
 * 从 Windows 证书库导出 SteamTools 根证书。
 *
 * 为什么用 PowerShell 而不是解析 certutil 的文本输出：
 * certutil 的输出列格式随系统语言变化（中英文表头不同），解析很脆。
 * PowerShell 直接给结构化对象，`Export-Certificate` 还能直接产出 DER。
 *
 * 为什么写到临时 .ps1 再执行：多行脚本用 `-Command` 传会被换行截断
 * （管道续行会报 "An empty pipe element is not allowed"）。
 */
function exportCertificate() {
  mkdirSync(OUT_DIR, { recursive: true });
  // 每次重新导出，避免用到过期或被替换的旧证书
  if (existsSync(CER_PATH)) writeFileSync(CER_PATH, '');

  const ps1Path = path.join(os.tmpdir(), `petfocus-export-cert-${process.pid}.ps1`);
  const script = [
    `$ErrorActionPreference = 'Stop'`,
    `$stores = @('Cert:\\CurrentUser\\Root', 'Cert:\\LocalMachine\\Root')`,
    `$cert = $null`,
    `foreach ($s in $stores) {`,
    `  if (-not $cert) {`,
    `    $cert = Get-ChildItem $s -ErrorAction SilentlyContinue | Where-Object { $_.Subject -match '${CERT_MARKER}' } | Select-Object -First 1`,
    `  }`,
    `}`,
    `if (-not $cert) { Write-Output 'NOT_FOUND'; exit 2 }`,
    `Export-Certificate -Cert $cert -FilePath '${CER_PATH}' -Type CERT | Out-Null`,
    `Write-Output ('SUBJECT=' + $cert.Subject)`,
    `Write-Output ('THUMBPRINT=' + $cert.Thumbprint)`,
    `Write-Output ('NOTAFTER=' + $cert.NotAfter.ToString('yyyy-MM-dd'))`,
    '',
  ].join('\n');

  // ⚠️ 必须带 UTF-8 BOM：Windows PowerShell 5.1 读 .ps1 时若没有 BOM，
  // 会按系统 ANSI（中文 Windows 是 GBK）解码，路径里的中文会变成乱码
  // （实测：C:\Users\张鑫 → C:\Users\寮犻懌，然后报"找不到路径"）。
  writeFileSync(ps1Path, `\uFEFF${script}`, 'utf8');

  let output = '';
  try {
    output = execFileSync(
      'powershell',
      ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', ps1Path],
      { encoding: 'utf8' },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    log(`  导出失败：${message.split('\n')[0]}`);
    return false;
  }

  for (const rawLine of output.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (line.length === 0) continue;
    if (line.startsWith('SUBJECT=')) log(`  证书: ${line.slice('SUBJECT='.length)}`);
    else if (line.startsWith('THUMBPRINT=')) log(`  指纹: ${line.slice('THUMBPRINT='.length)}`);
    else if (line.startsWith('NOTAFTER=')) log(`  有效期至: ${line.slice('NOTAFTER='.length)}`);
  }

  if (!existsSync(CER_PATH) || readFileSync(CER_PATH).length === 0) {
    log(`  未在证书库里找到含「${CERT_MARKER}」的证书。`);
    log('  可能加速器没有开启证书中间人，或它换了证书名字。');
    log('  你可以先打开 Steam++ 的「网络加速」，再重跑本脚本。');
    return false;
  }
  log(`  已导出 DER: ${CER_PATH}`);
  return true;
}

function toPem() {
  const der = readFileSync(CER_PATH);
  const base64 = der.toString('base64');
  const chunks = base64.match(/.{1,64}/g) ?? [];
  const pem = [
    '# SteamTools (Steam++) root certificate',
    '# Exported from the Windows certificate store by tools/setup-git-tls.mjs',
    '# Purpose: let Git reach GitHub through the local accelerator on 127.0.0.1:443',
    '-----BEGIN CERTIFICATE-----',
    ...chunks,
    '-----END CERTIFICATE-----',
    '',
  ].join('\n');
  writeFileSync(PEM_PATH, pem, 'utf8');
  log(`  已生成 PEM: ${PEM_PATH}`);
}

function buildBundle() {
  if (!existsSync(GIT_CA_BUNDLE)) {
    log(`  找不到 Git 的 CA 包: ${GIT_CA_BUNDLE}`);
    log('  若 Git 装在别处，请修改本脚本顶部的 GIT_CA_BUNDLE。');
    return false;
  }
  const base = readFileSync(GIT_CA_BUNDLE, 'utf8').trimEnd();
  const extra = readFileSync(PEM_PATH, 'utf8');
  const merged = `${base}\n\n${extra}`;
  writeFileSync(BUNDLE_PATH, merged, 'utf8');

  const count = (merged.match(/BEGIN CERTIFICATE/g) ?? []).length;
  log(`  已生成合并 CA 包（共 ${count} 张证书）: ${BUNDLE_PATH}`);
  return true;
}

function configureGit() {
  run('git', ['config', '--global', 'http.sslBackend', 'openssl']);
  run('git', ['config', '--global', 'http.sslCAInfo', BUNDLE_PATH]);
  run('git', ['config', '--global', 'http.sslVerify', 'true']);
  log('  已写入全局配置：http.sslBackend / http.sslCAInfo / http.sslVerify');
}

function verify() {
  try {
    run('git', ['ls-remote', '--heads', 'origin']);
    return true;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    log(`  验证失败：${message.split('\n')[0]}`);
    return false;
  }
}

log('== 修复 Git 访问 GitHub（Steam++ 加速器环境）==');
log('');
log('[1/5] 从证书库导出 SteamTools 根证书');
if (!exportCertificate()) process.exit(1);

log('[2/5] 转换为 PEM');
toPem();

log('[3/5] 合并到 Git 的 CA 包');
if (!buildBundle()) process.exit(1);

log('[4/5] 写入 Git 全局配置');
configureGit();

log('[5/5] 验证能否连上远程仓库');
if (verify()) {
  log('');
  log('成功。现在可以直接 `git push` 了。');
} else {
  log('');
  log('仍然连不上。可能是网络本身的问题，请检查：');
  log('  1. Steam++ 的「网络加速」是否已开启');
  log('  2. 加速器里的 GitHub 加速项是否勾选');
  log('  3. 重启 Steam++ 后重跑本脚本');
  process.exit(1);
}
