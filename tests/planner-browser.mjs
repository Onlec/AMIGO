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
    window.oldTestPoll = 'eeeeeeee-1111-4111-8111-111111111111';
    sessionStorage.setItem('amigo-voter:' + oldTestPoll, JSON.stringify({ name: 'Oude teststemmer', voter: oldTestPoll }));
    sessionStorage.setItem('amigo-ballot:' + oldTestPoll, JSON.stringify({ name: 'Oude testaanmelding' }));
    await new Promise((resolve, reject) => {
      const request = indexedDB.open('amigo-planner', 1);
      request.onupgradeneeded = () => request.result.createObjectStore('polls', { keyPath: 'id' });
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const database = request.result;
        const tx = database.transaction('polls', 'readwrite');
        tx.objectStore('polls').put({ id: oldTestPoll, base: null, notices: [],
          queue: [{ operation: crypto.randomUUID(), kind: 'createPoll', body: { title: 'Oude testprikker' } }] });
        tx.oncomplete = () => { database.close(); resolve(); };
        tx.onerror = () => { database.close(); reject(tx.error); };
      };
    });
    await pollData.updateLocal(fixturePoll, row => {
      row.base = { title: 'Browser test', description: '', status: 'open', organizer: false, organizerVoter: null,
        dates: { '2027-01-10': {date:'2027-01-10'}, '2027-04-12': {date:'2027-04-12'} }, votes: {} };
    });
  })()`);
  assert.equal(await evaluate('pollData.readLocal(oldTestPoll).then(row => row === undefined)'), true, 'Production rollout ignores the old test cache');
  assert.equal(await evaluate('pollData.pendingPolls().then(ids => ids.includes(oldTestPoll))'), false, 'Old pending test creations cannot enter the new client queue');
  assert.equal(await evaluate("import('/src/data/voterSession.js').then(data => data.readVoterSession(oldTestPoll))"), null, 'Old voter sessions do not sign users into the live rollout');
  await until(() => evaluate("document.body.textContent.includes('Jouw gegevens')"));
  await evaluate("window.ballotSegment = () => document.querySelector('.voter-availability'); window.participationBody = () => ballotSegment().querySelector('.collapsible-segment__body'); window.loginBody = () => document.querySelector('.voter-credentials').closest('.collapsible-segment').querySelector('.collapsible-segment__body')");
  await evaluate(`window.recordMotion = (action, readBody = participationBody) => new Promise(resolve => {
    const samples = [];
    const start = performance.now();
    function sample(now) {
      const body = readBody();
      const segment = body.closest('fieldset');
      const frameStyle = getComputedStyle(segment);
      samples.push({ time: now - start, phase: segment.dataset.phase, height: body.getBoundingClientRect().height,
        frameEdges: [frameStyle.borderLeftColor, frameStyle.borderRightColor, frameStyle.borderBottomColor],
        frameInk: frameStyle.borderTopColor,
        bottomGap: segment.getBoundingClientRect().bottom - body.getBoundingClientRect().bottom,
        signedIn: ballotSegment().dataset.open, view: localStorage.getItem('amigo-date-view') || 'cards',
        disabled: segment.disabled, inert: body.inert, duration: getComputedStyle(body).transitionDuration });
      if (now - start < 1000) requestAnimationFrame(sample);
      else resolve(samples);
    }
    requestAnimationFrame(sample);
    action();
  })`);
  assert.deepEqual(await evaluate("[...document.querySelectorAll('.collapsible-segment > legend')].map(node => node.textContent)"),
    ['01 — Jouw gegevens', '02 — Jouw beschikbaarheid', '03 — Stemmenoverzicht', '04 — Prikker beheren'], 'Login, voting, results and organizer controls have separate numbered segments');
  assert.equal(await evaluate("ballotSegment().dataset.open"), 'false', 'Ballot closed before login');
  assert.equal(await evaluate("document.querySelector('.unlock-form .collapsible-segment').dataset.open"), 'false', 'Organizer segment is closed before login');
  assert.equal(await evaluate("document.querySelector('.unlock-form legend').getBoundingClientRect().height > 0 && document.querySelector('.unlock-form .collapsible-segment__body').inert"), true, 'Closed organizer segment keeps its title visible and controls inaccessible');
  assert.equal(await evaluate("participationBody().getBoundingClientRect().height"), 0, 'Closed voting content takes no space');
  assert.equal(await evaluate("participationBody().inert && ballotSegment().querySelector('legend').getBoundingClientRect().height > 0"), true, 'Availability title stays visible while controls remain inaccessible before login');
  for (const mobile of [false, true]) {
    if (mobile) {
      await command('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
      await pause(700);
    }
    const layouts = await evaluate(`['.voter-credentials', '.unlock-form'].map(selector => {
      const row = document.querySelector(selector + ' .access-row') || document.querySelector(selector + ' .organizer-actions');
      const inputs = [...row.querySelectorAll('input')];
      const button = row.querySelector('button').getBoundingClientRect();
      const rects = inputs.map(input => input.getBoundingClientRect());
      if (!inputs.length) {
        const buttons = [...row.querySelectorAll('button')].map(node => node.getBoundingClientRect());
        return { fieldsLeft: true, buttonRight: true,
          alignedBottom: buttons.every(rect => Math.abs(rect.top - button.top) < 1),
          noOverflow: row.scrollWidth <= row.clientWidth };
      }
      const compactOrganizer = selector === '.unlock-form' && innerWidth <= 600;
      const buttons = [...row.querySelectorAll('button')].map(node => node.getBoundingClientRect());
      return { fieldsLeft: rects.every(rect => Math.abs(rect.left - rects[0].left) < 1),
        buttonRight: compactOrganizer ? rects.every(rect => rect.bottom < button.top) : rects.every(rect => rect.right < button.left),
        alignedBottom: compactOrganizer ? buttons.every(rect => Math.abs(rect.top - button.top) < 1) : Math.abs(rects.at(-1).bottom - button.bottom) < 1,
        noOverflow: row.scrollWidth <= row.clientWidth };
    })`);
    assert.ok(layouts.every(layout => layout.fieldsLeft && layout.buttonRight && layout.alignedBottom && layout.noOverflow),
      `Voter and organizer fields align left with room for buttons on the right (${mobile ? 'mobile' : 'desktop'})`);
  }
  await command('Emulation.clearDeviceMetricsOverride');
  await pause(700);
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
    row.loginResults = { [login.operation]: { session: { voter: login.body.voter, name: login.body.name, organizer: false } } };
  }), loginBody)`);
  await until(() => evaluate("ballotSegment().dataset.open === 'true'"));
  assert.ok(loginMotion.some(frame => frame.phase === 'closing'), 'Confirmed login closes the segment');
  assert.ok(loginMotion.some(frame => frame.height < 1), 'Login replacement waits until fully closed');
  assert.ok(loginMotion.filter(frame => frame.phase === 'closing').every(frame => frame.signedIn === 'false'), 'Login form remains during closing');
  assert.ok(loginMotion.some(frame => frame.phase === 'opening' && frame.signedIn === 'true'), 'Availability opens after the swap');
  assert.equal(loginMotion.filter((frame, index) => frame.phase === 'closing' && (index === 0 || loginMotion[index - 1].phase !== 'closing')).length, 1, 'Login result is handled once');
  assert.equal(await evaluate("document.activeElement.classList.contains('voter-ballot')"), true, 'Login restores focus to availability');
  await evaluate("pollData.updateLocal(fixturePoll, row => { row.base.organizer = true; })");
  assert.equal(await evaluate("document.querySelector('.unlock-form button[value=edit]').disabled"), true, 'Normal voter login cannot inherit stale organizer rights');
  assert.equal(await evaluate("document.querySelector('.unlock-form .collapsible-segment').dataset.open"), 'false', 'Organizer segment stays closed for a normal voter, including stale server rights');
  await evaluate("pollData.updateLocal(fixturePoll, row => { row.base.organizer = false; })");
  assert.equal(await evaluate("document.body.textContent.includes('Stem opslaan')"), false, 'No save button');
  assert.equal(await evaluate("document.querySelectorAll('.date-view-actions [role=radio]')[0].getAttribute('aria-label')"), 'Kaarten');
  assert.equal(await evaluate("document.querySelector('.date-view-actions [role=radio]').innerText"), '', 'View options are icon only');
  const themeHeight = await evaluate("document.querySelector('[aria-label=Thema]').getBoundingClientRect().height");
  assert.ok(themeHeight <= 36, 'Theme toggle fits the header');
  assert.equal(await evaluate("document.querySelector('[aria-label=Weergave]').getBoundingClientRect().height"), themeHeight, 'View and theme toggle sizes match');
  for (const side of [0, 0, 1, 1]) {
    const before = await evaluate("document.querySelector('[aria-label=Thema] [aria-checked=true]').getAttribute('aria-label')");
    await evaluate(`document.querySelectorAll('[aria-label=Thema] button')[${side}].click()`);
    const after = await evaluate("document.querySelector('[aria-label=Thema] [aria-checked=true]').getAttribute('aria-label')");
    assert.notEqual(after, before, 'Every click on either half flips the binary theme toggle');
  }
  const themeBeforePadding = await evaluate("document.querySelector('[aria-label=Thema] [aria-checked=true]').getAttribute('aria-label')");
  await evaluate("document.querySelector('[aria-label=Thema]').click()");
  assert.notEqual(await evaluate("document.querySelector('[aria-label=Thema] [aria-checked=true]').getAttribute('aria-label')"), themeBeforePadding, 'Clicking the toggle padding also flips it');
  await evaluate("document.querySelector('[aria-label=Thema]').click()");
  for (const view of ['Kalender', 'Kaarten']) {
    const previousView = view === 'Kalender' ? 'cards' : 'calendar';
    const nextView = view === 'Kalender' ? 'calendar' : 'cards';
    const frames = await evaluate(`recordMotion(() => {
      const button = document.querySelector('.date-view-actions [aria-checked=true]');
      button.focus();
      button.click();
      button.click();
    })`);
    assert.ok(frames.some(frame => frame.height < 1), 'Whole segment closes before changing views');
    const closed = frames.filter(frame => frame.phase === 'closed');
    assert.ok(closed.length >= 3 && closed.at(-1).time - closed[0].time >= 40, 'Two movements are separated by a visible full stop');
    assert.ok(closed.every(frame => frame.height === 0 && frame.view === previousView), 'Segment is fully closed before replacing content');
    assert.ok(frames.filter(frame => frame.height > 0).every(frame => frame.frameEdges.every(color => color === frame.frameInk)), 'Side and bottom borders remain visible throughout closing and opening');
    assert.ok(frames.filter(frame => frame.height > 0).every(frame => frame.bottomGap >= 0 && frame.bottomGap <= 2), 'Bottom border follows the moving content edge');
    assert.ok(closed.every(frame => frame.frameEdges.every(color => color === 'rgba(0, 0, 0, 0)')), 'Only the title line remains when fully closed');
    assert.ok(frames.filter(frame => frame.phase === 'closing').every(frame => frame.view === previousView), 'Old view is preserved while closing');
    assert.ok(frames.some(frame => frame.phase === 'opening' && frame.view === nextView), 'New view appears during opening');
    assert.ok(frames.filter(frame => frame.phase === 'closing').every(frame => frame.duration === '0.25s'), 'Closing uses 250ms');
    assert.ok(frames.filter(frame => frame.phase === 'opening').every(frame => frame.duration === '0.35s'), 'Opening uses 350ms');
    for (const phase of ['closing', 'opening']) {
      const samples = frames.filter(frame => frame.phase === phase);
      const direction = phase === 'closing' ? -1 : 1;
      assert.ok(samples.every((frame, index) => index === 0 || direction * (frame.height - samples[index - 1].height) >= -1), 'Each motion phase is smooth without reversal');
      const speeds = samples.slice(1).map((frame, index) => Math.abs(frame.height - samples[index].height) / (frame.time - samples[index].time));
      const peak = Math.max(...speeds);
      assert.ok(speeds.length >= 6 && peak > 0, 'Each movement has its own measurable velocity profile');
      assert.ok(speeds[0] < peak * 0.7 && speeds.at(-1) < peak * 0.7, `${phase} accelerates from rest and decelerates back to rest`);
    }
    assert.ok(frames.filter(frame => frame.phase !== 'idle').every(frame => frame.disabled && frame.inert), 'Interaction blocked throughout the cycle');
    assert.equal(frames.filter((frame, index) => frame.phase === 'closing' && (index === 0 || frames[index - 1].phase !== 'closing')).length, 1, 'Repeated clicks create only one cycle');
    assert.equal(await evaluate("document.activeElement.closest('[aria-label=Weergave]') !== null && document.activeElement.getAttribute('aria-checked') === 'true'"), true, 'View toggle receives focus after reopening');
    const targetHeight = await evaluate("participationBody().querySelector('.collapsible-segment__content').getBoundingClientRect().height");
    assert.ok(Math.abs(frames.at(-1).height - targetHeight) < 1, 'Reopened frame fits the new content');
  }
  await evaluate("document.querySelector('.date-view-actions [aria-label=Kalender]').click()");
  await until(() => evaluate("document.querySelector('.date-choices').dataset.view === 'calendar' && participationBody().closest('fieldset').dataset.phase === 'idle'"));
  assert.equal(await evaluate(`(() => {
    const ballot = document.querySelector('.voter-ballot');
    ballot.scrollTop = 100;
    const calendar = ballot.querySelector('.date-choices__calendar');
    return ballot.scrollTop === 0 && ballot.scrollHeight <= ballot.clientHeight + 1
      && calendar.querySelector('.calendar-grid').getBoundingClientRect().bottom <= calendar.getBoundingClientRect().bottom;
  })()`), true, 'Desktop calendar is fully displayed without internal scrolling');
  const monthMotion = await evaluate(`recordMotion(() => document.querySelector('[aria-label="Volgende maand"]').click())`);
  assert.ok(monthMotion.every(frame => frame.phase === 'idle'), 'Month navigation does not close the segment');
  await evaluate("document.querySelector('.date-view-actions [aria-label=Kaarten]').click()");
  await until(() => evaluate("document.querySelector('.date-cards') && participationBody().closest('fieldset').dataset.phase === 'idle'"));
  await evaluate("document.querySelector('.date-view-actions [aria-label=Kalender]').click(); document.querySelector('.logo').focus()");
  await until(() => evaluate("document.querySelector('.date-choices').dataset.view === 'calendar' && participationBody().closest('fieldset').dataset.phase === 'idle'"));
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
  const mobileLayout = await evaluate(`(() => {
    const body = ballotSegment().querySelector('.date-choices__cards');
    window.mobileCardsHeight = participationBody().getBoundingClientRect().height;
    body.scrollTop = 100;
    const last = body.querySelector('.date-cards > li:last-child').getBoundingClientRect();
    return { scrolling: body.scrollTop !== 0 || body.scrollHeight > body.clientHeight + 1,
      lastVisible: last.bottom <= body.getBoundingClientRect().bottom + 1,
      noHorizontalOverflow: body.scrollWidth <= body.clientWidth,
      noReferenceCalendar: document.querySelector('.date-choices__calendar') === null };
  })()`);
  assert.ok(!mobileLayout.scrolling && mobileLayout.lastVisible, 'Segment expands to contain all ten cards without internal scrolling');
  assert.ok(mobileLayout.noHorizontalOverflow, 'Mobile cards fit without horizontal scrolling');
  assert.ok(mobileLayout.noReferenceCalendar, 'Cards do not reserve an invisible fixed calendar height');
  await evaluate("document.querySelector('.date-view-actions [aria-label=Kalender]').click()");
  await until(() => evaluate("document.querySelector('.date-choices').dataset.view === 'calendar' && participationBody().closest('fieldset').dataset.phase === 'idle'"));
  assert.equal(await evaluate(`(() => {
    const ballot = ballotSegment().querySelector('.voter-ballot');
    ballot.scrollTop = 100;
    const reference = ballot.querySelector('.date-choices__calendar');
    return ballot.scrollTop === 0 && ballot.scrollHeight <= ballot.clientHeight + 1
      && reference.querySelector('.calendar-grid').getBoundingClientRect().bottom <= reference.getBoundingClientRect().bottom
      && participationBody().getBoundingClientRect().height < mobileCardsHeight
      && ballot.querySelector('.date-choices__cards') === null;
  })()`), true, 'Calendar uses its own content height instead of the larger ten-card height');
  for (const viewport of [{ width: 390, height: 420 }, { width: 844, height: 390 }, { width: 320, height: 568 }]) {
    await command('Emulation.setDeviceMetricsOverride', { ...viewport, deviceScaleFactor: 1, mobile: true });
    await until(() => evaluate("Math.abs(participationBody().getBoundingClientRect().height - participationBody().querySelector('.collapsible-segment__content').getBoundingClientRect().height) < 1"));
    assert.equal(await evaluate(`(() => {
      const ballot = document.querySelector('.voter-ballot');
      const calendar = ballot.querySelector('.date-choices__calendar');
      ballot.scrollTop = 100;
      return ballot.scrollTop === 0 && ballot.scrollHeight <= ballot.clientHeight + 1
        && calendar.scrollHeight <= calendar.clientHeight + 1
        && calendar.querySelector('.calendar-grid').getBoundingClientRect().bottom <= calendar.getBoundingClientRect().bottom;
    })()`), true, `Full calendar has no internal scroll at ${viewport.width}x${viewport.height}`);
  }
  await command('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  await until(() => evaluate("Math.abs(participationBody().getBoundingClientRect().height - participationBody().querySelector('.collapsible-segment__content').getBoundingClientRect().height) < 1"));
  const calendarBeforeCompletion = await evaluate('participationBody().getBoundingClientRect().height');
  await evaluate(`pollData.updateLocal(fixturePoll, row => {
    const voter = Object.values(row.base.votes)[0];
    voter.votesJson = JSON.stringify(Object.fromEntries(Object.keys(row.base.dates).map(day => [day, 'yes'])));
  })`);
  await until(() => evaluate("document.querySelector('[aria-label=\"Ga naar de eerste onbeantwoorde datum\"]') === null"));
  await pause(700);
  assert.ok(await evaluate('participationBody().getBoundingClientRect().height') < calendarBeforeCompletion, 'Segment shrinks naturally when the unanswered-date action disappears');
  await evaluate("pollData.updateLocal(fixturePoll, row => { Object.values(row.base.votes)[0].votesJson = '{}'; })");
  await until(() => evaluate("document.querySelector('[aria-label=\"Ga naar de eerste onbeantwoorde datum\"]') !== null"));
  await evaluate("document.querySelector('.date-view-actions [aria-label=Kaarten]').click()");
  await until(() => evaluate("document.querySelector('.date-cards') && participationBody().closest('fieldset').dataset.phase === 'idle'"));
  assert.equal(await evaluate("document.querySelector('.date-choices__cards').scrollTop"), 0, 'Returning to cards starts at the top');
  await evaluate("pollData.updateLocal(fixturePoll, row => { row.base.dates = originalDates; })");
  await command('Emulation.clearDeviceMetricsOverride');
  await until(() => evaluate("document.querySelectorAll('.date-cards > li').length === 2"));
  await until(() => evaluate("Math.abs(participationBody().getBoundingClientRect().height - participationBody().querySelector('.collapsible-segment__content').getBoundingClientRect().height) < 1"));
  const wheelPoint = await evaluate(`(() => {
    const card = document.querySelector('.date-cards > li');
    card.scrollIntoView({ block: 'center', behavior: 'instant' });
    const rect = card.getBoundingClientRect();
    return { x: rect.left + 10, y: rect.top + rect.height / 2, start: scrollY };
  })()`);
  await command('Input.dispatchMouseEvent', { type: 'mouseMoved', x: wheelPoint.x, y: wheelPoint.y });
  await command('Input.dispatchMouseEvent', { type: 'mouseWheel', x: wheelPoint.x, y: wheelPoint.y, deltaX: 0, deltaY: 250 });
  await until(() => evaluate(`scrollY > ${wheelPoint.start} + 20`));
  assert.equal(await evaluate("document.querySelector('.date-choices__cards').scrollTop"), 0, 'Wheel scrolls the page rather than being captured by cards');
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
  const resetMotion = await evaluate("recordMotion(() => { const button = [...document.querySelectorAll('button')].find(button => button.textContent === 'Afmelden'); button.focus(); button.click(); }, loginBody)");
  assert.ok(resetMotion.some(frame => frame.height < 1 && frame.signedIn === 'true'), 'Old voter remains until fully closed');
  await until(() => evaluate("ballotSegment().dataset.open === 'false'"));
  await until(() => evaluate("participationBody().getBoundingClientRect().height === 0"));
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
    row.loginResults[login.operation] = { rejection: 'Wachtwoord klopt niet.' };
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
    row.loginResults[login.operation] = { session: { voter: login.body.voter, name: login.body.name, organizer: false } };
  }))`);
  assert.ok(reducedLogin.every(frame => frame.phase === 'idle'), 'Reduced-motion login replaces content without closing');
  assert.equal(await evaluate("ballotSegment().dataset.open"), 'true', 'Reduced-motion login still succeeds');
  const reducedView = await evaluate("recordMotion(() => document.querySelector('.date-view-actions [aria-label=Kalender]').click())");
  assert.ok(reducedView.every(frame => frame.phase === 'idle'), 'Reduced-motion view change has no cycle');
  assert.equal(await evaluate("document.querySelector('.date-view-actions [aria-label=Kalender]').getAttribute('aria-checked')"), 'true', 'Reduced-motion view selection is applied');
  const reducedReset = await evaluate("recordMotion(() => { const button = [...document.querySelectorAll('button')].find(button => button.textContent === 'Afmelden'); button.focus(); button.click(); })");
  assert.ok(reducedReset.every(frame => frame.phase === 'idle'), 'Reduced-motion voter switch has no cycle');
  assert.equal(await evaluate("document.activeElement === document.querySelector('.voter-credentials input')"), true, 'Reduced-motion voter switch restores input focus');
  assert.equal(await evaluate("document.querySelector('.unlock-form input') === null"), true, 'Organizer segment has no separate password field');
  assert.equal(await evaluate("document.querySelector('.unlock-form button').disabled"), true, 'Logged-out users cannot manage the poll');
  await evaluate("pollData.updateLocal(fixturePoll, row => { row.base.organizer = true; })");
  assert.equal(await evaluate("document.querySelector('.unlock-form button').disabled"), true, 'A cached browser grant cannot replace a verified organizer login');
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
  await evaluate(`pollData.updateLocal(fixturePoll, row => {
    const login = row.queue.pop();
    row.base.organizerVoter = login.body.voter;
    row.loginResults[login.operation] = { session: { voter: login.body.voter, name: login.body.name, organizer: true } };
  })`);
  await until(() => evaluate("document.querySelector('.unlock-form button').disabled === false"));
  assert.equal(await evaluate("document.querySelector('.unlock-form button').disabled"), false, 'Authorized organizer can edit without reentering a password');
  assert.equal(await evaluate("document.querySelector('.unlock-form .collapsible-segment').dataset.open"), 'true', 'Verified organizer login opens segment four');
  await evaluate("document.querySelector('.unlock-form button').click()");
  await until(() => evaluate("document.querySelector('.organizer-panel h2')?.textContent === 'Prikker bewerken'"));
  assert.equal(await evaluate("document.querySelector('.organizer-panel').closest('.unlock-form') !== null"), true, 'Editing stays inside the organizer segment');
  assert.ok(await evaluate("document.querySelectorAll('.vote-grid button[aria-label^=Verwijder]').length > 0"), 'Removing participants is available in edit mode');
  assert.equal(await evaluate("[...document.querySelectorAll('.organizer-panel button')].some(button => button.textContent === 'Einddatum kiezen')"), false, 'Date confirmation is independent from the edit form');
  assert.equal(await evaluate("document.querySelector('form form') === null"), true, 'Organizer editor does not nest forms');
  assert.equal(await evaluate("loginBody().closest('fieldset').dataset.open"), 'true', 'Editing does not collapse or reset the voter login segment');
  assert.equal(await evaluate("document.querySelector('.unlock-form input[type=password]') === null"), true, 'Password is absent during editing');
  await evaluate("[...document.querySelectorAll('.organizer-panel button')].find(button => button.textContent === 'Annuleren').click()");
  await until(() => evaluate("document.querySelector('.organizer-panel') === null"));
  assert.equal(await evaluate("document.activeElement === document.querySelector('.unlock-form button')"), true, 'Cancel returns focus to the organizer edit button');
  assert.equal(await evaluate("document.querySelector('.unlock-form input[type=password]') === null"), true, 'Organizer stays recognized after leaving edit mode');
  const voterSessionBeforeEdit = await evaluate("sessionStorage.getItem('amigo-planner-live-v1:voter:' + fixturePoll)");
  await evaluate("document.querySelector('.unlock-form button').click()");
  await until(() => evaluate("document.querySelector('.organizer-panel') !== null"));
  assert.equal(await evaluate("ballotSegment().dataset.open"), 'true', 'Organizer editing preserves the active voter');
  const queueBeforeEditVote = await evaluate("pollData.readLocal(fixturePoll).then(row => row.queue.length)");
  assert.equal(await evaluate("document.querySelector('.voter-ballot .calendar-day-button--vote').disabled"), true, 'Own calendar votes are read-only while editing');
  await evaluate("document.querySelector('.voter-ballot .calendar-day-button--vote').click()");
  await evaluate("document.querySelector('.voter-ballot [aria-label=Kaarten]').click()");
  await until(() => evaluate("document.querySelector('.voter-ballot .date-cards') !== null"));
  assert.equal(await evaluate("[...document.querySelectorAll('.voter-ballot .date-cards [role=radio]')].every(button => button.disabled)"), true, 'Own card votes are also read-only while editing');
  await evaluate("document.querySelector('.voter-ballot .date-cards [role=radio]').click()");
  assert.equal(await evaluate("pollData.readLocal(fixturePoll).then(row => row.queue.length)"), queueBeforeEditVote, 'Editing cannot queue an own vote change');
  await evaluate("document.querySelector('.voter-ballot [aria-label=Kalender]').click()");
  await until(() => evaluate("document.querySelector('.voter-ballot .calendar') !== null"));
  await evaluate("[...document.querySelectorAll('.organizer-panel button')].find(button => button.textContent === 'Annuleren').click()");
  await until(() => evaluate("document.querySelector('.organizer-panel') === null"));
  assert.equal(await evaluate("sessionStorage.getItem('amigo-planner-live-v1:voter:' + fixturePoll)"), voterSessionBeforeEdit, 'Cancel keeps the voter session');
  assert.equal(await evaluate("document.querySelector('.voter-ballot .calendar-day-button--vote').disabled"), false, 'Leaving edit mode restores normal voting');
  assert.equal(await evaluate("ballotSegment().dataset.open"), 'true', 'Cancel leaves availability open instead of showing voter login fields');
  assert.equal(await evaluate("document.querySelector('.voter-credentials input')"), null, 'Logged-in voter fields stay hidden');
  assert.equal(await evaluate("document.activeElement === document.querySelector('.unlock-form button')"), true, 'Cancel stays at the organizer segment while signed in');
  assert.equal(await evaluate("document.querySelector('.unlock-form button[value=final]').disabled"), false, 'Final-date selection is directly available to the organizer');
  await evaluate("document.querySelector('.unlock-form button[value=final]').click()");
  await until(() => evaluate("document.querySelector('.organizer-panel h2')?.textContent === 'Einddatum kiezen'"));
  assert.equal(await evaluate("document.querySelectorAll('.vote-grid button').length"), 0, 'Final-date selection cannot remove any participant');
  assert.equal(await evaluate("document.querySelector('.vote-grid .my-row') !== null"), true, 'Regression covers the organizer voting as their own participant');
  const queueBeforeFinalVote = await evaluate("pollData.readLocal(fixturePoll).then(row => row.queue.length)");
  assert.equal(await evaluate("[...document.querySelectorAll('.voter-ballot .calendar-day-button--vote')].every(button => button.disabled)"), true, 'Own calendar votes are read-only during final-date selection');
  await evaluate("document.querySelector('.voter-ballot .calendar-day-button--vote').click()");
  assert.equal(await evaluate("pollData.readLocal(fixturePoll).then(row => row.queue.length)"), queueBeforeFinalVote, 'Clicking own vote cannot queue a change while choosing a final date');
  await evaluate("document.querySelector('.voter-ballot [aria-label=Kaarten]').click()");
  await until(() => evaluate("document.querySelector('.voter-ballot .date-cards') !== null"));
  assert.equal(await evaluate("[...document.querySelectorAll('.voter-ballot .date-cards [role=radio]')].every(button => button.disabled)"), true, 'Own card votes are also read-only during final-date selection');
  await evaluate("document.querySelector('.voter-ballot .date-cards [role=radio]').click()");
  assert.equal(await evaluate("pollData.readLocal(fixturePoll).then(row => row.queue.length)"), queueBeforeFinalVote, 'Readonly card controls cannot clear an answer');
  assert.equal(await evaluate("document.querySelector('.organizer-panel').closest('.unlock-form') !== null"), true, 'Final-date selection also stays in the organizer segment');
  assert.equal(await evaluate("document.querySelector('.voter-ballot [aria-label=\"Sorteer kaarten\"]') === null"), true, 'Sorting is limited to organizer final-date selection');
  await evaluate("pollData.updateLocal(fixturePoll, row => { for (let n = 0; n < 5; n++) row.base.votes['sort-' + n] = { name: 'Sort ' + n, votesJson: '{\"2027-04-12\":\"yes\"}' }; })");
  assert.deepEqual(await evaluate("[...document.querySelectorAll('.organizer-panel .date-cards > li')].map(card => card.dataset.day)"), ['2027-01-10', '2027-04-12'], 'Cards initially show earliest date first');
  await evaluate("document.querySelector('.organizer-panel .date-cards button').click()");
  await evaluate("[...document.querySelectorAll('.organizer-panel [aria-label=\"Sorteer kaarten\"] button')].find(button => button.textContent === 'Datum').click()");
  await until(() => evaluate("document.querySelector('.organizer-panel .date-cards > li').dataset.day === '2027-04-12'"));
  assert.equal(await evaluate("document.querySelector('.organizer-panel .date-cards button[aria-pressed=true]').closest('li').dataset.day"), '2027-01-10', 'Sorting preserves the chosen date');
  for (const mobile of [false, true]) {
    if (mobile) await command('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
    await pause(700);
    assert.equal(await evaluate(`(() => {
      const panel = document.querySelector('.organizer-panel');
      const cards = [...panel.querySelectorAll('.date-cards > li')];
      const aligned = cards.every(card => {
        const date = card.querySelector('strong').getBoundingClientRect();
        const button = card.querySelector('button').getBoundingClientRect();
        return Math.abs((date.top + date.bottom - button.top - button.bottom) / 2) < 2 && date.right < button.left;
      });
      return aligned && panel.querySelector('.edit-actions').getBoundingClientRect().top - cards.at(-1).getBoundingClientRect().bottom >= 12;
    })()`), true, 'Date buttons align beside dates and footer clears last card on desktop and mobile');
  }
  await command('Emulation.clearDeviceMetricsOverride');
  await evaluate("[...document.querySelectorAll('.organizer-panel [aria-label=\"Sorteer kaarten\"] button')].find(button => button.textContent === 'Meeste ja').click()");
  await until(() => evaluate("document.querySelector('.organizer-panel .date-cards > li').dataset.day === '2027-01-10'"));
  await evaluate("pollData.updateLocal(fixturePoll, row => { for (let n = 0; n < 5; n++) delete row.base.votes['sort-' + n]; })");
  await evaluate("[...document.querySelectorAll('.organizer-panel button')].find(button => button.textContent === 'Annuleren').click()");
  await until(() => evaluate("document.querySelector('.organizer-panel') === null"));
  assert.equal(await evaluate("document.activeElement === document.querySelector('.unlock-form button[value=final]')"), true, 'Cancelling final-date selection returns to its own button');
  assert.equal(await evaluate("sessionStorage.getItem('amigo-planner-live-v1:voter:' + fixturePoll)"), voterSessionBeforeEdit, 'Final-date selection preserves the voter session');
  assert.equal(await evaluate("document.querySelector('.voter-ballot .date-cards [role=radio]').disabled"), false, 'Cancelling final-date selection restores normal voting');
  await evaluate("pollData.updateLocal(fixturePoll, row => { row.base.status = 'closed'; row.base.finalDateId = '2027-01-10'; })");
  await until(() => evaluate("document.querySelector('.unlock-form button[value=final]')?.textContent === 'Einddatum wijzigen'"));
  assert.equal(await evaluate("document.querySelector('.unlock-form button[value=edit]').disabled"), false, 'Closed polls remain editable and allow replacing the final date');
  await evaluate("document.querySelector('.unlock-form button[value=edit]').click()");
  await until(() => evaluate("document.querySelector('.organizer-panel textarea') !== null"));
  assert.equal(await evaluate("[...document.querySelectorAll('.organizer-panel .calendar button')].every(button => button.matches(':disabled'))"), true, 'All date controls are locked after final-date confirmation');
  assert.equal(await evaluate("document.querySelector('.organizer-panel input').matches(':disabled') || document.querySelector('.organizer-panel textarea').matches(':disabled')"), false, 'Title and description remain editable');
  await evaluate(`(() => {
    const input = document.querySelector('.organizer-panel textarea');
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set.call(input, 'Aangepaste omschrijving');
    input.dispatchEvent(new Event('input', { bubbles: true }));
  })()`);
  await evaluate("document.querySelector('.organizer-panel button[type=submit]').click()");
  await until(() => evaluate("document.querySelector('.organizer-panel') === null"));
  const metadataEdit = await evaluate('pollData.readLocal(fixturePoll).then(row => row.queue.at(-1))');
  assert.equal(metadataEdit.kind, 'edit');
  assert.equal(metadataEdit.body.description, 'Aangepaste omschrijving');
  assert.deepEqual(metadataEdit.body.added, []);
  assert.deepEqual(metadataEdit.body.removed, []);
  await evaluate("Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async text => { window.copiedFinalOverview = text; } } })");
  assert.equal(await evaluate("document.querySelector('.final-date-block .copy-button') === null"), true, 'Chosen-date banner has no share button');
  assert.equal(await evaluate("(() => { const banner = document.querySelector('.final-date-block').getBoundingClientRect(); const date = document.querySelector('.final-date').getBoundingClientRect(); return Math.abs(date.left + date.width / 2 - banner.left - banner.width / 2) < 1; })()"), true, 'Chosen date is centered');
  await evaluate("document.querySelector('.poll-results-actions .copy-button').click()");
  await until(() => evaluate("document.querySelector('.poll-results-actions .copy-button').getAttribute('aria-label') === 'Gekopieerd ✓'"));
  const finalOverview = await evaluate('window.copiedFinalOverview');
  assert.ok(finalOverview.startsWith('📅 Browser test ('), 'Final share includes the poll title and voting progress');
  assert.ok(finalOverview.includes('✅ gekozen') && finalOverview.includes('👥') && finalOverview.includes('Anna'), 'Final share includes the chosen date and participants');
  assert.ok(finalOverview.includes('👉 Bekijk de einddatum: ') && !finalOverview.includes('👉 Stem mee:'), 'Closed poll invites readers to view the result');
  await until(() => evaluate("document.querySelector('.poll-results-actions .copy-button').getAttribute('aria-label') === 'Stemmenoverzicht delen'"));
  const votesBeforeDateChange = await evaluate('pollData.readLocal(fixturePoll).then(row => JSON.stringify(pollData.project(row).votes))');
  await command('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'no-preference' }] });
  for (const confirm of [false, true]) {
    await evaluate("document.querySelector('.unlock-form button[value=final]').click()");
    await until(() => evaluate("document.querySelector('.organizer-panel h2')?.textContent === 'Einddatum wijzigen'"));
    assert.equal(await evaluate("document.querySelector('.organizer-panel [data-day=\"2027-01-10\"] button').getAttribute('aria-pressed')"), 'true', 'Existing final date is preselected');
    await evaluate("document.querySelector('.organizer-panel [data-day=\"2027-04-12\"] button').click()");
    assert.equal(await evaluate('pollData.readLocal(fixturePoll).then(row => pollData.project(row).finalDateId)'), '2027-01-10', 'Selecting a replacement keeps the current date until confirmation');
    if (confirm) {
      const sequence = await evaluate(`new Promise(resolve => {
        window.scrollTo(0, document.documentElement.scrollHeight);
        const samples = [], start = performance.now();
        function sample(now) {
          samples.push({ banner: Boolean(document.querySelector('.final-date')), confetti: Boolean(document.querySelector('.poll-confetti')),
            moving: [...document.querySelectorAll('.collapsible-segment__body')].some(node => node.getAnimations().some(animation => animation.playState === 'running')) });
          if (now - start < 1500) requestAnimationFrame(sample); else resolve(samples);
        }
        requestAnimationFrame(sample);
        [...document.querySelectorAll('.organizer-panel button')].find(button => button.textContent === 'Bevestig deze datum').click();
      })`);
      assert.ok(sequence.some(sample => !sample.banner && sample.moving), 'Final date stays hidden while segments finish closing');
      assert.ok(sequence.some(sample => sample.banner && sample.confetti), 'Organizer confirmation reveals the date and starts confetti');
      assert.equal(sequence.some(sample => sample.confetti && sample.moving), false, 'Confetti waits for every segment height transition');
      assert.equal(await evaluate("(() => { const date = document.querySelector('.final-date'); const rect = date.getBoundingClientRect(); return rect.top >= 0 && rect.bottom <= innerHeight && document.activeElement === date; })()"), true, 'Confirmation brings the chosen date into view and focuses it');
    } else {
      await evaluate("[...document.querySelectorAll('.organizer-panel button')].find(button => button.textContent === 'Annuleren').click()");
    }
    await until(() => evaluate("document.querySelector('.organizer-panel') === null"));
    assert.equal(await evaluate('pollData.readLocal(fixturePoll).then(row => pollData.project(row).finalDateId)'), confirm ? '2027-04-12' : '2027-01-10', 'Only confirming changes the final date');
  }
  await command('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
  assert.equal(await evaluate('pollData.readLocal(fixturePoll).then(row => pollData.project(row).status)'), 'closed', 'Changing the final date never reopens voting');
  assert.equal(await evaluate('pollData.readLocal(fixturePoll).then(row => JSON.stringify(pollData.project(row).votes))'), votesBeforeDateChange, 'Changing the final date preserves every vote');
  assert.equal(await evaluate("document.querySelector('.vote-grid .chosen-column') !== null"), true, 'Overview highlights the replacement date');
  await evaluate("document.querySelector('.unlock-form button[value=reopen]').click()");
  await until(() => evaluate("document.querySelector('.final-date') === null && document.querySelector('.voter-availability').dataset.open === 'true'"));
  assert.equal(await evaluate('pollData.readLocal(fixturePoll).then(row => pollData.project(row).finalDateId)'), null, 'Reopening removes the chosen date');
  assert.equal(await evaluate('pollData.readLocal(fixturePoll).then(row => JSON.stringify(pollData.project(row).votes))'), votesBeforeDateChange, 'Reopening preserves all votes');
  assert.equal(await evaluate("document.querySelector('.unlock-form button[value=final]').textContent"), 'Einddatum kiezen', 'Reopened poll offers a fresh final-date choice');
  assert.equal(await evaluate("document.querySelector('.unlock-form button[value=reopen]') === null && document.querySelector('.vote-grid .chosen-column') === null"), true, 'Reopened poll removes final-date actions and highlights');
  const beforeReopenedVote = await evaluate('pollData.readLocal(fixturePoll).then(row => row.queue.length)');
  await evaluate("document.querySelector('.unlock-form button[value=edit]').click()");
  await until(() => evaluate("document.querySelector('.organizer-panel .calendar') !== null"));
  assert.equal(await evaluate("document.querySelector('.organizer-panel .calendar-day-button').matches(':disabled')"), false, 'Reopening unlocks date editing again');
  await evaluate("[...document.querySelectorAll('.organizer-panel button')].find(button => button.textContent === 'Annuleren').click()");
  await until(() => evaluate("document.querySelector('.organizer-panel') === null"));
  await evaluate("document.querySelector('.voter-ballot .date-cards [role=radio]:not(:disabled)').click()");
  await until(() => evaluate(`pollData.readLocal(fixturePoll).then(row => row.queue.length === ${beforeReopenedVote + 1} && row.queue.at(-1).kind === 'ballot')`));
  await evaluate("pollData.enqueue(fixturePoll, 'close', { day: '2027-04-12' })");
  await until(() => evaluate("document.querySelector('.final-date') !== null"));
  assert.equal(await evaluate("document.querySelector('.final-date--reveal') === null && document.querySelector('.poll-confetti') === null"), true, 'A later external confirmation does not replay the previous local celebration');
  await evaluate("pollData.updateLocal(fixturePoll, row => { row.base = pollData.project(row); row.queue = []; })");
  await evaluate("pollData.updateLocal(fixturePoll, row => { row.base.organizer = false; })");
  await until(() => evaluate("document.querySelector('.unlock-form button[value=edit]').disabled"));
  await evaluate("pollData.updateLocal(fixturePoll, row => { row.base.dates = {}; row.base.votes = {}; })");
  await until(() => evaluate("document.querySelectorAll('.collapsible-segment[data-open=false]').length === 3"));
  assert.equal(await evaluate("[...document.querySelectorAll('.collapsible-segment legend')].every(node => node.getBoundingClientRect().height > 0)"), true, 'All four headers remain visible without dates or voters');
  for (const action of ['edit', 'final']) {
    await evaluate(`(async () => {
      const data = await import('/src/data/polls.js');
      sessionStorage.setItem('amigo-planner-live-v1:voter:' + ${JSON.stringify(poll)}, ${JSON.stringify(voterSessionBeforeEdit)});
      await data.updateLocal(${JSON.stringify(poll)}, row => {
        row.base.status = 'open';
        row.base.finalDateId = null;
        row.base.organizer = true;
        row.base.dates = { '2027-01-10': { date: '2027-01-10' }, '2027-04-12': { date: '2027-04-12' } };
        row.base.votes = { [${JSON.stringify(JSON.parse(voterSessionBeforeEdit).voter)}]: { name: 'Anna', votesJson: '{}' } };
        row.queue = row.queue.filter(command => command.kind !== 'lockOrganizer');
      });
    })()`);
    await command('Page.reload');
    await until(() => evaluate("document.querySelector('.voter-availability')?.dataset.open === 'true'"));
    await evaluate(`(async () => { window.fixturePoll = ${JSON.stringify(poll)}; window.pollData = await import('/src/data/polls.js'); })()`);
    const votesBeforeLogout = await evaluate('pollData.readLocal(fixturePoll).then(row => JSON.stringify(pollData.project(row).votes))');
    await evaluate(`document.querySelector('.unlock-form button[value=${action}]').click()`);
    await until(() => evaluate("document.querySelector('.organizer-panel') !== null"));
    await evaluate("[...document.querySelectorAll('.voter-credentials button')].find(button => button.textContent === 'Afmelden').click()");
    await until(() => evaluate("document.querySelector('.voter-availability').dataset.open === 'false' && document.querySelector('.organizer-panel') === null && document.querySelector('.unlock-form button[value=edit]').disabled"));
    assert.equal(await evaluate("sessionStorage.getItem('amigo-planner-live-v1:voter:' + fixturePoll)"), null, 'Switching voters clears the voter session');
    assert.equal(await evaluate("document.querySelector('.unlock-form input') === null"), true, 'Organizer access only uses the main login form');
    assert.equal(await evaluate("document.querySelector('.unlock-form button[value=edit]').disabled"), true, 'Organizer controls are locked immediately');
    assert.equal(await evaluate("document.querySelector('.unlock-form .collapsible-segment').dataset.open"), 'false', 'Signing out closes the organizer segment');
    assert.equal(await evaluate("pollData.readLocal(fixturePoll).then(row => row.queue.filter(command => command.kind === 'lockOrganizer').length)"), 1, `Switching from ${action} queues one persistent organizer logout`);
    assert.equal(await evaluate('pollData.readLocal(fixturePoll).then(row => JSON.stringify(pollData.project(row).votes))'), votesBeforeLogout, 'Logout preserves all votes');
    await evaluate("pollData.updateLocal(fixturePoll, row => { row.base.organizer = true; })");
    assert.equal(await evaluate("pollData.readLocal(fixturePoll).then(row => pollData.project(row).organizer)"), false, 'Pending logout masks a stale server grant');
    await command('Page.reload');
    await until(() => evaluate("document.querySelector('.unlock-form button[value=edit]')?.disabled"));
    assert.equal(await evaluate("document.querySelector('.organizer-panel') === null"), true, 'Reload cannot reopen organizer screens');
    assert.equal(await evaluate("document.querySelector('.unlock-form button[value=edit]').disabled"), true, 'Organizer stays signed out after reloading with logout pending');
  }
  const ownerOnlyPoll = 'bbbbbbbb-1111-4111-8111-111111111111';
  await evaluate(`(async () => {
    const data = await import('/src/data/polls.js');
    await data.updateLocal(${JSON.stringify(ownerOnlyPoll)}, row => {
      row.base = { title: 'Niet meestemmen', description: '', organizer: false, status: 'open',
        dates: { '2027-01-10': { date: '2027-01-10' }, '2027-04-12': { date: '2027-04-12' } }, votes: {} };
    });
  })()`);
  await command('Page.navigate', { url: `${origin}?poll=${ownerOnlyPoll}` });
  await until(() => evaluate("document.querySelector('.voter-credentials input') !== null"));
  await evaluate(`(async () => { window.fixturePoll = ${JSON.stringify(ownerOnlyPoll)}; window.pollData = await import('/src/data/polls.js'); })()`);
  for (const closed of [false, true]) {
    await evaluate(`(() => {
      const inputs = document.querySelectorAll('.voter-credentials input');
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
      for (const [input, value] of [[inputs[0], 'Maker'], [inputs[1], 'test-password']]) {
        setter.call(input, value); input.dispatchEvent(new Event('input', { bubbles: true }));
      }
    })()`);
    await evaluate("document.querySelector('.voter-credentials button[type=submit]').click()");
    await until(() => evaluate("document.body.textContent.includes('Je aanmelding wordt gecontroleerd')"));
    await evaluate(`pollData.updateLocal(fixturePoll, row => {
      const login = row.queue.pop();
      if (login.kind !== 'signIn') throw new Error('Expected unified sign-in');
      row.base.organizer = true;
      (row.loginResults ??= {})[login.operation] = { session: { name: 'Maker', voter: null, organizer: true } };
    })`);
    await until(() => evaluate("document.querySelector('.unlock-form button[value=edit]').disabled === false"));
    assert.equal(await evaluate("document.querySelector('.voter-availability').dataset.open"), 'false', 'Organizer who opted out of voting gets no ballot');
    assert.equal(await evaluate("pollData.readLocal(fixturePoll).then(row => Object.keys(row.base.votes).length)"), 0, 'Organizer sign-in creates no unwanted voter');
    assert.equal(await evaluate("document.querySelector('.unlock-form input') === null"), true, 'Management never introduces a second password field');
    await evaluate("[...document.querySelectorAll('.voter-credentials button')].find(button => button.textContent === 'Afmelden').click()");
    await until(() => evaluate("document.querySelector('.voter-credentials input') !== null && document.querySelector('.unlock-form button[value=edit]').disabled"));
    if (!closed) {
      await evaluate("pollData.updateLocal(fixturePoll, row => { row.queue = row.queue.filter(command => command.kind !== 'lockOrganizer'); row.base.organizer = false; row.base.status = 'closed'; row.base.finalDateId = '2027-01-10'; })");
    }
  }
  await evaluate(`(async () => {
    sessionStorage.setItem('amigo-planner-live-v1:voter:' + fixturePoll, JSON.stringify({ name: 'Maker', voter: null, organizer: true }));
    await pollData.updateLocal(fixturePoll, row => {
      row.queue = []; row.base.status = 'open'; row.base.finalDateId = null;
      row.base.organizer = true; row.base.organizerVoter = null;
      row.base.votes = { other: { name: 'Andere deelnemer', votesJson: '{"2027-01-10":"no"}' } };
    });
  })()`);
  await command('Page.reload');
  await until(() => evaluate("document.querySelector('.unlock-form button[value=edit]')?.disabled === false"));
  await evaluate(`(async () => { window.fixturePoll = ${JSON.stringify(ownerOnlyPoll)}; window.pollData = await import('/src/data/polls.js'); })()`);
  await evaluate("document.querySelector('.unlock-form button[value=edit]').click()");
  await until(() => evaluate("document.querySelector('.organizer-panel .participation-choice input') !== null"));
  assert.equal(await evaluate("document.querySelector('.organizer-panel .participation-choice input').checked"), false, 'Opted-out organizer can enable participation in edit');
  await evaluate("document.querySelector('.organizer-panel .participation-choice input').click()");
  await evaluate("[...document.querySelectorAll('.organizer-panel button')].find(button => button.textContent === 'Annuleren').click()");
  await until(() => evaluate("document.querySelector('.organizer-panel') === null"));
  assert.equal(await evaluate('pollData.readLocal(fixturePoll).then(row => row.queue.length)'), 0, 'Cancelling leaves participation unchanged');
  for (const enabled of [true, false, true]) {
    await evaluate("document.querySelector('.unlock-form button[value=edit]').click()");
    await until(() => evaluate("document.querySelector('.organizer-panel .participation-choice input') !== null"));
    await evaluate("document.querySelector('.organizer-panel .participation-choice input').click()");
    await evaluate("document.querySelector('.organizer-panel button[type=submit]').click()");
    await until(() => evaluate(`document.querySelector('.organizer-panel') === null && document.querySelector('.voter-availability').dataset.open === '${enabled}'`));
    const snapshot = await evaluate('pollData.readLocal(fixturePoll).then(row => pollData.project(row))');
    assert.equal(snapshot.organizer, true, 'Changing participation preserves organizer access');
    assert.equal(snapshot.votes.other.votesJson, '{"2027-01-10":"no"}', 'Other participants and votes remain unchanged');
    const identity = await evaluate("JSON.parse(sessionStorage.getItem('amigo-planner-live-v1:voter:' + fixturePoll))");
    assert.equal(identity.organizer, true);
    if (enabled) {
      assert.equal(identity.voter, snapshot.organizerVoter, 'Participation activates the own ballot');
      assert.equal(snapshot.votes[identity.voter].votesJson, '{}', 'New or renewed participation starts with no answers');
      await evaluate("pollData.enqueue(fixturePoll, 'ballot', { voter: JSON.parse(sessionStorage.getItem('amigo-planner-live-v1:voter:' + fixturePoll)).voter, changes: { '2027-01-10': 'yes' } })");
      await until(() => evaluate("pollData.readLocal(fixturePoll).then(row => Object.values(pollData.project(row).votes).some(v => v.name === 'Maker' && JSON.parse(v.votesJson)['2027-01-10'] === 'yes'))"));
    } else {
      assert.equal(identity.voter, null, 'Opting out clears the active ballot without signing out');
      assert.equal(Object.keys(snapshot.votes).length, 1, 'Opting out removes the organizer participant and all own answers');
    }
  }
  await evaluate(`(async () => {
    await pollData.updateLocal(fixturePoll, row => { row.base = pollData.project(row); row.queue = []; });
    sessionStorage.removeItem('amigo-planner-live-v1:voter:' + fixturePoll);
  })()`);
  await command('Page.reload');
  await until(() => evaluate("document.querySelector('.voter-credentials input') !== null"));
  await evaluate(`(async () => { window.fixturePoll = ${JSON.stringify(ownerOnlyPoll)}; window.pollData = await import('/src/data/polls.js'); })()`);
  await evaluate(`(() => {
    const inputs = document.querySelectorAll('.voter-credentials input');
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
    setter.call(inputs[0], 'Maker'); inputs[0].dispatchEvent(new Event('input', { bubbles: true }));
  })()`);
  await evaluate(`(() => {
    const input = document.querySelector('.voter-credentials input[type=password]');
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, 'test-password');
    input.dispatchEvent(new Event('input', { bubbles: true }));
  })()`);
  await evaluate("document.querySelector('.voter-credentials button[type=submit]').click()");
  await until(() => evaluate("document.body.textContent.includes('Je aanmelding wordt gecontroleerd')"));
  await evaluate(`pollData.updateLocal(fixturePoll, row => {
    const login = row.queue.pop();
    (row.loginResults ??= {})[login.operation] = { session: {
      name: 'Maker', organizer: true, voter: row.base.organizerVoter, proof: 'e'.repeat(64),
    } };
  })`);
  await until(() => evaluate("document.querySelector('.voter-availability').dataset.open === 'true'"));
  assert.equal(await evaluate("JSON.parse(sessionStorage.getItem('amigo-planner-live-v1:voter:' + fixturePoll)).proof"), 'e'.repeat(64), 'Organizer login uses the database-confirmed participant token');
  assert.equal(await evaluate("document.querySelector('.poll-confetti') === null"), true, 'Open polls have no confetti');
  await command('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'no-preference' }] });
  await evaluate("pollData.updateLocal(fixturePoll, row => { row.base.status = 'closed'; row.base.finalDateId = '2027-01-10'; })");
  for (let visit = 0; visit < 2; visit++) {
    await command('Page.reload');
    await until(() => evaluate("document.querySelector('.final-date') !== null"));
    assert.equal(await evaluate("document.querySelector('.poll-confetti') === null && !document.querySelector('.final-date').classList.contains('final-date--reveal')"), true, 'Reloading an already chosen date shows it immediately without replaying celebration');
  }
  await until(() => evaluate("document.querySelector('.poll-confetti') === null"));
  await command('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
  await command('Page.reload');
  await until(() => evaluate("document.querySelector('.final-date') !== null && document.querySelector('.poll-confetti') === null"));
  assert.equal(await evaluate("document.querySelector('.poll-confetti') === null"), true, 'Reduced-motion preference skips confetti');
  await command('Emulation.setEmulatedMedia', { features: [] });
  await evaluate(`(async () => {
    const data = await import('/src/data/polls.js');
    await data.updateLocal(${JSON.stringify(ownerOnlyPoll)}, row => {
      row.base = null; row.missing = true; row.queue = [];
    });
  })()`);
  await until(() => evaluate("document.body.textContent.includes('Deze prikker bestaat niet meer.')"));
  assert.equal(await evaluate("document.querySelector('.voter-credentials') === null"), true, 'Deleted polls show a clear message and no stale voting form');
  await command('Page.navigate', { url: `${origin}?page=planner` });
  await until(() => evaluate("document.querySelector('.participation-choice input') !== null"));
  assert.equal(await evaluate("document.querySelector('.participation-choice input').checked"), true, 'Creating a poll defaults to self participation');
  await evaluate("document.querySelector('.participation-choice input').click()");
  assert.equal(await evaluate("document.querySelector('.participation-choice input').checked"), false, 'Creator can still opt out');
  console.log('PASS: unified sign-in, organizer participation changes, own-vote removal, default checkbox, logout and voting');
} finally {
  socket?.close();
  browser.kill();
  await server.close();
  await pause(500);
  await rm(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
}
