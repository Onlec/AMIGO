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
  assert.equal(await evaluate("document.body.textContent.includes('Jouw beschikbaarheid')"), false, 'Ballot hidden before login');
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
  assert.equal(await evaluate("document.body.textContent.includes('Jouw beschikbaarheid')"), false, 'Wait for server confirmation');
  await evaluate(`pollData.updateLocal(fixturePoll, row => {
    const login = row.queue.shift();
    row.base.votes[login.body.voter] = { name: login.body.name, votesJson: '{}' };
    row.ballotResults = { [login.operation]: {} };
  })`);
  await until(() => evaluate("document.body.textContent.includes('Jouw beschikbaarheid')"));
  assert.equal(await evaluate("document.body.textContent.includes('Stem opslaan')"), false, 'No save button');
  assert.equal(await evaluate("document.querySelectorAll('.date-view-actions [role=radio]')[0].getAttribute('aria-label')"), 'Kaarten');
  assert.equal(await evaluate("document.querySelector('.date-view-actions [role=radio]').innerText"), '', 'View options are icon only');
  const themeHeight = await evaluate("document.querySelector('[aria-label=Thema]').getBoundingClientRect().height");
  assert.ok(themeHeight <= 36, 'Theme toggle fits the header');
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
  await until(() => evaluate("!document.body.textContent.includes('Jouw beschikbaarheid')"));
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
  assert.equal(await evaluate("document.body.textContent.includes('Jouw beschikbaarheid')"), false, 'Rejected login cannot unlock ballot');
  assert.equal(await evaluate(`(() => {
    const row = { base: { status: 'open', dates: {}, votes: {} }, queue: [
      { kind: 'ballot', body: { voter: 'removed', changes: { '2027-01-10': 'yes' } } },
    ] };
    return Object.keys(pollData.project(row).votes).length;
  })()`), 0, 'Queued votes cannot restore a removed participant');
  console.log('PASS: login gate, server confirmation/rejection, compact toggle, icon order, automatic save, deselect and voter switching');
} finally {
  socket?.close();
  browser.kill();
  await server.close();
  await pause(500);
  await rm(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
}
