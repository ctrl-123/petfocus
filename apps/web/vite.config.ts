import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

/**
 * 部署子路径。
 *
 * - 本地开发与 Vercel 部署：`/`（默认）
 * - GitHub Pages：`/petfocus/`（因为站点在 `https://<用户>.github.io/petfocus/` 子目录下）
 *
 * 为什么用环境变量而不是写死：同一个构建要能适配两种托管方式。
 * 写死 `/petfocus/` 会让本地 dev server 与 Vercel 部署的资源路径全部 404。
 * 部署工作流里通过 `BASE_PATH=/petfocus/` 传入。
 */
const base = process.env.BASE_PATH ?? '/';

export default defineConfig({
  base,
  plugins: [react()],
  server: {
    port: 5173,
    watch: {
      /**
       * 为什么要忽略这些：
       * 某些编辑工具（含本仓库开发时使用的自动化写入）采用「写临时文件 + 原子重命名」，
       * 临时文件形如 `.TaskList.tsx.<pid>.<uuid>.tmpdir/TaskList.tsx.tmp`。
       * Vite 的 fs watcher 抓到这些正在被占用的文件时会抛 EBUSY 并**直接终止 dev server**。
       * 忽略它们即可：真正的源文件变更依然会正常触发 HMR。
       */
      ignored: ['**/*.tmpdir/**', '**/.*.tmp', '**/*.tmp'],
    },
  },
  build: {
    // 体积预算见技术设计第 9 节：首屏 JS（gzip）≤ 350 KB
    chunkSizeWarningLimit: 400,
  },
});
