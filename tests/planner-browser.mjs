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
  await until(() => evaluate("document.body.textContent.includes('Jouw deelname')"));
  await evaluate("window.ballotSegment = () => document.querySelector('.voter-availability'); window.participationBody = () => document.querySelector('.collapsible-segment__body')");
  await evaluate(`window.recordMotion = action => new Promise(resolve => {
    const samples = [];
    const start = performance.now();
    function sample(now) {
      const body = participationBody();
      const segment = body.closest('fieldset');
      samples.push({ phase: segment.dataset.phase, height: body.getBoundingClientRect().height,
        signedIn: ballotSegment().dataset.open, view: localStorage.getItem('amigo-date-view') || 'cards',
        disabled: segment.disabled, inert: body.inert, duration: getComputedStyle(body).transitionDuration });
      if (now - start < 850) requestAnimationFrame(sample);
      else resolve(samples);
    }
    requestAnimationFrame(sample);
    action();
  })`);
  assert.equal(await evaluate("document.querySelector('.collapsible-segment legend').textContent"), '01 — Jouw deelname', 'Login and availability share one segment');
  assert.equal(await evaluate("document.querySelectorAll('.collapsible-segment legend').length"), 3, 'Three numbered segments remain');
  assert.equal(await evaluate("ballotSegment().dataset.open"), 'false', 'Ballot closed before login');
  assert.equal(await evaluate("ballotSegment().querySelector('.voter-ballot').getBoundingClientRect().height"), 0, 'Closed content takes no space');
  assert.equal(await evaluate("ballotSegment().hidden"), true, 'Availability stays hidden until login');
  await evaluate(`(() => {
    const inputs = document.querySelectorAll('.voter-credentials input');
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
    for (const [input, value] of [[inputs[0], 'Anna'], [inputs[1], 'test-password']]) {
      setter.call(input, value);
      input.dispatchEvent(new Event('input', { bubbles: true }));
    }
  })()`);
  await evaluate("document.querySelector('.voter-credentials button[type=submit]').click()");
  await until(() => evaluate("document.body.textContent.includes('Je aanmelding wordt gecontroleerd')"));
  assert.equal(await evaluate("ballotSegment().dataset.open"), 'false', 'Wait for server confirmation');
  const loginMotion = await evaluate(`recordMotion(() => pollData.updateLocal(fixturePoll, row => {
    const login = row.queue.shift();
    row.base.votes[login.body.voter] = { name: login.body.name, votesJson: '{}' };
    row.ballotResults = { [login.operation]: {} };
  }))`);
  await until(() => evaluate("ballotSegment().dataset.open === 'true'"));
  assert.ok(loginMotion.some(frame => frame.phase === 'closing'), 'Confirmed login closes the segment');
  assert.ok(loginMotion.some(frame => frame.height < 1), 'Login replacement waits until fully closed');
  assert.ok(loginMotion.filter(frame => frame.phase === 'closing').every(frame => frame.signedIn === 'false'), 'Login form remains during closing');
  assert.ok(loginMotion.some(frame => frame.phase === 'opening' && frame.signedIn === 'true'), 'Availability opens after the swap');
  assert.equal(loginMotion.filter((frame, index) => frame.phase === 'closing' && (index === 0 || loginMotion[index - 1].phase !== 'closing')).length, 1, 'Login result is handled once');
  assert.equal(await evaluate("document.activeElement.classList.contains('voter-ballot')"), true, 'Login restores focus to availability');
  assert.equal(await evaluate("document.body.textContent.includes('Stem opslaan')"), false, 'No save button');
  assert.equal(await evaluate("document.querySelectorAll('.date-view-actions [role=radio]')[0].getAttribute('aria-label')"), 'Kaarten');
  assert.equal(await evaluate("document.querySelector('.date-view-actions [role=radio]').innerText"), '', 'View options are icon only');
  const themeHeight = await evaluate("document.querySelector('[aria-label=Thema]').getBoundingClientRect().height");
  assert.ok(themeHeight <= 36, 'Theme toggle fits the header');
  assert.equal(await evaluate("document.querySelector('[aria-label=Weergave]').getBoundingClientRect().height"), themeHeight, 'View and theme toggle sizes match');
  for (const view of ['Kalender', 'Kaarten']) {
    const previousView = view === 'Kalender' ? 'cards' : 'calendar';
    const nextView = view === 'Kalender' ? 'calendar' : 'cards';
    const frames = await evaluate(`recordMotion(() => {
      const button = document.querySelector('.date-view-actions [aria-label="${view}"]');
      button.focus();
      button.click();
      button.click();
    })`);
    assert.ok(frames.some(frame => frame.height < 1), 'Whole segment closes before changing views');
    assert.ok(frames.filter(frame => frame.phase === 'closing').every(frame => frame.view === previousView), 'Old view is preserved while closing');
    assert.ok(frames.some(frame => frame.phase === 'opening' && frame.view === nextView), 'New view appears during opening');
    assert.ok(frames.filter(frame => frame.phase === 'closing').every(frame => frame.duration === '0.25s'), 'Closing uses 250ms');
    assert.ok(frames.filter(frame => frame.phase === 'opening').every(frame => frame.duration === '0.35s'), 'Opening uses 350ms');
    for (const phase of ['closing', 'opening']) {
      const samples = frames.filter(frame => frame.phase === phase);
      const direction = phase === 'closing' ? -1 : 1;
      assert.ok(samples.every((frame, index) => index === 0 || direction * (frame.height - samples[index - 1].height) >= -1), 'Each motion phase is smooth without reversal');
    }
    assert.ok(frames.filter(frame => frame.phase !== 'idle').every(frame => frame.disabled && frame.inert), 'Interaction blocked throughout the cycle');
    assert.equal(frames.filter((frame, index) => frame.phase === 'closing' && (index === 0 || frames[index - 1].phase !== 'closing')).length, 1, 'Repeated clicks create only one cycle');
    assert.equal(await evaluate("document.activeElement.closest('[aria-label=Weergave]') !== null && document.activeElement.getAttribute('aria-checked') === 'true'"), true, 'View toggle receives focus after reopening');
    const targetHeight = await evaluate("participationBody().querySelector('.collapsible-segment__content').getBoundingClientRect().height");
    assert.ok(Math.abs(frames.at(-1).height - targetHeight) < 1, 'Reopened frame fits the new content');
  }
  await evaluate("document.querySelector('.date-view-actions [aria-label=Kalender]').click()");
  await until(() => evaluate("document.querySelector('.calendar') && participationBody().closest('fieldset').dataset.phase === 'idle'"));
  const monthMotion = await evaluate(`recordMotion(() => document.querySelector('[aria-label="Volgende maand"]').click())`);
  assert.ok(monthMotion.every(frame => frame.phase === 'idle'), 'Month navigation does not close the segment');
  await evaluate("document.querySelector('.date-view-actions [aria-label=Kaarten]').click()");
  await until(() => evaluate("document.querySelector('.date-cards') && participationBody().closest('fieldset').dataset.phase === 'idle'"));
  await evaluate("document.querySelector('.date-view-actions [aria-label=Kalender]').click(); document.querySelector('.logo').focus()");
  await until(() => evaluate("document.querySelector('.calendar') && participationBody().closest('fieldset').dataset.phase === 'idle'"));
  assert.equal(await evaluate("document.activeElement.classList.contains('logo')"), true, 'Transition does not steal focus moved to the header');
  await evaluate("document.querySelector('.date-view-actions [aria-label=Kaarten]').click()");
  await until(() => evaluate("document.querySelector('.date-cards') && participationBody().closest('fieldset').dataset.phase === 'idle'"));
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
    const body = ballotSegment().querySelector('.voter-ballot');
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
  await until(() => evaluate("ballotSegment().querySelector('.voter-ballot').scrollTop === 0"));
  await until(() => evaluate("participationBody().closest('fieldset').dataset.phase === 'idle'"));
  await evaluate("document.querySelector('.date-view-actions [aria-label=Kaarten]').click()");
  await until(() => evaluate("document.querySelector('.date-cards') && participationBody().closest('fieldset').dataset.phase === 'idle'"));
  await evaluate("pollData.updateLocal(fixturePoll, row => { row.base.dates = originalDates; })");
  await command('Emulation.clearDeviceMetricsOverride');
  await until(() => evaluate("document.querySelectorAll('.date-cards > li').length === 2"));
  const voteMotion = await evaluate("recordMotion(() => document.querySelector('.date-cards [role=radio]').click())");
  assert.ok(voteMotion.every(frame => frame.phase === 'idle'), 'Automatic votes and local updates do not close the segment');
  await until(() => evaluate("document.querySelector('.date-cards [role=radio]').getAttribute('aria-checked') === 'true'"));
  let queue = await evaluate('pollData.readLocal(fixturePoll).then(row => row.queue)');
  assert.equal(queue.length, 1, 'Click automatically queues a vote');
  assert.deepEqual(queue[0].body.changes, { '2027-01-10': 'yes' });
  await evaluate("document.querySelector('.date-cards [role=radio]').click()");
  await until(() => evaluate("document.querySelector('.date-cards [role=radio]').getAttribute('aria-checked') === 'false'"));
  queue = await evaluate('pollData.readLocal(fixturePoll).then(row => row.queue)');
  assert.equal(queue[1].body.changes['2027-01-10'], 'none', 'Click again clears the last vote');
  const resetMotion = await evaluate("recordMotion(() => { const button = [...document.querySelectorAll('button')].find(button => button.textContent === 'Van stemmer wisselen'); button.focus(); button.click(); })");
  assert.ok(resetMotion.some(frame => frame.height < 1 && frame.signedIn === 'true'), 'Old voter remains until fully closed');
  await until(() => evaluate("ballotSegment().dataset.open === 'false'"));
  await until(() => evaluate("ballotSegment().querySelector('.voter-ballot').getBoundingClientRect().height === 0"));
  assert.equal(await evaluate("document.activeElement === document.querySelector('.voter-credentials input')"), true, 'Switching voter focuses the name field');
  assert.equal((await evaluate('pollData.readLocal(fixturePoll).then(row => row.queue)')).length, 2, 'Switching preserves queued votes');
  await evaluate(`(() => {
    const inputs = document.querySelectorAll('.voter-credentials input');
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
    for (const [input, value] of [[inputs[0], 'Anna'], [inputs[1], 'wrong-password']]) {
      setter.call(input, value);
      input.dispatchEvent(new Event('input', { bubbles: true }));
    }
  })()`);
  await evaluate("document.querySelector('.voter-credentials button[type=submit]').click()");
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
  assert.equal(await evaluate("getComputedStyle(participationBody()).transitionDuration"), '0s', 'Reduced motion disables sliding');
  await evaluate(`(() => {
    const input = document.querySelector('.voter-credentials input[type=password]');
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, 'test-password');
    input.dispatchEvent(new Event('input', { bubbles: true }));
  })()`);
  await evaluate("document.querySelector('.voter-credentials button[type=submit]').click()");
  await until(() => evaluate("document.body.textContent.includes('Je aanmelding wordt gecontroleerd')"));
  const reducedLogin = await evaluate(`recordMotion(() => pollData.updateLocal(fixturePoll, row => {
    const login = row.queue.pop();
    row.ballotResults[login.operation] = {};
  }))`);
  assert.ok(reducedLogin.every(frame => frame.phase === 'idle'), 'Reduced-motion login replaces content without closing');
  assert.equal(await evaluate("ballotSegment().dataset.open"), 'true', 'Reduced-motion login still succeeds');
  const reducedView = await evaluate("recordMotion(() => document.querySelector('.date-view-actions [aria-label=Kalender]').click())");
  assert.ok(reducedView.every(frame => frame.phase === 'idle'), 'Reduced-motion view change has no cycle');
  assert.equal(await evaluate("document.querySelector('.date-view-actions [aria-label=Kalender]').getAttribute('aria-checked')"), 'true', 'Reduced-motion view selection is applied');
  const reducedReset = await evaluate("recordMotion(() => { const button = [...document.querySelectorAll('button')].find(button => button.textContent === 'Van stemmer wisselen'); button.focus(); button.click(); })");
  assert.ok(reducedReset.every(frame => frame.phase === 'idle'), 'Reduced-motion voter switch has no cycle');
  assert.equal(await evaluate("document.activeElement === document.querySelector('.voter-credentials input')"), true, 'Reduced-motion voter switch restores input focus');
  await evaluate("pollData.updateLocal(fixturePoll, row => { row.base.dates = {}; row.base.votes = {}; })");
  await until(() => evaluate("document.querySelectorAll('.collapsible-segment[data-open=false]').length === 2"));
  assert.equal(await evaluate("[...document.querySelectorAll('.collapsible-segment legend')].every(node => node.getBoundingClientRect().height > 0)"), true, 'All three headers remain visible without dates or voters');
  console.log('PASS: close/swap/open cycles, timing, focus, repeated clicks, reduced motion, mobile scrolling and automatic saves');
} finally {
  socket?.close();
  browser.kill();
  await server.close();
  await pause(500);
  await rm(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
}
