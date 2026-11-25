// Run with Node.js and Chrome installed: node tests/planner-browser.mjs
// Uses a local fixture, without connecting to a Supabase database.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
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
  const poll = 'aaaaaaaa-1111-4111-8111-111111111111';
  await command('Runtime.enable');
  await command('Page.navigate', { url: `${origin}?poll=${poll}` });
  await until(() => evaluate("document.body.textContent.includes('Supabase is nog niet ingesteld.')"));
  await evaluate(`(async () => {
    window.fixturePoll = ${JSON.stringify(poll)};
    window.pollData = await import('/src/data/polls.js');
    await pollData.updateLocal(fixturePoll, row => {
      row.base = { title: 'Browser test', description: '', status: 'open', organizer: false,
        dates: { '2027-01-10': {date:'2027-01-10'}, '2027-04-12': {date:'2027-04-12'} }, votes: {} };
    });
  })()`);
  await until(() => evaluate("document.body.textContent.includes('Jouw gegevens')"));
  await evaluate("window.ballotSegment = () => [...document.querySelectorAll('fieldset')].find(node => node.querySelector('legend')?.textContent.startsWith('02'))");
  assert.equal(await evaluate("ballotSegment().querySelector('legend').getBoundingClientRect().height > 0"), true, 'Collapsed ballot title remains visible');
  assert.equal(await evaluate("ballotSegment().dataset.open"), 'false', 'Ballot closed before login');
  assert.equal(await evaluate("ballotSegment().querySelector('.collapsible-segment__body').getBoundingClientRect().height"), 0, 'Closed content takes no space');
  assert.equal(await evaluate("ballotSegment().disabled && ballotSegment().querySelector('.collapsible-segment__body').inert"), true, 'Closed controls cannot receive focus');
  await evaluate(`(() => {
    const inputs = document.querySelectorAll('.form > form input');
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
    for (const [input, value] of [[inputs[0], 'Anna'], [inputs[1], 'test-password']]) {
      setter.call(input, value);
      input.dispatchEvent(new Event('input', { bubbles: true }));
    }
  })()`);
  await evaluate("document.querySelector('.form > form button[type=submit]').click()");
  await until(() => evaluate("document.body.textContent.includes('Je aanmelding wordt gecontroleerd')"));
  assert.equal(await evaluate("ballotSegment().dataset.open"), 'false', 'Wait for server confirmation');
  await evaluate(`pollData.updateLocal(fixturePoll, row => {
    const login = row.queue.shift();
    row.base.votes[login.body.voter] = { name: login.body.name, votesJson: '{}' };
    row.ballotResults = { [login.operation]: {} };
  })`);
  await until(() => evaluate("ballotSegment().dataset.open === 'true'"));
  const heights = await evaluate(`new Promise(resolve => {
    const samples = [];
    const start = performance.now();
    function sample(now) {
      samples.push(ballotSegment().querySelector('.collapsible-segment__body').getBoundingClientRect().height);
      if (now - start < 750) requestAnimationFrame(sample);
      else resolve(samples);
    }
    requestAnimationFrame(sample);
  })`);
  assert.ok(new Set(heights).size > 3, 'Segment slides open over multiple frames');
  assert.ok(heights.every((height, index) => index === 0 || height + 1 >= heights[index - 1]), 'Opening has no reversal or overshoot');
  assert.equal(await evaluate("document.body.textContent.includes('Stem opslaan')"), false, 'No save button');
  assert.equal(await evaluate("document.querySelectorAll('.date-view-actions [role=radio]')[0].getAttribute('aria-label')"), 'Kaarten');
  assert.equal(await evaluate("document.querySelector('.date-view-actions [role=radio]').innerText"), '', 'View options are icon only');
  const themeHeight = await evaluate("document.querySelector('[aria-label=Thema]').getBoundingClientRect().height");
  assert.ok(themeHeight <= 36, 'Theme toggle fits the header');
  assert.equal(await evaluate("document.querySelector('[aria-label=Weergave]').getBoundingClientRect().height"), themeHeight, 'View and theme toggle sizes match');
  for (const view of ['Kalender', 'Kaarten']) {
    const resized = await evaluate(`new Promise(resolve => {
      const body = ballotSegment().querySelector('.collapsible-segment__body');
      const samples = [body.getBoundingClientRect().height];
      document.querySelector('.date-view-actions [aria-label="${view}"]').click();
      const start = performance.now();
      function sample(now) {
        samples.push(body.getBoundingClientRect().height);
        if (now - start < 800) requestAnimationFrame(sample);
        else resolve({ samples, target: Math.min(
          ballotSegment().querySelector('.collapsible-segment__content').getBoundingClientRect().height,
          innerHeight * 0.65, parseFloat(getComputedStyle(document.documentElement).fontSize) * 36
        ) });
      }
      requestAnimationFrame(sample);
    })`);
    if (Math.abs(resized.samples.at(-1) - resized.samples[0]) > 1) {
      assert.ok(new Set(resized.samples).size > 3, `Switching to ${view} animates changing frame heights`);
    }
    assert.ok(Math.abs(resized.samples.at(-1) - resized.target) < 1, 'Frame follows content within the viewport limit');
    const direction = Math.sign(resized.samples.at(-1) - resized.samples[0]);
    assert.ok(resized.samples.every((height, index) => index === 0 || direction * (height - resized.samples[index - 1]) >= -1), 'Content resizing has no reversal');
  }
  await command('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  await evaluate(`(async () => {
    window.originalDates = (await pollData.readLocal(fixturePoll)).base.dates;
    await pollData.updateLocal(fixturePoll, row => {
      row.base.dates = Object.fromEntries(Array.from({ length: 10 }, (_, index) => {
        const date = '2027-01-' + String(index + 10).padStart(2, '0');
        return [date, { date }];
      }));
    });
  })()`);
  await until(() => evaluate("document.querySelectorAll('.date-cards > li').length === 10"));
  await pause(800);
  const mobileScroll = await evaluate(`new Promise(resolve => {
    const body = ballotSegment().querySelector('.collapsible-segment__body');
    const toolbar = ballotSegment().querySelector('.date-choices__toolbar');
    body.scrollTop = body.scrollHeight;
    requestAnimationFrame(() => {
      const last = ballotSegment().querySelector('.date-cards > li:last-child').getBoundingClientRect();
      resolve({ after: toolbar.getBoundingClientRect().top, bodyTop: body.getBoundingClientRect().top,
        height: body.clientHeight, scrolling: body.scrollHeight > body.clientHeight,
        lastVisible: last.bottom <= body.getBoundingClientRect().bottom + 1 && last.top >= toolbar.getBoundingClientRect().bottom,
        noHorizontalOverflow: body.scrollWidth <= body.clientWidth });
    });
  })`);
  assert.ok(mobileScroll.height <= 844 * 0.65 + 1, 'Ten mobile cards stay within a bounded segment');
  assert.ok(mobileScroll.scrolling && mobileScroll.lastVisible, 'Internal scrolling reaches the final card');
  assert.ok(Math.abs(mobileScroll.bodyTop - mobileScroll.after) < 1, 'Legend and view toggle remain pinned');
  assert.ok(mobileScroll.noHorizontalOverflow, 'Mobile cards fit without horizontal scrolling');
  await evaluate("document.querySelector('.date-view-actions [aria-label=Kalender]').click()");
  await until(() => evaluate("ballotSegment().querySelector('.collapsible-segment__body').scrollTop === 0"));
  await evaluate("document.querySelector('.date-view-actions [aria-label=Kaarten]').click()");
  await evaluate("pollData.updateLocal(fixturePoll, row => { row.base.dates = originalDates; })");
  await command('Emulation.clearDeviceMetricsOverride');
  await until(() => evaluate("document.querySelectorAll('.date-cards > li').length === 2"));
  await evaluate("document.querySelector('.date-cards [role=radio]').click()");
  await until(() => evaluate("document.querySelector('.date-cards [role=radio]').getAttribute('aria-checked') === 'true'"));
  let queue = await evaluate('pollData.readLocal(fixturePoll).then(row => row.queue)');
  assert.equal(queue.length, 1, 'Click automatically queues a vote');
  assert.deepEqual(queue[0].body.changes, { '2027-01-10': 'yes' });
  await evaluate("document.querySelector('.date-cards [role=radio]').click()");
  await until(() => evaluate("document.querySelector('.date-cards [role=radio]').getAttribute('aria-checked') === 'false'"));
  queue = await evaluate('pollData.readLocal(fixturePoll).then(row => row.queue)');
  assert.equal(queue[1].body.changes['2027-01-10'], 'none', 'Click again clears the last vote');
  await evaluate("[...document.querySelectorAll('button')].find(button => button.textContent === 'Van stemmer wisselen').click()");
  await until(() => evaluate("ballotSegment().dataset.open === 'false'"));
  await until(() => evaluate("ballotSegment().querySelector('.collapsible-segment__body').getBoundingClientRect().height === 0"));
  assert.equal((await evaluate('pollData.readLocal(fixturePoll).then(row => row.queue)')).length, 2, 'Switching preserves queued votes');
  await evaluate(`(() => {
    const inputs = document.querySelectorAll('.form > form input');
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
    for (const [input, value] of [[inputs[0], 'Anna'], [inputs[1], 'wrong-password']]) {
      setter.call(input, value);
      input.dispatchEvent(new Event('input', { bubbles: true }));
    }
  })()`);
  await evaluate("document.querySelector('.form > form button[type=submit]').click()");
  await until(() => evaluate("document.body.textContent.includes('Je aanmelding wordt gecontroleerd')"));
  await evaluate(`pollData.updateLocal(fixturePoll, row => {
    const login = row.queue.pop();
    row.ballotResults[login.operation] = { rejection: 'Wachtwoord klopt niet.' };
  })`);
  await until(() => evaluate("document.body.textContent.includes('Wachtwoord klopt niet.')"));
  assert.equal(await evaluate("ballotSegment().dataset.open"), 'false', 'Rejected login cannot unlock ballot');
  assert.equal(await evaluate(`(() => {
    const row = { base: { status: 'open', dates: {}, votes: {} }, queue: [
      { kind: 'ballot', body: { voter: 'removed', changes: { '2027-01-10': 'yes' } } },
    ] };
    return Object.keys(pollData.project(row).votes).length;
  })()`), 0, 'Queued votes cannot restore a removed participant');
  await command('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
  assert.equal(await evaluate("getComputedStyle(ballotSegment().querySelector('.collapsible-segment__body')).transitionDuration"), '0s', 'Reduced motion disables sliding');
  await evaluate("pollData.updateLocal(fixturePoll, row => { row.base.dates = {}; row.base.votes = {}; })");
  await until(() => evaluate("document.querySelectorAll('.collapsible-segment[data-open=false]').length === 3"));
  assert.equal(await evaluate("[...document.querySelectorAll('.collapsible-segment legend')].every(node => node.getBoundingClientRect().height > 0)"), true, 'All four headers remain visible without dates or voters');
  console.log('PASS: mobile scrolling with ten cards and pinned legend, segment motion, login gate and automatic saves');
} finally {
  socket?.close();
  browser.kill();
  await server.close();
  await pause(500);
  await rm(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
}
