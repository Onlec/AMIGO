// Public statistics and footer rotation against a local HTTP fixture, never production.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer as httpServer } from 'node:http';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer } from 'vite';

const state = { calls: 0, auth: 0, fail: false, hold: true, releases: [], data: {
  startedAt: '2026-11-26T09:00:00Z', planners: 120, registrations: 540, answers: 1000,
  maybeAnswers: 250, mondayAnswers: 100, mondayNoAnswers: 60,
  finalizedPlanners: 80, weekendDates: 60, unanimousDates: 20,
  planningStartedAt:'2026-11-27T09:00:00Z',newPlanners:20,singleDatePlanners:5,untimedPlanners:10,
  multiDateTimedPlanners:10,uniformTimePlanners:8,initialDateOptions:60,
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
    Math.random=()=>0;
    const originalInterval=window.setInterval, originalClear=window.clearInterval;
    window.footerTimers=new Map(); let timer=1000000000;
    window.setInterval=(callback,delay,...args)=>{
      if(delay===7000){footerTimers.set(++timer,()=>callback(...args));return timer;}
      return originalInterval(callback,delay,...args);
    };
    window.clearInterval=id=>{footerTimers.delete(id);originalClear(id);};
    window.advanceFooter=()=>{for(const callback of footerTimers.values())callback();};
    window.counterAnimations=[];
    const originalAnimate=Element.prototype.animate;
    Element.prototype.animate=function(frames,options){
      if(this.classList.contains('office-counter__roll'))counterAnimations.push(options.duration);
      return originalAnimate.call(this,frames,options);
    };
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
  assert.equal(await evaluate('document.title'), 'AMIGO · FIG. 03 — The Counting Office');
  assert.equal(await evaluate("document.querySelectorAll('.statistics-page .statistic-card').length"), 12);
  assert.equal(await evaluate("document.querySelector('[data-statistic=doubt] dd').textContent"), '25%');
  assert.equal(await evaluate("document.querySelector('.office-counter .office-sr-only').textContent"), 'Answers recorded: 1,000');
  assert.equal(await evaluate('counterAnimations.length'), 6);
  assert.equal(await evaluate('counterAnimations.every(duration=>duration<=1200)'), true);
  assert.equal(await evaluate("document.querySelectorAll('.office-flap,.office-seal').length"), 0, 'No redundant measured tags or decorative seals');
  assert.equal(await evaluate("document.querySelectorAll('.statistics-sections > fieldset > legend').length"), 4, 'Statistics use the planner segment structure');
  assert.equal(await evaluate("document.querySelectorAll('.statistic-card svg[data-statistic-icon]').length"), 12, 'Every statistic has a line icon');
  assert.equal(await evaluate("document.querySelector('[data-statistic=singleOption] dd').textContent"),'25%');
  assert.equal(await evaluate("document.querySelector('[data-statistic=timeless] dd').textContent"),'50%');
  assert.equal(await evaluate("document.querySelector('[data-statistic=sameTime] dd').textContent"),'80%');
  assert.equal(await evaluate("document.querySelector('[data-statistic=choiceStress] dd').textContent"),'3');
  assert.equal(await evaluate("document.querySelector('.office-record-number') === null"), true, 'Numbered tiles have been removed');
  assert.equal(await evaluate("document.querySelector('.statistics-page [data-statistic=goats],.statistics-page [data-statistic=meetings]') === null"), true, 'The full page only shows real statistics');
  await pause(1250);
  assert.equal(await evaluate("document.querySelector('.office-counter').getAnimations({subtree:true}).length"), 0, 'Counter animation finishes without looping');
  const slide = () => evaluate("document.querySelector('.footer-statistic__slide').dataset.statistic");
  assert.equal(await slide(), 'planners', 'Initial selection uses the random offset');
  await until(() => evaluate('footerTimers.size === 1'));
  await evaluate('advanceFooter()'); await until(async () => await slide() === 'registrations');
  assert.equal(await evaluate("document.querySelector('.statistics-page h1').textContent"), 'The Counting Office', 'Only the footer rotates');

  await evaluate("document.querySelector('.site-footer__inner').dispatchEvent(new MouseEvent('mouseover',{bubbles:true}))");
  await until(() => evaluate('footerTimers.size === 0'));
  await evaluate('advanceFooter()'); assert.equal(await slide(), 'registrations');
  await evaluate("document.querySelector('.site-footer__inner').dispatchEvent(new MouseEvent('mouseout',{bubbles:true,relatedTarget:document.body}))");
  await until(() => evaluate('footerTimers.size === 1'));
  await evaluate("document.querySelector('.site-footer a').focus()");
  await until(() => evaluate('footerTimers.size === 0'));
  await evaluate("document.activeElement.blur()");
  await until(() => evaluate('footerTimers.size === 1'));
  await evaluate("Object.defineProperty(document,'hidden',{configurable:true,value:true});document.dispatchEvent(new Event('visibilitychange'))");
  await until(() => evaluate('footerTimers.size === 0'));
  await evaluate("delete document.hidden;document.dispatchEvent(new Event('visibilitychange'))");
  await until(() => evaluate('footerTimers.size === 1'));
  await evaluate('for(let tick=0;tick<7;tick++)advanceFooter()');
  await until(async () => await slide() === 'goats');
  await evaluate('advanceFooter()');
  await until(async () => await slide() === 'meetings');

  await command('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
  await until(() => evaluate('footerTimers.size === 0'));
  assert.equal(await evaluate("getComputedStyle(document.querySelector('.footer-statistic__slide')).animationName"), 'none');
  assert.equal(await evaluate("document.querySelector('.footer-statistic__pause') === null"), true);
  assert.equal(await evaluate("document.querySelector('.footer-statistic__prefix').textContent"), 'Statistic:');

  for (const locale of ['en-GB', 'nl-BE']) {
    await evaluate(`import('/src/i18n/index.js').then(module=>module.setLocale(${JSON.stringify(locale)}))`);
    for (const theme of ['light', 'dark']) {
      await evaluate(`document.documentElement.dataset.theme=${JSON.stringify(theme)}`);
      for (const width of [320, 375, 390, 720, 768, 1440]) {
        await command('Emulation.setDeviceMetricsOverride', { width, height: 1000, deviceScaleFactor: 1, mobile: false });
        await pause(50);
        const problems = await evaluate(`(()=>{
          const issues=[];
          if(document.documentElement.scrollWidth>innerWidth+1)issues.push('page overflow');
          if(document.querySelector('.site-footer').getBoundingClientRect().height>40)issues.push('footer is not compact');
          if(getComputedStyle(document.querySelector('.counting-office')).backgroundColor!=='rgba(0, 0, 0, 0)')issues.push('extra page background');
          const ink=getComputedStyle(document.body).color;
          const muted=getComputedStyle(document.querySelector('.footer-statistic__prefix')).color;
          for(const frame of document.querySelectorAll('.statistics-sections > fieldset')){
            if(getComputedStyle(frame).borderTopColor!==ink)issues.push('segment border differs from planner ink');
            if(getComputedStyle(frame.querySelector('legend')).color!==muted)issues.push('segment title differs from planner muted color');
          }
          for(const node of document.querySelectorAll('.statistic-card,.site-footer__inner,.office-master,.office-nameplate')){
            if(node.scrollWidth>node.clientWidth+1)issues.push(node.className+' overflow');
          }
          for(const digit of document.querySelectorAll('.office-counter__window')){
            const visibleDigit=digit.querySelector('.office-counter__roll > span:last-child');
            if(visibleDigit.scrollWidth>digit.clientWidth+1)issues.push('counter digit clipped');
          }
          return issues;
        })()`);
        assert.deepEqual(problems, [], `${locale} ${theme} ${width}px`);
        if (process.argv.includes('--screenshots') && locale === 'en-GB' && [375,1440].includes(width)) {
          await mkdir('docs/counting-office', { recursive: true });
          await evaluate("scrollTo({top:0,behavior:'instant'})");
          const metrics = await command('Page.getLayoutMetrics');
          const screenshot = await command('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true,
            clip: { x: 0, y: 0, width, height: metrics.cssContentSize.height, scale: 1 } });
          await writeFile(`docs/counting-office/${theme}-${width}.png`, Buffer.from(screenshot.data, 'base64'));
        }
      }
    }
  }
  assert.equal(await evaluate('counterAnimations.length'), 6, 'Theme, language and layout changes never replay the counter');

  assert.equal(await evaluate(`(()=>{
    const footer=document.querySelector('.site-footer').getBoundingClientRect();
    const main=document.querySelector('main').getBoundingClientRect();
    return footer.top>=main.bottom-1 && footer.top>innerHeight;
  })()`), true, 'Long content pushes the footer below the viewport without overlap');
  await evaluate('scrollTo(0,document.documentElement.scrollHeight)');
  await pause(500);
  assert.equal(await evaluate("Math.abs(document.querySelector('.site-footer').getBoundingClientRect().bottom-innerHeight)<2"), true, 'The footer is reachable at the end of long content');

  const headingStyles = () => evaluate(`['.planner-page .eyebrow','.planner-page h1'].map(selector=>{
    const style=getComputedStyle(document.querySelector(selector));
    return Object.fromEntries(['fontFamily','fontSize','fontWeight','lineHeight','letterSpacing','textTransform','marginTop','marginBottom'].map(key=>[key,style[key]]));
  })`);
  const statisticsHeadings = await headingStyles();
  await command('Page.navigate', { url: origin });
  await until(() => evaluate("document.querySelector('.planner-page:not(.statistics-page)') !== null && document.querySelector('.footer-statistic__slide') !== null"));
  await command('Emulation.setDeviceMetricsOverride', { width: 1440, height: 2400, deviceScaleFactor: 1, mobile: false });
  await pause(100);
  assert.deepEqual(await headingStyles(), statisticsHeadings, 'Eyebrow and title use the exact planner typography and vertical margins');
  assert.equal(await evaluate("Math.abs(document.querySelector('.site-footer').getBoundingClientRect().bottom-innerHeight)<2 && document.documentElement.scrollHeight<=innerHeight+1"), true, 'Short content keeps the footer at the bottom of the viewport');
  await evaluate("document.querySelector('.site-footer a').click()");
  await until(() => evaluate("document.querySelector('.statistics-page') !== null"));
  await until(() => evaluate("document.querySelector('.office-counter__digits') !== null"));
  assert.equal(await evaluate('counterAnimations.length'), 0, 'Reduced motion immediately shows final digits without animating');
  assert.equal(new URL(await evaluate('location.href')).searchParams.get('page'), 'statistics');
  await evaluate('history.back()');
  await until(() => evaluate("document.querySelector('.planner-page:not(.statistics-page)') !== null"));

  state.fail = true;
  await command('Page.navigate', { url: origin + '?page=statistics' });
  await until(() => evaluate("document.querySelector('.statistics-error') !== null"));
  assert.equal(await evaluate("document.querySelector('[data-statistic=planners] dd').textContent"), '—', 'An unavailable count is not zero');
  assert.equal(await evaluate("document.querySelector('[data-statistic=planners]').dataset.state"), 'unavailable');
  assert.equal(await evaluate("document.querySelector('.office-counter__digits') === null"), true);
  assert.ok(await evaluate("document.querySelector('.footer-statistic__slide').title.includes('Voor de grap')"));
  state.fail = false;
  state.data = { ...state.data, answers: 0, mondayAnswers: 0, finalizedPlanners: 0, maybeAnswers: 0,
    mondayNoAnswers: 0, weekendDates: 0, unanimousDates: 0 };
  await evaluate("document.querySelector('.statistics-error button').click()");
  await until(() => evaluate("document.querySelector('[data-statistic=answers] dd').textContent === '0'"));
  assert.equal(await evaluate("document.querySelector('[data-statistic=doubt]').dataset.state"), 'collecting');
  assert.equal(await evaluate("document.querySelector('[data-statistic=doubt] .office-collection__label').textContent"), 'Nog even verzamelen');
  assert.equal(await evaluate("document.querySelector('.office-progress,.office-observations,[role=progressbar]') === null"), true, 'No required observation counts or progress targets are shown');
  assert.equal(await evaluate("document.querySelector('[data-statistic=doubt] dd').textContent.includes('%')"), false);
  assert.equal(await evaluate("[...document.querySelectorAll('.office-counter__roll > span:last-child')].map(node=>node.textContent).join('')"), '000000');
  assert.equal(await evaluate("document.querySelector('.statistics-error') === null"), true);
  assert.equal(state.auth, 0);
  const reload = () => evaluate("import('/src/data/statistics.js').then(module=>module.loadStatistics(true))");
  state.data = { ...state.data, answers: 9, maybeAnswers: 4 };
  await reload();
  await until(() => evaluate("document.querySelector('[data-statistic=answers] dd').textContent === '9'"));
  assert.equal(await evaluate("document.querySelector('[data-statistic=doubt]').dataset.state"), 'collecting');
  assert.equal(await evaluate("document.querySelector('[data-statistic=doubt] dd').textContent.includes('%')"), false);
  state.data = { ...state.data, answers: 10, maybeAnswers: 0 };
  await reload();
  await until(() => evaluate("document.querySelector('[data-statistic=doubt]').dataset.state === 'measured'"));
  assert.ok(await evaluate("document.querySelector('[data-statistic=doubt] dd').textContent.includes('0')"));
  assert.equal(await evaluate("document.querySelector('[data-statistic=doubt] .office-measurement') === null"), true, 'A ready value does not need a measured tag');
  state.data = { ...state.data, answers: Number.MAX_SAFE_INTEGER };
  await reload();
  await until(() => evaluate("document.querySelectorAll('.office-counter__window').length === 16"));
  await command('Emulation.setDeviceMetricsOverride', { width: 375, height: 1000, deviceScaleFactor: 1, mobile: false });
  assert.equal(await evaluate("document.documentElement.scrollWidth<=innerWidth+1"), true, 'Large counters stay within mobile bounds');
  assert.equal(await evaluate('counterAnimations.length'), 0, 'Retry and new readings do not replay a counter already shown');
  console.log('PASS: planner-consistent segments and colors, SVG icons instead of numbered tiles, no observation targets, unchanged statistical thresholds/counter/footer, EN/NL, responsive layouts, navigation and error recovery.');
} finally {
  state.releases.splice(0).forEach(resolve => resolve());
  socket?.close(); browser.kill(); await server.close();
  backend.closeAllConnections(); await new Promise(resolve => backend.close(resolve));
  await pause(500); await rm(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
}
