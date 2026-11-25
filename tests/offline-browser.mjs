// Production regression: hosting redirects /index.html to /.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';
import { build } from 'vite';

process.env.VITE_SUPABASE_URL = '';
process.env.VITE_SUPABASE_PUBLISHABLE_KEY = '';
const output = await build({ logLevel: 'silent', build: { write: false } });
const files = new Map(output.output.map(item => ['/' + item.fileName, item.type === 'chunk' ? item.code : item.source]));
const mime = { js: 'text/javascript', css: 'text/css', html: 'text/html', woff2: 'font/woff2' };
const server = createServer((request, response) => {
  const path = new URL(request.url, 'http://localhost').pathname;
  if (path === '/index.html') { response.writeHead(308, { Location: '/' }); response.end(); return; }
  const key = path === '/' ? '/index.html' : path;
  if (!files.has(key)) { response.writeHead(404); response.end(); return; }
  const headers = { 'Content-Type': mime[key.split('.').at(-1)] || 'application/octet-stream', 'Cache-Control': 'no-store' };
  if (key === '/index.html') headers['Content-Encoding'] = 'gzip';
  response.writeHead(200, headers);
  response.end(key === '/index.html' ? gzipSync(files.get(key)) : files.get(key));
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const origin = 'http://127.0.0.1:' + server.address().port + '/';
const profile = await mkdtemp(join(tmpdir(), 'amigo-offline-browser-'));
const browser = spawn(process.env.CHROME_PATH || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', [
  '--headless=new', '--no-first-run', '--no-default-browser-check', '--remote-debugging-port=0',
  '--user-data-dir=' + profile, 'about:blank',
], { windowsHide: true, stdio: 'ignore' });
let socket;
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
async function until(check) {
  for (let i = 0; i < 100; i++) { const result = await check(); if (result) return result; await pause(100); }
  throw new Error('Timed out waiting for production browser state');
}
try {
  const port = await until(async () => {
    try { return (await readFile(join(profile, 'DevToolsActivePort'), 'utf8')).split('\n')[0]; }
    catch { return null; }
  });
  const targets = await (await fetch(`http://127.0.0.1:${port}/json`, { signal: AbortSignal.timeout(10000) })).json();
  socket = new WebSocket(targets.find(target => target.type === 'page').webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Browser connection timed out')), 10000);
    socket.addEventListener('open', () => { clearTimeout(timer); resolve(); }, { once: true });
    socket.addEventListener('error', () => { clearTimeout(timer); reject(new Error('Browser connection failed')); }, { once: true });
  });
  let nextId = 0;
  const requests = new Map();
  socket.addEventListener('message', ({ data }) => {
    const message = JSON.parse(data);
    if (message.method === 'Runtime.exceptionThrown') console.error(message.params.exceptionDetails.exception?.description);
    if (!message.id) return;
    const request = requests.get(message.id);
    requests.delete(message.id);
    if (message.error) request.reject(new Error(message.error.message));
    else request.resolve(message.result);
  });
  function command(method, params = {}) {
    return new Promise((resolve, reject) => {
      const id = ++nextId;
      requests.set(id, { resolve, reject });
      socket.send(JSON.stringify({ id, method, params }));
    });
  }
  async function evaluate(expression) {
    const response = await command('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
    if (response.exceptionDetails) throw new Error(response.exceptionDetails.exception?.description || response.exceptionDetails.text);
    return response.result.value;
  }
  await command('Page.enable');
  await command('Network.enable');
  let navigationError = '';
  socket.addEventListener('message', ({ data }) => {
    const message = JSON.parse(data);
    if (message.method === 'Network.loadingFailed' && message.params.type === 'Document') navigationError = message.params.errorText;
  });
  await command('Page.navigate', { url: origin });
  await until(() => evaluate("document.querySelector('h1')?.textContent === 'Nieuwe datumprikker'"));
  await evaluate('navigator.serviceWorker.ready.then(() => true)');
  await until(() => evaluate('Boolean(navigator.serviceWorker.controller)'));
  await evaluate("(() => { const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set; const inputs = document.querySelectorAll('.form input:not([type=checkbox])'); for (const [input, value] of [[inputs[0], 'Chrome navigation'], [inputs[1], 'Maker'], [inputs[2], 'test-password']]) { setter.call(input, value); input.dispatchEvent(new Event('input', { bubbles: true })); } })()");
  await evaluate("document.querySelectorAll('.calendar-day-button')[0].click()");
  await evaluate("document.querySelectorAll('.calendar-day-button')[1].click()");
  await evaluate("document.querySelector('button[type=submit]').click()");
  await until(() => evaluate("document.querySelector('h1')?.textContent === 'Deel je datumprikker'"));
  const pollLink = await evaluate("[...document.querySelectorAll('a')].find(link => link.textContent === 'Naar de datumprikker').href");
  await evaluate("[...document.querySelectorAll('a')].find(link => link.textContent === 'Naar de datumprikker').click()");
  await until(async () => navigationError || await evaluate("document.querySelector('.voter-credentials') !== null"));
  assert.equal(navigationError, '', 'Share screen to poll navigation must not fail in Chrome');
  assert.equal(await evaluate("document.querySelector('h1').textContent"), 'Chrome navigation');
  await evaluate("document.querySelector('.logo').click()");
  await until(async () => navigationError || await evaluate("document.querySelector('h1')?.textContent === 'Nieuwe datumprikker'"));
  assert.equal(navigationError, '', 'Returning to the creation page must not fail');
  const history = await command('Page.getNavigationHistory');
  await command('Page.navigateToHistoryEntry', { entryId: history.entries[history.currentIndex - 1].id });
  await until(async () => navigationError || await evaluate("document.querySelector('.voter-credentials') !== null"));
  assert.equal(navigationError, '', 'Browser Back returns to the poll without a navigation error');
  await command('Page.navigateToHistoryEntry', { entryId: history.entries[history.currentIndex].id });
  await until(async () => navigationError || await evaluate("document.querySelector('h1')?.textContent === 'Nieuwe datumprikker'"));
  assert.equal(navigationError, '', 'Browser Forward returns to creation without a navigation error');
  await command('Network.emulateNetworkConditions', { offline: true, latency: 0, downloadThroughput: 0, uploadThroughput: 0 });
  const offlinePoll = await command('Page.navigate', { url: pollLink });
  assert.equal(offlinePoll.errorText, undefined, 'Cached poll navigation also works offline');
  await until(() => evaluate("document.querySelector('h1')?.textContent === 'Chrome navigation'"));
  const offlineHome = await command('Page.navigate', { url: origin });
  assert.equal(offlineHome.errorText, undefined, 'Cached creation page also works offline');
  await until(() => evaluate("document.querySelector('h1')?.textContent === 'Nieuwe datumprikker'"));
  console.log('PASS: Chrome production create/share-to-poll and return navigation, online and offline, with index.html redirect.');
} finally {
  socket?.close();
  browser.kill();
  await new Promise(resolve => server.close(resolve));
  await pause(500);
  await rm(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
}
