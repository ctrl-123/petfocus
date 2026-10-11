import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App.tsx';
import './styles.css';
// 宠物渲染样式必须独立引入（不能放进 Tailwind 的层里，原因见该文件头部注释）
import './features/pet/pet-renderer.css';

const container = document.getElementById('root');
if (!container) {
  throw new Error('找不到挂载点 #root，请检查 index.html');
}

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

/**
 * 注册 Service Worker（PWA：可安装、离线可打开）。
 *
 * 四个刻意的取舍：
 * 1. **只在生产构建注册**。开发时 SW 会缓存旧资源，改了代码却看不见效果，
 *    这是最浪费时间的坑之一。
 * 2. **不 await、不阻塞渲染**。离线能力是增强，不是启动前提。
 * 3. **失败静默**。注册不上（隐私模式、不支持）就当作没有离线能力，
 *    不弹任何提示打扰用户——这符合"降级优先"的原则。
 * 4. **路径要带 base**。部署到 GitHub Pages 时站点在 `/petfocus/` 子目录下，
 *    写死 `/sw.js` 会 404（资源存在 `/petfocus/sw.js`）。
 */
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    void navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`).catch(() => {
      /* 注册失败即没有离线能力，不影响使用 */
    });
  });
}
