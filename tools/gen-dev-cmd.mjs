/**
 * 生成 dev.cmd（Windows 一键启动脚本）。
 *
 * 为什么用脚本生成而不用编辑器直接写：
 * cmd.exe 按**系统 ANSI 代码页**（中文 Windows 是 GBK）解析 .bat/.cmd 文件。
 * 若文件是 UTF-8 且含中文，中文会变成乱码命令 → 双击闪退。
 * 因此这里强制：**纯 ASCII 内容 + CRLF 换行**，并用字节级断言验证。
 *
 * 用法：node tools/gen-dev-cmd.mjs
 */
import { writeFileSync, readFileSync, rmSync } from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const target = path.join(root, 'dev.cmd');

const lines = [
  '@echo off',
  'setlocal',
  'title PetFocus Dev Server',
  '',
  'echo ==========================================',
  'echo   PetFocus - Dev Server',
  'echo ==========================================',
  'echo.',
  '',
  'set "ROOT=%~dp0"',
  'set "WEB=%ROOT%apps\\web"',
  'set "VITE=%WEB%\\node_modules\\vite\\bin\\vite.js"',
  '',
  'echo [1/3] Checking node...',
  'where node >nul 2>nul',
  'if errorlevel 1 (',
  '  echo   ERROR: node not found in PATH.',
  '  echo   Expected at: D:\\APP\\Node.js\\intall\\node.exe',
  '  echo   Fix: add D:\\APP\\Node.js\\intall to user PATH, then reopen this file.',
  '  echo.',
  '  pause',
  '  exit /b 1',
  ')',
  'for /f "delims=" %%v in (\'node -v\') do echo   node %%v',
  '',
  'echo [2/3] Checking dependencies...',
  'if not exist "%VITE%" (',
  '  echo   ERROR: vite not found.',
  '  echo   Expected at: %VITE%',
  '  echo   Fix: open a terminal in the repo root and run:  pnpm install',
  '  echo.',
  '  pause',
  '  exit /b 1',
  ')',
  'echo   OK',
  '',
  'echo [3/3] Starting server on http://localhost:5173/',
  'echo.',
  'echo   Keep this window open. Close it to stop the server.',
  'echo.',
  '',
  'start "" http://localhost:5173/',
  '',
  'pushd "%WEB%"',
  'node "%VITE%" --port 5173',
  'set "EXITCODE=%ERRORLEVEL%"',
  'popd',
  '',
  'echo.',
  'echo Server stopped. exit code = %EXITCODE%',
  'echo If the page did not open, copy this URL manually:',
  'echo   http://localhost:5173/',
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
console.log(`  非 ASCII : ${nonAscii} ${nonAscii === 0 ? '(OK)' : '(不合格)'}`);
console.log(`  含 CRLF  : ${hasCrlf ? 'OK' : '不合格'}`);
if (nonAscii !== 0 || !hasCrlf) process.exit(1);

// 清理早期用编辑器写的中文名脚本（编码不可靠，已废弃）
for (const stale of ['启动开发服务器.cmd', '启动开发服务器.ps1']) {
  try {
    rmSync(path.join(root, stale));
    console.log(`  已清理旧文件: ${stale}`);
  } catch {
    /* 不存在则忽略 */
  }
}
