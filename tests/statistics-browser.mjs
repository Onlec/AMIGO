// Public statistics and footer rotation against a local HTTP fixture, never production.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer as httpServer } from 'node:http';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer } from 'vite';

const state = { calls: 0, auth: 0, fail: false, hold: true, releases: [], data: {
  startedAt: '2026-11-26T09:00:00Z', planners: 120, registrations: 540, answers: 1000,
  maybeAnswers: 250, mondayAnswers: 100, mondayNoAnswers: 60,
  finalizedPlanners: 80, weekendDates: 60, unanimousDates: 20,
} };
const backend = httpServer(async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Content-Type', 'application/json');
  if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }
  if (req.url.startsWith('/auth/')) state.auth++;
  if (req.url !== '/rest/v1/rpc/amigo_statistics') { res.writeHead(404); res.end('{}'); return; }
  state.calls++;
  if (state.hold) await new Promise(resolve => state.releases.push(resolve));
  if (state.fail) { res.writeHead(503); res.end('{"code":"NETWORK","message":"Unavailable"}'); return; }
  res.end(JSON.stringify(state.data));
});
await new Promise(resolve => backend.listen(0, '127.0.0.1', resolve));
process.env.VITE_SUPABASE_URL = 'http://127.0.0.1:' + backend.address().port;
process.env.VITE_SUPABASE_PUBLISHABLE_KEY = 'statistics-fixture';
const profile = await mkdtemp(join(tmpdir(), 'amigo-statistics-'));
const server = await createServer({ server: { host: '127.0.0.1', port: 0 }, clearScreen: false });
await server.listen();
const origin = server.resolvedUrls.local[0];
const browser = spawn(process.env.CHROME_PATH || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', [
  '--headless=new', '--no-first-run', '--no-default-browser-check', '--remote-debugging-port=0',
  `--user-data-dir=${profile}`, 'about:blank',
], { windowsHide: true, stdio: 'ignore' });
let socket;
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
async function until(check) {
  for (let i = 0; i < 100; i++) { if (await check()) return; await pause(100); }
  throw new Error('Timed out waiting for statistics');
}

try {
  let port;
  await until(async () => {
    try { port = (await readFile(join(profile, 'DevToolsActivePort'), 'utf8')).split('\n')[0]; return port; }
    catch { return false; }
  });
  const targets = await (await fetch(`http://127.0.0.1:${port}/json`)).json();
  socket = new WebSocket(targets.find(target => target.type === 'page').webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    socket.addEventListener('open', resolve, { once: true });
    socket.addEventListener('error', reject, { once: true });
  });
  let nextId = 0;
  const requests = new Map();
  socket.addEventListener('message', ({ data }) => {
    const message = JSON.parse(data);
    if (!message.id) return;
    const request = requests.get(message.id);
    requests.delete(message.id);
    if (message.error) request.reject(new Error(message.error.message)); else request.resolve(message.result);
  });
  function command(method, params = {}) {
    return new Promise((resolve, reject) => {
      const id = ++nextId; requests.set(id, { resolve, reject });
      socket.send(JSON.stringify({ id, method, params }));
    });
  }
  async function evaluate(expression) {
    const result = await command('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
    return result.result.value;
  }
  await command('Page.enable');
  await command('Emulation.setFocusEmulationEnabled', { enabled: true });
  await command('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'no-preference' }] });
  // Advance only the footer clock, keeping animations and network work real.
  await command('Page.addScriptToEvaluateOnNewDocument', { source: `
    Math.random=()=>0.6;
    const originalInterval=window.setInterval, originalClear=window.clearInterval;
    window.footerTimers=new Map(); let timer=1000000000;
    window.setInterval=(callback,delay,...args)=>{
      if(delay===7000){footerTimers.set(++timer,()=>callback(...args));return timer;}
      return originalInterval(callback,delay,...args);
    };
    window.clearInterval=id=>{footerTimers.delete(id);originalClear(id);};
    window.advanceFooter=()=>{for(const callback of footerTimers.values())callback();};
  ` });
  await command('Page.navigate', { url: origin + '?page=statistics' });
  await until(() => evaluate("document.querySelector('.statistics-page') !== null"));
  assert.equal(await evaluate("document.querySelector('.footer-statistic__loading') !== null"), true);
  assert.equal(await evaluate("document.querySelector('[data-statistic=planners] dd').textContent"), '—');
  state.hold = false; state.releases.splice(0).forEach(resolve => resolve());
  await until(() => evaluate("document.querySelector('[data-statistic=planners] dd').textContent === '120'"));
  await evaluate('document.fonts.ready');
  assert.equal(state.calls, 1, 'The page and footer share a single fetch');
  assert.equal(state.auth, 0, 'Public statistics do not create a login');
  assert.equal(await evaluate('document.title'), 'AMIGO — Statistics');
  assert.equal(await evaluate("document.querySelectorAll('.statistics-page .statistic-card').length"), 10);
  assert.equal(await evaluate("document.querySelector('[data-statistic=doubt] dd').textContent"), '25%');
  const slide = () => evaluate("document.querySelector('.footer-statistic__slide').dataset.statistic");
  assert.equal(await slide(), 'planners', 'Initial selection uses the random offset');
  await until(() => evaluate('footerTimers.size === 1'));
  await evaluate('advanceFooter()'); await until(async () => await slide() === 'registrations');
  assert.equal(await evaluate("document.querySelector('.statistics-page h1').textContent"), 'Small plans. Big numbers.', 'Only the footer rotates');

  await evaluate("document.querySelector('.site-footer__inner').dispatchEvent(new MouseEvent('mouseover',{bubbles:true}))");
  await until(() => evaluate('footerTimers.size === 0'));
  await evaluate('advanceFooter()'); assert.equal(await slide(), 'registrations');
  await evaluate("document.querySelector('.site-footer__inner').dispatchEvent(new MouseEvent('mouseout',{bubbles:true,relatedTarget:document.body}))");
  await until(() => evaluate('footerTimers.size === 1'));
  await evaluate("document.querySelector('.site-footer a').focus()");
  await until(() => evaluate('footerTimers.size === 0'));
  await evaluate("document.activeElement.blur(); document.querySelector('.footer-statistic__pause').click()");
  await until(() => evaluate("document.querySelector('.footer-statistic__pause').getAttribute('aria-pressed') === 'true'"));
  assert.equal(await evaluate('footerTimers.size'), 0);
  await evaluate("document.querySelector('.footer-statistic__pause').click()");
  await until(() => evaluate('footerTimers.size === 1'));
  await evaluate("Object.defineProperty(document,'hidden',{configurable:true,value:true});document.dispatchEvent(new Event('visibilitychange'))");
  await until(() => evaluate('footerTimers.size === 0'));
  await evaluate("delete document.hidden;document.dispatchEvent(new Event('visibilitychange'))");
  await until(() => evaluate('footerTimers.size === 1'));

  await command('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
  await until(() => evaluate('footerTimers.size === 0'));
  assert.equal(await evaluate("getComputedStyle(document.querySelector('.footer-statistic__slide')).animationName"), 'none');
  assert.equal(await evaluate("document.querySelector('.footer-statistic__pause') === null"), true);

  for (const locale of ['en-GB', 'nl-BE']) {
    await evaluate(`import('/src/i18n/index.js').then(module=>module.setLocale(${JSON.stringify(locale)}))`);
    for (const theme of ['light', 'dark']) {
      await evaluate(`document.documentElement.dataset.theme=${JSON.stringify(theme)}`);
      for (const width of [320, 390, 720, 1440]) {
        await command('Emulation.setDeviceMetricsOverride', { width, height: 1000, deviceScaleFactor: 1, mobile: false });
        await pause(50);
        const problems = await evaluate(`(()=>{
          const issues=[];
          if(document.documentElement.scrollWidth>innerWidth+1)issues.push('page overflow');
          for(const node of document.querySelectorAll('.statistic-card,.site-footer__inner')){
            if(node.scrollWidth>node.clientWidth+1)issues.push(node.className+' overflow');
          }
          return issues;
        })()`);
        assert.deepEqual(problems, [], `${locale} ${theme} ${width}px`);
      }
    }
  }

  await evaluate("document.querySelector('.site-header')?.blur()");
  await command('Page.navigate', { url: origin });
  await until(() => evaluate("document.querySelector('.planner-page:not(.statistics-page)') !== null && document.querySelector('.footer-statistic__slide') !== null"));
  await evaluate("document.querySelector('.site-footer a').click()");
  await until(() => evaluate("document.querySelector('.statistics-page') !== null"));
  assert.equal(new URL(await evaluate('location.href')).searchParams.get('page'), 'statistics');
  await evaluate('history.back()');
  await until(() => evaluate("document.querySelector('.planner-page:not(.statistics-page)') !== null"));

  state.fail = true;
  await command('Page.navigate', { url: origin + '?page=statistics' });
  await until(() => evaluate("document.querySelector('.statistics-error') !== null"));
  assert.equal(await evaluate("document.querySelector('[data-statistic=planners] dd').textContent"), '—', 'An unavailable count is not zero');
  assert.equal(await evaluate("document.querySelector('.footer-statistic__kind').textContent"), 'Voor de grap');
  state.fail = false;
  state.data = { ...state.data, answers: 0, mondayAnswers: 0, finalizedPlanners: 0, maybeAnswers: 0,
    mondayNoAnswers: 0, weekendDates: 0, unanimousDates: 0 };
  await evaluate("document.querySelector('.statistics-error button').click()");
  await until(() => evaluate("document.querySelector('[data-statistic=answers] dd').textContent === '0'"));
  assert.equal(await evaluate("document.querySelector('[data-statistic=doubt] dd').textContent"), 'Nog even verzamelen');
  assert.equal(await evaluate("document.querySelector('.statistics-error') === null"), true);
  assert.equal(state.auth, 0);
  console.log('PASS: public statistics, one shared fetch, random rotating footer, hover/focus/pause/hidden-tab controls, reduced motion, EN/NL, both themes, responsive layouts, navigation, errors and retry.');
} finally {
  state.releases.splice(0).forEach(resolve => resolve());
  socket?.close(); browser.kill(); await server.close();
  backend.closeAllConnections(); await new Promise(resolve => backend.close(resolve));
  await pause(500); await rm(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
}
