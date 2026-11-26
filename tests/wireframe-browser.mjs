// Standalone wireframe: layout review only, no app server or database.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
const profile = await mkdtemp(join(tmpdir(), 'amigo-wireframe-'));
const browser = spawn(process.env.CHROME_PATH || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', [
  '--headless=new', '--no-first-run', '--no-default-browser-check', '--remote-debugging-port=0',
  '--user-data-dir=' + profile, 'about:blank',
], { windowsHide: true, stdio: 'ignore' });
let socket;
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
async function until(check) {
  for (let i = 0; i < 100; i++) { const result = await check(); if (result) return result; await pause(100); }
  throw new Error('Timed out waiting for wireframe');
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
  await command('Emulation.setDeviceMetricsOverride', { width: 1600, height: 1100, deviceScaleFactor: 1, mobile: false });
  await command('Page.navigate', { url: pathToFileURL(join(process.cwd(), 'docs/planner-wireframe.html')).href });
  await until(() => evaluate("Boolean(document.querySelector('#preview')?.contentDocument?.querySelector('.page'))"));
  async function configure(values) {
    for (const [id, value] of Object.entries(values)) {
      await evaluate("(() => { const input = document.getElementById(" + JSON.stringify(id) + "); if(input.type === 'checkbox') input.checked = " + JSON.stringify(value) + "; else input.value = " + JSON.stringify(value) + "; input.dispatchEvent(new Event('change', { bubbles: true })); })()");
    }
    await until(() => evaluate("(() => { const frame = document.querySelector('#preview'); return frame.contentDocument?.documentElement?.dataset.revision === frame.dataset.revision && Boolean(frame.contentDocument.querySelector('.page')); })()"));
    await evaluate("document.querySelector('#preview').contentDocument.fonts.ready.then(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))))");
    try {
      await until(() => evaluate("(() => { const frame = document.querySelector('#preview'); return frame.clientHeight >= frame.contentDocument.body.getBoundingClientRect().height; })()"));
    } catch (error) {
      const dimensions = await evaluate("(() => { const frame = document.querySelector('#preview'); return { frame: frame.clientHeight, body: frame.contentDocument.body.getBoundingClientRect().height, actualWidth: frame.contentDocument.documentElement.clientWidth, heightStyle: frame.style.height }; })()");
      throw new Error('Preview height did not settle: ' + JSON.stringify({ values, dimensions }), { cause: error });
    }
  }
  let checked = 0;
  for (const width of [320, 390, 768, 1440]) {
    for (const theme of ['light', 'dark']) {
      for (const screen of ['create', 'share', 'poll', 'edit', 'final']) {
        const scenarios = screen === 'poll' ? ['guest', 'voter', 'organizer', 'closed'] : screen === 'edit' || screen === 'final' ? ['organizer', 'closed'] : ['organizer'];
        for (const scenario of scenarios) {
          for (const view of ['poll', 'final'].includes(screen) ? ['cards', 'calendar'] : ['cards']) {
            await configure({ screen, width: String(width), theme, scenario, view, stress: true });
            const layout = await evaluate(`(() => {
              const doc = document.querySelector('#preview').contentDocument;
              const title = doc.querySelector('h1').getBoundingClientRect();
              const logo = doc.querySelector('.logo').getBoundingClientRect();
              const nav = doc.querySelector('nav').getBoundingClientRect();
              const segment = doc.querySelector('.segments > .segment').getBoundingClientRect();
              const inset = parseFloat(getComputedStyle(doc.documentElement).getPropertyValue('--inset')) + 1.5;
              const content = [...doc.querySelectorAll('.segment-content')];
              const status = doc.querySelector('.status');
              const buttons = [...doc.querySelectorAll('.actions')].map(row => [...row.children].map(button => button.getBoundingClientRect()));
              const horizontal = [];
              function compareCenters(a, b, name) {
                if (!a || !b) return;
                const first = a.getBoundingClientRect(), second = b.getBoundingClientRect();
                if (Math.max(first.top, second.top) >= Math.min(first.bottom, second.bottom)) return;
                const delta = Math.abs(first.top + first.height / 2 - second.top - second.height / 2);
                if (delta > 1) horizontal.push({ name, delta });
              }
              compareCenters(doc.querySelector('.logo'), doc.querySelector('nav'), 'header');
              for (const row of doc.querySelectorAll('.access-row')) {
                compareCenters([...row.querySelectorAll('.fields input')].at(-1) || row.querySelector(':scope > p'), row.querySelector('.actions'), 'credentials/management');
              }
              for (const row of doc.querySelectorAll('.toolbar')) compareCenters(row.firstElementChild, row.lastElementChild, 'toolbar');
              for (const row of doc.querySelectorAll('.date-card')) compareCenters(row.querySelector('strong'), row.querySelector('.votes,button'), 'date card');
              for (const row of doc.querySelectorAll('.calendar-head')) compareCenters(row.querySelector('strong'), row.querySelector('button'), 'calendar heading');
              for (const row of doc.querySelectorAll('.date-row')) compareCenters(row.querySelector('input'), row.querySelector('button'), 'time field');
              for (const row of doc.querySelectorAll('.actions')) {
                const children = [...row.children];
                children.forEach((child, index) => children.slice(index + 1).forEach(other => compareCenters(child, other, 'action buttons')));
              }
              const table = doc.querySelector('.table-scroll');
              const share = doc.querySelector('.poll-heading>.icon-button');
              if (share && (Math.abs(share.getBoundingClientRect().right - segment.right + inset) > 1
                  || Math.abs(share.getBoundingClientRect().top - title.top - 2) > 1)) horizontal.push({name:'share/title position'});
              if (status && (!table || status.getBoundingClientRect().top < table.getBoundingClientRect().bottom + 11
                  || status.closest('.segment') !== table.closest('.segment'))) horizontal.push({name:'status below table'});
              const squareDays = [...doc.querySelectorAll('.calendar-day')].every(node => {
                const rect = node.getBoundingClientRect();
                return Math.abs(rect.width - rect.height) <= 1;
              });
              let sticky = true;
              if (table) {
                const before = table.querySelector('th').getBoundingClientRect().left;
                table.scrollLeft = 100;
                sticky = Math.abs(before - table.querySelector('th').getBoundingClientRect().left) < 1;
                table.scrollLeft = 0;
              }
              return {
                overflow: doc.documentElement.scrollWidth > doc.documentElement.clientWidth + 1,
                aligned: Math.abs(title.left-logo.left) < 1 && Math.abs(title.left-segment.left-inset) < 1 && Math.abs(nav.right-segment.right+inset) < 1,
                clipped: content.some(node => node.scrollWidth > node.clientWidth + 1),
                overlap: buttons.some(row => row.some((a, index) => row.slice(index + 1).some(b => a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top))),
                internalScroll: [...doc.querySelectorAll('.calendar,.cards')].some(node => node.scrollHeight > node.clientHeight + 1),
                body: doc.body.getBoundingClientRect().height, frame: document.querySelector('#preview').clientHeight,
                nameWidth: doc.querySelector('table th')?.getBoundingClientRect().width, sticky,
                horizontal,
                squareDays,
                statusFits: !status || status.getBoundingClientRect().height <= parseFloat(getComputedStyle(status).lineHeight) + 1,
                closedVisible: [...doc.querySelectorAll('.segment.closed')].every(node => node.querySelector('legend').getBoundingClientRect().height > 0),
              };
            })()`);
            const context = JSON.stringify({ width, theme, screen, scenario, view, layout });
            assert.equal(layout.overflow, false, 'No page overflow: ' + context);
            assert.equal(layout.clipped, false, 'No clipped segment content: ' + context);
            assert.equal(layout.overlap, false, 'Action buttons do not overlap: ' + context);
            assert.equal(layout.internalScroll, false, 'No internal card/calendar scrolling: ' + context);
            assert.equal(layout.aligned, true, 'Logo/title/frame and right actions align: ' + context);
            assert.equal(layout.squareDays, true, 'Calendar days remain square: ' + context);
            assert.deepEqual(layout.horizontal, [], 'Horizontal centers and text baselines align: ' + context);
            assert.equal(layout.statusFits, true, 'Status does not split across lines: ' + context);
            assert.equal(layout.sticky, true, 'Names stay visible during horizontal scrolling: ' + context);
            assert.equal(layout.closedVisible, true, 'Collapsed titles stay visible: ' + context);
            assert.ok(layout.frame >= layout.body, 'Preview expands to all content: ' + context);
            if (layout.nameWidth) assert.ok(layout.nameWidth >= 191, 'Name column stays readable: ' + context);
            checked++;
          }
        }
      }
    }
  }
  for (const [width, filename] of process.argv.includes('--screenshots') ? [[1440, 'planner-wireframe-desktop.png'], [390, 'planner-wireframe-mobile.png']] : []) {
    await configure({ screen: 'poll', width: String(width), theme: 'light', scenario: 'organizer', view: 'cards', stress: false, guides: true });
    const clip = await evaluate("(() => { const rect = document.querySelector('#preview').getBoundingClientRect(); return { x: rect.left + scrollX + 1, y: rect.top + scrollY + 1, width: rect.width - 2, height: rect.height - 2, scale: 1 }; })()");
    const screenshot = await command('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true, clip });
    await writeFile(join(process.cwd(), 'docs', filename), Buffer.from(screenshot.data, 'base64'));
  }
  console.log('PASS: ' + checked + ' wireframe layouts at 320/390/768/1440px, light/dark, cards/calendar, long content and role states.');
} finally {
  socket?.close();
  browser.kill();
  await pause(500);
  await rm(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
}
