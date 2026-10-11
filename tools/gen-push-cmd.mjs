/**
 * 生成 push.cmd（Windows 一键推送到 GitHub）。
 *
 * 为什么不直接用编辑器写 .cmd：
 * cmd.exe 按**系统 ANSI 代码页**（中文 Windows 是 GBK）解析 .cmd 文件，
 * UTF-8 的中文会变成乱码命令导致双击闪退。因此强制：**纯 ASCII + CRLF**，并做字节级自检。
 *
 * 为什么需要这个脚本：
 * 本机装了 Steam++（Watt Toolkit）加速器，它把 github.com 指向 127.0.0.1 并做 TLS 中间人。
 * 因此 Git 必须用 OpenSSL 后端 + 合并了 SteamTools 根证书的 CA 包，
 * 这套配置由 tools/setup-git-tls.mjs 写入。本脚本只负责"提交 + 推送 + 引导授权"。
 *
 * 用法：node tools/gen-push-cmd.mjs
 */
import { writeFileSync, readFileSync } from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const target = path.join(root, 'push.cmd');

const lines = [
  '@echo off',
  'setlocal enabledelayedexpansion',
  'title PetFocus - Push to GitHub',
  '',
  'echo ==========================================',
  'echo   PetFocus - Push to GitHub',
  'echo ==========================================',
  'echo.',
  '',
  'cd /d "%~dp0"',
  '',
  'echo [1/5] Checking git...',
  'where git >nul 2>nul',
  'if errorlevel 1 (',
  '  echo   ERROR: git not found in PATH.',
  '  echo   Fix: add D:\\APP\\git\\cmd to user PATH, then reopen this file.',
  '  echo.',
  '  pause',
  '  exit /b 1',
  ')',
  'for /f "delims=" %%v in (\'git --version\') do echo   %%v',
  '',
  'echo [2/5] Checking remote...',
  'git remote get-url origin >nul 2>nul',
  'if errorlevel 1 (',
  '  echo   ERROR: remote "origin" is not set.',
  '  echo   Fix: git remote add origin https://github.com/ctrl-123/petfocus.git',
  '  echo.',
  '  pause',
  '  exit /b 1',
  ')',
  'for /f "delims=" %%u in (\'git remote get-url origin\') do echo   %%u',
  '',
  'echo [3/5] Connecting to GitHub...',
  'git ls-remote --heads origin >nul 2>nul',
  'if errorlevel 1 (',
  '  echo   ERROR: cannot reach GitHub.',
  '  echo.',
  '  echo   Most likely the Steam++ accelerator changed its certificate,',
  '  echo   or the CA bundle is missing. Fix by running:',
  '  echo       node tools\\setup-git-tls.mjs',
  '  echo.',
  '  pause',
  '  exit /b 1',
  ')',
  'echo   OK',
  '',
  'echo [4/5] Committing local changes...',
  'git add -A',
  'git diff --cached --quiet',
  'if errorlevel 1 (',
  '  git commit -m "chore: update"',
  '  if errorlevel 1 (',
  '    echo   ERROR: commit failed. See messages above.',
  '    echo.',
  '    pause',
  '    exit /b 1',
  '  )',
  ') else (',
  '  echo   Nothing new to commit.',
  ')',
  '',
  'echo [5/5] Pushing...',
  'echo.',
  'echo   A browser window may open to sign in to GitHub.',
  'echo   If a dialog asks for a credential helper, choose "Manager".',
  'echo.',
  'git push -u origin main',
  'set "EXITCODE=%ERRORLEVEL%"',
  '',
  'echo.',
  'if "%EXITCODE%"=="0" (',
  '  echo ==========================================',
  '  echo   Done. Your code is on GitHub.',
  '  echo ==========================================',
  '  echo.',
  '  echo   https://github.com/ctrl-123/petfocus',
  '  echo.',
  '  echo   Next: deploy on Vercel',
  '  echo     https://vercel.com/new',
  ') else (',
  '  echo ==========================================',
  '  echo   Push failed. exit code = %EXITCODE%',
  '  echo ==========================================',
  '  echo.',
  '  echo   If it says "could not read Username", the credential prompt',
  '  echo   could not open. Try running this file again, or run',
  '  echo   "git push -u origin main" manually in a PowerShell window.',
  ')',
  'echo.',
  'pause',
  '',
];

writeFileSync(target, lines.join('\r\n'), 'ascii');

// 字节级自检：必须纯 ASCII 且含 CRLF
const buf = readFileSync(target);
let nonAscii = 0;
for (const byte of buf) if (byte > 127) nonAscii += 1;
const hasCrlf = buf.includes(Buffer.from([13, 10]));
console.log(`已写入 ${target}`);
console.log(`  字节数   : ${buf.length}`);
console.log(`  行数     : ${lines.length}`);
console.log(`  非 ASCII : ${nonAscii} ${nonAscii === 0 ? '(OK)' : '(不合格)'}`);
console.log(`  含 CRLF  : ${hasCrlf ? 'OK' : '不合格'}`);
if (nonAscii !== 0 || !hasCrlf) process.exit(1);
