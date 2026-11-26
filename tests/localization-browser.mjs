// node tests/localization-browser.mjs (Chrome required).
// Enables the hidden tools only in the test server; no database or config edits.
import assert from 'node:assert/strict';
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
  await command('Emulation.setLocaleOverride', {locale:'en-US'});
  await command('Page.navigate', { url: origin });
  await until(() => evaluate("document.querySelectorAll('#grid a').length === 13"));
  assert.equal(await evaluate('document.documentElement.lang'), 'nl-BE');
  assert.equal(await evaluate("document.querySelector('.language-select').value"), 'nl-BE');
  for (const width of [320,390,768,1440]) {
    await command('Emulation.setDeviceMetricsOverride', {width,height:950,deviceScaleFactor:1,mobile:width<600});
    await pause(100);
    assert.equal(await evaluate('document.documentElement.scrollWidth <= innerWidth'), true, 'Home fits '+width);
    assert.equal(await evaluate("document.querySelector('.language-select').getBoundingClientRect().height"),36);
  }
  await command('Emulation.setDeviceMetricsOverride', {width:1000,height:950,deviceScaleFactor:1,mobile:false});
  const normalized = expression => evaluate('('+expression+').replace(/[\u00a0\u202f]/g," ")');
  const tools=['btw','datum','eenheden','factuur','kilometers','lening','marge','procent','tijd','uurtarief'];
  const headings=['Btw-calculator','Datumrekenaar','Eenhedenomrekenaar','Factuurnummers','Kilometervergoeding','Leningcalculator','Margecalculator','Procentrekenaar','Tijdschrijver','Uurtariefberekening'];
  for (const tool of tools) {
    await evaluate('location.hash='+JSON.stringify(tool));
    await until(() => evaluate("document.querySelector('#th')?.textContent === "+JSON.stringify(headings[tools.indexOf(tool)])+" && document.querySelector('#ts')?.textContent === 'Berekend'"));
    assert.ok(await evaluate("document.querySelectorAll('#tr .res').length > 0"),tool+' results');
    assert.equal(await evaluate("document.querySelector('#tr').textContent.includes('NaN')"),false,tool+' valid numbers');
    if(tool==='btw') assert.ok((await normalized("document.querySelector('#tr').textContent")).includes('1.512,50'));
    if(tool==='kilometers') assert.ok((await normalized("document.querySelector('#tr').textContent")).includes('51,60'));
    if(tool==='tijd') assert.ok((await normalized("document.querySelector('#tr').textContent")).includes('8 u 00 min'));
  }
  for (const [hash,storage] of [['agenda','amigo-agenda'],['notities','amigo-notities']]) {
    await evaluate('location.hash='+JSON.stringify(hash));
    await until(() => evaluate("document.querySelector('#th')?.textContent === "+JSON.stringify(hash==='agenda'?'Agenda':'Notities')+" && document.querySelector('#li') !== null"));
    await evaluate("document.querySelector('#li').value='Mijn eigen inhoud <test>'; document.querySelector('#la').click()");
    assert.ok(await evaluate('localStorage.getItem('+JSON.stringify(storage)+').includes("Mijn eigen inhoud <test>")'));
    assert.equal(await evaluate("document.querySelector('#ll span').textContent"),'Mijn eigen inhoud <test>');
    await evaluate("document.querySelector('#ll button').click()");
    assert.equal(await evaluate('JSON.parse(localStorage.getItem('+JSON.stringify(storage)+')).length'),0);
  }
  await evaluate("localStorage.setItem('amigo-locale','invalid'); location.reload()");
  await until(() => evaluate("document.querySelector('.language-select') !== null"));
  assert.equal(await evaluate('document.documentElement.lang'),'nl-BE');
  await command('Page.navigate',{url:origin+'?page=planner'});
  await until(() => evaluate("document.querySelector('.planner-page input') !== null"));
  await evaluate("(() => { const field=document.querySelector('.planner-page input'); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(field,'Onvoltooide prikker'); field.dispatchEvent(new Event('input',{bubbles:true})); const select=document.querySelector('.language-select'); select.value='nl-BE'; select.dispatchEvent(new Event('change',{bubbles:true})); })()");
  assert.equal(await evaluate("document.querySelector('.planner-page input').value"),'Onvoltooide prikker');
  assert.equal(await evaluate("localStorage.getItem('amigo-locale')"),'nl-BE');
  await evaluate('location.reload()');
  await until(() => evaluate("document.querySelector('.language-select') !== null"));
  assert.equal(await evaluate("document.querySelector('.language-select').value"),'nl-BE');
  console.log('PASS: locale selection/persistence, nl-BE in an en-US browser, responsive headers, 10 calculators and both list tools.');
} finally {
  socket?.close();
  browser.kill();
  await server.close();
  await pause(500);
  await rm(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
}
