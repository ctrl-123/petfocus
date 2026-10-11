/**
 * Service Worker：让应用可安装、可离线打开。
 *
 * ── 策略（刻意保守）──
 * - **导航请求**：网络优先，失败回退到缓存的 index.html。
 *   这样联网时永远拿到最新版本，断网时也能打开（本地优先架构本来就要求离线可用）。
 * - **静态资源**（/assets/ 下的 JS/CSS，带内容哈希）：缓存优先。
 *   文件名含哈希，内容变了文件名就变，因此不会拿到过期代码。
 * - **不缓存**任何 API 请求（本应用也只有结算与 AI 两条出网路径）。
 *
 * ⚠️ 为什么手写而不是引入 Workbox：
 * 体积预算只剩十几 KB（AGENTS.md §0.0）。这里的需求只有"离线打开 + 缓存静态资源"，
 * 手写 60 行足够，且行为完全可读、可解释。
 *
 * 更新策略：`CACHE_VERSION` 变更会触发 activate 时清掉旧缓存。
 */
const CACHE_VERSION = 'petfocus-v1';
const PRECACHE = ['/', '/index.html', '/manifest.webmanifest'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE_VERSION)
      // 单个资源失败不应让整个安装失败
      .then((cache) => Promise.allSettled(PRECACHE.map((url) => cache.add(url))))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((key) => key !== CACHE_VERSION).map((key) => caches.delete(key))),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const request = event.request;

  // 只处理同源 GET
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // 导航请求：网络优先，断网回退到缓存的页面外壳
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone();
          void caches.open(CACHE_VERSION).then((cache) => cache.put('/index.html', copy));
          return response;
        })
        .catch(() =>
          caches
            .match('/index.html')
            .then((cached) => cached ?? new Response('离线，且没有缓存页面', { status: 503 })),
        ),
    );
    return;
  }

  // 带内容哈希的构建产物：缓存优先
  if (url.pathname.startsWith('/assets/') || url.pathname === '/manifest.webmanifest') {
    event.respondWith(
      caches.match(request).then((cached) => {
        if (cached) return cached;
        return fetch(request).then((response) => {
          if (response.ok) {
            const copy = response.clone();
            void caches.open(CACHE_VERSION).then((cache) => cache.put(request, copy));
          }
          return response;
        });
      }),
    );
  }
});
