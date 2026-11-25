import { createHash } from 'node:crypto';

// Build the shell cache from Vite's actual output, including the local fonts.
export function offlineShell() {
  return {
    name: 'amigo-offline-shell',
    apply: 'build',
    enforce: 'post',
    generateBundle: {
      order: 'post',
      handler(_, bundle) {
        const files = Object.keys(bundle).sort();
        const hash = createHash('sha256');
        hash.update('amigo-shell-format:2');
        for (const name of files) {
          const item = bundle[name];
          hash.update(name).update(item.type === 'chunk' ? item.code : item.source);
        }
        const version = hash.digest('hex').slice(0, 16);
        this.emitFile({ type: 'asset', fileName: 'sw.js', source: `
const prefix = 'amigo-shell:' + self.registration.scope + ':';
const cacheName = prefix + '${version}';
const files = ${JSON.stringify(files)}.map(file => new URL(file, self.registration.scope).href);
function reusableResponse(response) {
  // Static hosts redirect /index.html to /. Chrome rejects that redirected
  // response when it is reused for a navigation with redirect mode "manual".
  return response.redirected
    ? new Response(response.body, { status: response.status, statusText: response.statusText, headers: response.headers })
    : response;
}
self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(cacheName);
    await Promise.all(files.map(async url => {
      const response = await fetch(new Request(url, { cache: 'reload' }));
      if (!response.ok) throw new Error('Offline cache: HTTP ' + response.status);
      await cache.put(url, reusableResponse(response));
    }));
    await self.skipWaiting();
  })());
});
self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    for (const key of await caches.keys()) {
      if (key.startsWith(prefix) && key !== cacheName) await caches.delete(key);
    }
    await self.clients.claim();
  })());
});
self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  const scope = new URL(self.registration.scope);
  if (url.origin !== scope.origin) return;
  const shell = request.mode === 'navigate' && [scope.pathname, scope.pathname + 'index.html'].includes(url.pathname);
  const key = shell ? new URL('index.html', scope).href : url.href;
  if (files.includes(key)) {
    event.respondWith(caches.open(cacheName).then(async cache => {
      const response = await cache.match(key) || await fetch(request);
      return shell ? reusableResponse(response) : response;
    }));
  }
});
` });
      },
    },
  };
}
