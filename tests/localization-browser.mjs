// node tests/localization-browser.mjs (Chrome required).
// Enables the hidden tools only in the test server; no database or config edits.
import assert from 'node:assert/strict';
import { t, setLocale, formatNumber } from '../src/i18n/index.js';
import { spawn } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer } from 'vite';

const profile = await mkdtemp(join(tmpdir(), 'amigo-browser-'));
process.env.VITE_SUPABASE_URL = '';
process.env.VITE_SUPABASE_PUBLISHABLE_KEY = '';
const server = await createServer({ server: { host: '127.0.0.1', port: 0 }, clearScreen: false,
  plugins: [{name:'localization-home-fixture', enforce:'pre', transform(code,id){
    if(id.endsWith('/src/config.js')) return code.replace('PLANNER_ONLY = true','PLANNER_ONLY = false');
  }}] });
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
  await command('Emulation.setLocaleOverride', {locale:'nl-BE'});
  await command('Page.navigate', { url: origin });
  await until(() => evaluate("document.querySelectorAll('#grid a').length === 13"));
  assert.equal(await evaluate('document.documentElement.lang'), 'en-GB');
  assert.equal(await evaluate("document.querySelector('.language-select').value"), 'en-GB');
  assert.equal(await evaluate("document.querySelectorAll('.language-select option').length"), 2);
  async function selectLocale(locale) {
    await evaluate('(() => {const select=document.querySelector(".language-select");select.value='+JSON.stringify(locale)+';select.dispatchEvent(new Event("change",{bubbles:true}));})()');
    await until(() => evaluate('document.documentElement.lang === '+JSON.stringify(locale)));
    setLocale(locale);
    await pause(30);
  }
  for (const locale of ['en-GB','nl-BE']) {
  await selectLocale(locale);
  for (const width of [320,390,768,1440]) {
    await command('Emulation.setDeviceMetricsOverride', {width,height:950,deviceScaleFactor:1,mobile:width<600});
    await pause(100);
    assert.equal(await evaluate('document.documentElement.scrollWidth <= innerWidth'), true, 'Home fits '+width);
    assert.equal(await evaluate("document.querySelector('.language-select').getBoundingClientRect().height"),36);
  }
  }
  await command('Emulation.setDeviceMetricsOverride', {width:1000,height:950,deviceScaleFactor:1,mobile:false});
  const normalized = expression => evaluate('('+expression+').replace(/[\u00a0\u202f]/g," ")');
  const tools=['btw','datum','eenheden','factuur','kilometers','lening','marge','procent','tijd','uurtarief'];
  const headingKeys=['tools.vat.name','tools.dates.name','tools.units.name','tools.invoice.name','tools.mileage.name','tools.loan.name','tools.margin.name','tools.percent.name','tools.time.name','tools.rate.name'];
  for (const locale of ['en-GB','nl-BE']) {
  await selectLocale(locale);
  for (const tool of tools) {
    await evaluate('location.hash='+JSON.stringify(tool));
    await until(() => evaluate("document.querySelector('#th')?.textContent === "+JSON.stringify(t(headingKeys[tools.indexOf(tool)]))+" && document.querySelector('#ts')?.textContent === "+JSON.stringify(t('home.calculated'))));
    assert.ok(await evaluate("document.querySelectorAll('#tr .res').length > 0"),tool+' results');
    assert.equal(await evaluate("document.querySelector('#tr').textContent.includes('NaN')"),false,tool+' valid numbers');
    if(tool==='btw') assert.ok((await normalized("document.querySelector('#tr').textContent")).includes(formatNumber(1512.5,{minimumFractionDigits:2})));
    if(tool==='kilometers') assert.ok((await normalized("document.querySelector('#tr').textContent")).includes(formatNumber(51.6,{minimumFractionDigits:2})));
    if(tool==='tijd') assert.ok((await normalized("document.querySelector('#tr').textContent")).includes(t('tools.time.duration',{hours:8,minutes:'00'})));
  }
  for (const [hash,storage] of [['agenda','amigo-agenda'],['notities','amigo-notities']]) {
    await evaluate('location.hash='+JSON.stringify(hash));
    await until(() => evaluate("document.querySelector('#th')?.textContent === "+JSON.stringify(t(hash==='agenda'?'tools.agenda.name':'tools.notes.name'))+" && document.querySelector('#li') !== null"));
    await evaluate("document.querySelector('#li').value='Mijn eigen inhoud <test>'; document.querySelector('#la').click()");
    assert.ok(await evaluate('localStorage.getItem('+JSON.stringify(storage)+').includes("Mijn eigen inhoud <test>")'));
    assert.equal(await evaluate("document.querySelector('#ll span').textContent"),'Mijn eigen inhoud <test>');
    await evaluate("document.querySelector('#ll button').click()");
    assert.equal(await evaluate('JSON.parse(localStorage.getItem('+JSON.stringify(storage)+')).length'),0);
  }
  }
  await evaluate("location.hash='btw'");
  await until(() => evaluate("document.querySelector('#f_a') !== null"));
  await evaluate("document.querySelector('#f_a').value='2.500,75';document.querySelector('#f_a').dispatchEvent(new Event('input',{bubbles:true}))");
  await selectLocale('en-GB');
  assert.equal(await evaluate("document.querySelector('#f_a').value"),'2,500.75');
  assert.ok((await normalized("document.querySelector('#tr').textContent")).includes('3,025.91'));
  await selectLocale('nl-BE');
  assert.equal(await evaluate("document.querySelector('#f_a').value"),'2.500,75');
  await evaluate("localStorage.setItem('amigo-locale','invalid'); location.reload()");
  await until(() => evaluate("document.querySelector('.language-select')?.value === 'en-GB'"));
  assert.equal(await evaluate('document.documentElement.lang'),'en-GB');
  await command('Page.navigate',{url:origin+'?page=planner'});
  await until(() => evaluate("document.querySelector('.planner-page input') !== null"));
  await evaluate("(() => { const field=document.querySelector('.planner-page input'); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(field,'Onvoltooide prikker'); field.dispatchEvent(new Event('input',{bubbles:true})); const select=document.querySelector('.language-select'); select.value='nl-BE'; select.dispatchEvent(new Event('change',{bubbles:true})); })()");
  assert.equal(await evaluate("document.querySelector('.planner-page input').value"),'Onvoltooide prikker');
  assert.equal(await evaluate("localStorage.getItem('amigo-locale')"),'nl-BE');
  await evaluate('location.reload()');
  await until(() => evaluate("document.querySelector('.planner-page input')?.value === '' && document.querySelector('.language-select')?.value === 'nl-BE'"));
  assert.equal(await evaluate("document.querySelector('.language-select').value"),'nl-BE');
  await evaluate(`(async () => {
    const data=await import('/src/data/polls.js');
    const sessions=await import('/src/data/voterSession.js');
    const id='cccccccc-1111-4111-8111-111111111111',voter='dddddddd-1111-4111-8111-111111111111';
    await data.updateLocal(id,row=>{
      row.base={title:'My own title',description:'My own description',status:'open',organizer:true,organizerVoter:voter,
        dates:{'2026-12-04':{date:'2026-12-04',time:'18:30'}},votes:{[voter]:{name:'My own name',votesJson:'{"2026-12-04":"yes"}'}}};
      row.queue=[{operation:'eeeeeeee-1111-4111-8111-111111111111',kind:'ballot',body:{voter,proof:'b'.repeat(64),changes:{'2026-12-04':'yes'}}}];
      row.notices=[];
    });
    sessions.rememberVoterSession(id,{voter,proof:'b'.repeat(64),name:'My own name',organizer:true});
    localStorage.setItem('amigo-date-view','cards');
  })()`);
  await command('Page.navigate',{url:origin+'?poll=cccccccc-1111-4111-8111-111111111111'});
  await until(()=>evaluate("document.querySelector('.voter-ballot .date-cards [aria-checked=true]') !== null"));
  const snapshot=await evaluate("import('/src/data/polls.js').then(data=>data.readLocal('cccccccc-1111-4111-8111-111111111111')).then(row=>JSON.stringify({queue:row.queue,base:row.base,session:sessionStorage.getItem('amigo-planner-live-v1:voter:cccccccc-1111-4111-8111-111111111111')}))");
  await selectLocale('en-GB');
  assert.equal(await evaluate("document.querySelector('h1').textContent"),'My own title');
  assert.equal(await evaluate("document.querySelector('.voter-ballot .date-cards [aria-checked=true]').getAttribute('aria-label')"),'✓ Yes');
  assert.equal(await evaluate("import('/src/data/polls.js').then(data=>data.readLocal('cccccccc-1111-4111-8111-111111111111')).then(row=>JSON.stringify({queue:row.queue,base:row.base,session:sessionStorage.getItem('amigo-planner-live-v1:voter:cccccccc-1111-4111-8111-111111111111')}))"),snapshot);
  await selectLocale('nl-BE');
  assert.equal(await evaluate("document.querySelector('.voter-ballot .date-cards [aria-checked=true]').getAttribute('aria-label')"),'✓ Ja');
  console.log('PASS: English default, EN/NL switching and persistence, both responsive headers, 10 calculators and list tools in both languages, preserved numeric input, votes, sessions and offline queue.');
} finally {
  socket?.close();
  browser.kill();
  await server.close();
  await pause(500);
  await rm(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
}
