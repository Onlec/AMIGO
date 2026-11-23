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
        for (const name of files) {
          const item = bundle[name];
          hash.update(name).update(item.type === 'chunk' ? item.code : item.source);
        }
        const version = hash.digest('hex').slice(0, 16);
        this.emitFile({ type: 'asset', fileName: 'sw.js', source: `
const prefix = 'amigo-shell:' + self.registration.scope + ':';
const cacheName = prefix + '${version}';
const files = ${JSON.stringify(files)}.map(file => new URL(file, self.registration.scope).href);
self.addEventListener('install', event => {
  event.waitUntil(caches.open(cacheName).then(cache => cache.addAll(files)));
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
    event.respondWith(caches.open(cacheName).then(async cache => await cache.match(key) || fetch(request)));
  }
});
` });
      },
    },
  };
}
