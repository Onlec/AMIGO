// Run with Node.js and Chrome installed: node tests/planner-browser.mjs
// Uses a local fixture, without connecting to a Supabase database.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer } from 'vite';

const profile = await mkdtemp(join(tmpdir(), 'amigo-browser-'));
process.env.VITE_SUPABASE_URL = '';
process.env.VITE_SUPABASE_PUBLISHABLE_KEY = '';
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
  for (let i = 0; i < 100; i++) {
    const result = await check();
    if (result) return result;
    await pause(100);
  }
  throw new Error('Timed out waiting for browser state');
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
  await command('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
  await command('Page.navigate', { url: origin });
  await until(() => evaluate("document.querySelector('.planner-page') !== null"));
  const run = (fn, args) => evaluate('(' + fn.toString() + ')(' + JSON.stringify(args) + ')');
  const id = 'cccccccc-1111-4111-8111-111111111111';
  const own = 'dddddddd-1111-4111-8111-111111111111';
  async function prepare(scenario, view, theme) {
    await run(async ({ id, own, scenario, view, theme }) => {
      const data = await import('/src/data/polls.js');
      localStorage.setItem('amigo-theme', theme);
      localStorage.setItem('amigo-date-view', view);
      sessionStorage.removeItem('amigo-ballot:' + id);
      const authorized = ['organizer', 'closed', 'edit', 'final'].includes(scenario);
      if (scenario === 'guest') sessionStorage.removeItem('amigo-voter:' + id);
      else sessionStorage.setItem('amigo-voter:' + id, JSON.stringify({ voter: own, proof: 'b'.repeat(64), name: 'Alexandra van der Meer-Vandenberghe', organizer: authorized }));
      await data.updateLocal(id, row => {
        row.queue = []; row.notices = []; row.missing = false;
        row.base = {
          title: 'Eindejaarsdiner met alle vrienden en collega’s van het hele team', description: 'Samen eten en het nieuwe jaar plannen.',
          organizer: authorized, organizerVoter: own, ownVoter: null,
          status: scenario === 'closed' ? 'closed' : 'open', finalDateId: scenario === 'closed' ? '2026-12-06' : null,
          dates: Object.fromEntries(Array.from({ length: 10 }, (_, index) => { const day = '2026-12-' + String(index + 4).padStart(2, '0'); return [day, { date: day, time: '18:30' }]; })),
          votes: { [own]: { name: 'Alexandra van der Meer-Vandenberghe', votesJson: '{"2026-12-04":"yes"}' }, other: { name: 'Jean-Christophe De Smet-Van den Broeck', votesJson: '{}' } },
        };
      });
    }, { id, own, scenario, view, theme });
    const url = scenario === 'create' ? origin + '?page=planner' : origin + '?poll=' + id + (scenario === 'share' ? '&screen=share' : '');
    await command('Page.navigate', { url });
    await until(() => evaluate("document.querySelector('.planner-page h1') !== null"));
    if (scenario === 'edit' || scenario === 'final') {
      await until(() => evaluate("document.querySelector('.unlock-form button[value=edit]')?.disabled === false"));
      await evaluate("document.querySelector('.unlock-form button[value=" + scenario + "]').click()");
      await until(() => evaluate("document.querySelector('.organizer-panel') !== null"));
    }
    if (scenario === 'create') {
      await evaluate("document.querySelectorAll('.calendar-day-button')[0].click()");
      await evaluate("document.querySelectorAll('.calendar-day-button')[1].click()");
    }
    await evaluate("document.fonts.ready.then(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))))");
    await pause(80);
  }
  function layoutMetrics() {
    const page = document.querySelector('.planner-page'), title = page.querySelector('h1');
    const logo = document.querySelector('.planner-header .logo'), nav = document.querySelector('.planner-header nav');
    const frame = page.querySelector('fieldset');
    const errors = [];
    const near = (a, b, name) => { if (Math.abs(a - b) > 1) errors.push(name); };
    for (const row of page.querySelectorAll('.access-row')) {
      const content = row.closest('.collapsible-segment__content');
      if (content) near(row.getBoundingClientRect().left, content.getBoundingClientRect().left + parseFloat(getComputedStyle(content).paddingLeft), 'access row inner edge');
    }
    near(title.getBoundingClientRect().left, logo.getBoundingClientRect().left, 'title/logo left');
    if (frame) {
      near(frame.getBoundingClientRect().left, title.getBoundingClientRect().left, 'segment/title left');
      near(frame.getBoundingClientRect().right, nav.getBoundingClientRect().right, 'segment/header right');
    }
    if (document.documentElement.scrollWidth > innerWidth + 1) errors.push('page overflow');
    for (const node of page.querySelectorAll('.collapsible-segment[data-open=true] .collapsible-segment__content,.planner-fields')) {
      if (node.scrollWidth > node.clientWidth + 1) errors.push('segment content overflow');
    }
    const visible = node => node.getBoundingClientRect().height > 0 && !node.closest('.collapsible-segment[data-open=false]');
    for (const cell of page.querySelectorAll('.calendar-cell:not(.calendar-cell--empty)')) {
      if (!visible(cell)) continue;
      const rect = cell.getBoundingClientRect();
      near(rect.width, rect.height, 'calendar cell is not square');
      const button = cell.querySelector('button');
      if (button) {
        near(button.getBoundingClientRect().width, button.getBoundingClientRect().height, 'calendar button is not square');
        if (button.scrollHeight > button.clientHeight + 1 || button.scrollWidth > button.clientWidth + 1) errors.push('calendar text clipped');
      }
    }
    function centered(a, b, name) {
      if (!a || !b || !visible(a) || !visible(b)) return;
      const first = a.getBoundingClientRect(), second = b.getBoundingClientRect();
      if (Math.max(first.top, second.top) >= Math.min(first.bottom, second.bottom)) return;
      near(first.top + first.height / 2, second.top + second.height / 2, name);
    }
    for (const row of page.querySelectorAll('.access-row')) centered([...row.querySelectorAll('.access-fields input')].at(-1) || row.querySelector('.access-fields p'), row.querySelector('.access-actions'), 'access row centers');
    for (const card of page.querySelectorAll('.date-cards > li')) centered(card.querySelector('strong'), card.querySelector(':scope > button,:scope > .segmented-control'), 'card centers');
    for (const row of page.querySelectorAll('.date-choices__toolbar')) centered(row.querySelector('.vote-legend'), row.querySelector('.date-view-actions'), 'toolbar centers');
    for (const row of page.querySelectorAll('.date-row')) centered(row.querySelector('input'), row.querySelector('button'), 'date/time row centers');
    for (const row of page.querySelectorAll('.edit-actions')) {
      const children = [...row.children].filter(visible);
      children.forEach((child, index) => children.slice(index + 1).forEach(other => {
        centered(child, other, 'action centers');
        const a = child.getBoundingClientRect(), b = other.getBoundingClientRect();
        if (a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top) errors.push('overlapping buttons');
      }));
    }
    const table = page.querySelector('.vote-grid-scroll');
    if (table && visible(table)) {
      const name = table.querySelector('th');
      if (name.getBoundingClientRect().width < 191) errors.push('name column too narrow');
      const before = name.getBoundingClientRect().left;
      table.scrollLeft = 100;
      near(before, name.getBoundingClientRect().left, 'name column not sticky');
      table.scrollLeft = 0;
    }
    return [...new Set(errors)];
  }
  let checked = 0;
  for (const width of [320, 390, 768, 1440]) {
    await command('Emulation.setDeviceMetricsOverride', { width, height: 950, deviceScaleFactor: 1, mobile: width < 600 });
    for (const theme of ['light', 'dark']) {
      for (const scenario of ['create', 'share', 'guest', 'voter', 'organizer', 'closed', 'edit', 'final']) {
        for (const view of ['voter', 'organizer', 'final'].includes(scenario) ? ['cards', 'calendar'] : ['cards']) {
          await prepare(scenario, view, theme);
          assert.deepEqual(await run(layoutMetrics), [], JSON.stringify({ width, theme, scenario, view }));
          if (process.argv.includes('--screenshots') && theme === 'light' && scenario === 'organizer'
              && ((width === 390 && view === 'calendar') || (width === 1440 && view === 'cards'))) {
            const metrics = await command('Page.getLayoutMetrics');
            const screenshot = await command('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true,
              clip: { x: 0, y: 0, width, height: Math.ceil(metrics.cssContentSize.height), scale: 1 } });
            await writeFile('.tmp-planner-' + width + '.png', Buffer.from(screenshot.data, 'base64'));
          }
          checked++;
        }
      }
    }
  }
  console.log('PASS: ' + checked + ' real planner layouts, square calendar cells/buttons, complete time/vote content and aligned controls.');
} finally {
  socket?.close();
  browser.kill();
  await server.close();
  await pause(500);
  await rm(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
}
