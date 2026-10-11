import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
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
