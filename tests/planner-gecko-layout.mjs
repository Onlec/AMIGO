// Actual React login form in Firefox/Zen, using isolated profiles and no database.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { build, createServer } from 'vite';

process.env.VITE_SUPABASE_URL = '';
process.env.VITE_SUPABASE_PUBLISHABLE_KEY = '';
const zen = process.argv.includes('--zen');
const production = process.argv.includes('--production');
let builtFiles = new Map(), productionForm;
const executable = process.env.GECKO_PATH || (zen
  ? 'C:\\Program Files\\Zen Browser\\zen.exe'
  : 'C:\\Program Files\\Mozilla Firefox\\firefox.exe');
const profile = await mkdtemp(join(tmpdir(), 'amigo-gecko-'));
const server = await createServer({ server: { host: '127.0.0.1', port: 0 }, clearScreen: false,
  plugins: [{ name: 'gecko-fixture', configureServer(dev) { dev.middlewares.use((...args) => handle(...args)); } }] });
let browser, timer;
let finish, fail;
const report = new Promise((resolve, reject) => { finish = resolve; fail = reject; });
const fixture = `<!doctype html><html><body><script type="module">
  for (const width of [320, 390, 720, 768]) for (const theme of ['light', 'dark']) {
    const frame = document.createElement('iframe');
    frame.style.cssText = 'display:block;border:0;width:' + width + 'px;height:500px';
    frame.src = '/gecko-form?width=' + width + '&theme=' + theme;
    document.body.append(frame);
  }
</script></body></html>`;
const form = `<!doctype html><html><head><script>
const reportError = event => fetch('/gecko-report', {method:'POST', body:JSON.stringify({errors:[String(event.message || event.reason)]})});
addEventListener('error', reportError); addEventListener('unhandledrejection', reportError);
</script><style>* { scroll-behavior:auto!important; }</style></head><body>
<div id="root" class="planner-page"><div id="form"></div></div><script type="module">
import React from '/node_modules/.vite/deps/react.js';
import ReactDOM from '/node_modules/.vite/deps/react-dom_client.js';
import VoterForm from '/src/components/VoterForm.jsx';
import '/src/styles.css';
const params = new URLSearchParams(location.search);
document.documentElement.dataset.theme = params.get('theme');
ReactDOM.createRoot(document.querySelector('#form')).render(React.createElement(VoterForm, {
  pollId:'gecko-layout-fixture', dates:{}, participants:{}, loginResults:{}, session:null, onSelect:() => {}
}));
await new Promise(resolve => setTimeout(resolve, 1000));
await document.fonts.ready;
await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
const row = document.querySelector('.access-row');
const errors = [];
let currentPhase;
const near = (a, b, name) => { if (Math.abs(a-b) > 1) errors.push(currentPhase + ' ' + name + ': ' + a + ' vs ' + b); };
function check(phase) {
currentPhase = phase;
const inputs = [...row.querySelectorAll('input')].map(input => input.getBoundingClientRect());
const button = row.querySelector('button').getBoundingClientRect();
near(button.height, 48, 'button height');
if (innerWidth > 600) {
  for (const input of inputs) { near(input.top, button.top, 'top edge'); near(input.bottom, button.bottom, 'bottom edge'); }
  near(inputs[0].width, inputs[1].width, 'field widths');
} else {
  for (const input of inputs) near(input.width, row.getBoundingClientRect().width, 'full width');
  if (button.top < inputs.at(-1).bottom + 15) errors.push('button spacing');
}
near(button.right, row.getBoundingClientRect().right, 'right edge');
if (document.documentElement.scrollWidth > innerWidth) errors.push('horizontal overflow');
}
check('loaded');
await new Promise(resolve => setTimeout(resolve, 5000));
check('settled');
// Apply the real stylesheet hover rules, also when the test runs headless.
const hover = document.createElement('style');
function hoverRules(rules) {
  let result = '';
  for (const rule of rules) {
    if (rule.selectorText?.includes(':hover')) result += rule.cssText.replaceAll(':hover', '[data-layout-hover]');
    else if (rule.cssRules) result += hoverRules(rule.cssRules);
  }
  return result;
}
hover.textContent = [...document.styleSheets].map(sheet => hoverRules(sheet.cssRules)).join('');
document.head.append(hover);
for (const node of row.querySelectorAll('button,input')) node.dataset.layoutHover = '';
await new Promise(resolve => setTimeout(resolve, 300));
check('hover');
row.querySelector('input').focus();
await new Promise(resolve => setTimeout(resolve, 300));
check('focus');
// Password managers can append a zero-height host to each field label.
for (const label of row.querySelectorAll('label')) {
  const host = document.createElement('span');
  host.style.cssText = 'display:block;width:0;height:0';
  host.dataset.passwordManagerHost = '';
  label.append(host);
}
await new Promise(resolve => requestAnimationFrame(resolve));
check('password-manager host');
await fetch('/gecko-report', {method:'POST', body:JSON.stringify({width:innerWidth, theme:params.get('theme'), errors})});
</script></body></html>`;
const reports = [];
const handle = async (req, res, next) => {
  if (builtFiles.has(req.url)) {
    const mime = { js: 'text/javascript', css: 'text/css', woff2: 'font/woff2' };
    res.setHeader('Content-Type', mime[req.url.split('.').at(-1)] || 'application/octet-stream');
    res.end(builtFiles.get(req.url));
  } else if (req.url.startsWith('/gecko-report')) {
    let body = ''; for await (const chunk of req) body += chunk;
    reports.push(JSON.parse(body)); res.end('ok');
    if (reports.length === 8) finish(reports);
  } else if (req.url.startsWith('/gecko-form') || req.url === '/gecko-layout') {
    res.setHeader('Content-Type', 'text/html');
    const html = req.url === '/gecko-layout' ? fixture : production ? productionForm : form;
    res.end(production ? html : await server.transformIndexHtml(req.url, html));
  } else next();
};
try {
  if (production) {
    const source = form.match(/<script type="module">([\s\S]*?)<\/script>/)[1]
      .replace("'/node_modules/.vite/deps/react.js'", "'react'")
      .replace("'/node_modules/.vite/deps/react-dom_client.js'", "'react-dom/client'")
      .replace('const params =', '(async () => { const params =') + '\n})();';
    const output = await build({ logLevel: 'silent', plugins: [{ name: 'gecko-entry',
      resolveId(id) { if (id === 'virtual:gecko-entry') return '\0gecko-entry'; },
      load(id) { if (id === '\0gecko-entry') return source; }
    }], build: { write: false, rollupOptions: { input: 'virtual:gecko-entry' } } });
    builtFiles = new Map(output.output.map(item => ['/' + item.fileName, item.type === 'chunk' ? item.code : item.source]));
    const entry = output.output.find(item => item.isEntry).fileName;
    const css = output.output.filter(item => item.fileName.endsWith('.css')).map(item => '<link rel="stylesheet" href="/' + item.fileName + '">').join('');
    productionForm = form.replace(/<script type="module">[\s\S]*?<\/script>/, '<script type="module" src="/' + entry + '"></script>').replace('</head>', css + '</head>');
  }
  await server.listen();
  browser = spawn(executable, ['--headless', '--no-remote', '--profile', profile, server.resolvedUrls.local[0] + 'gecko-layout'],
    { windowsHide: true, stdio: ['ignore', 'ignore', 'pipe'] });
  browser.stderr.on('data', chunk => process.stderr.write(chunk));
  browser.on('exit', code => { if (reports.length < 8) fail(new Error('Browser exited with code ' + code)); });
  browser.on('error', fail);
  timer = setTimeout(() => fail(new Error('Gecko layout timed out; reports: ' + JSON.stringify(reports))), 45000);
  const results = await report;
  for (const result of results) assert.deepEqual(result.errors, [], JSON.stringify(result));
  console.log('PASS: ' + (zen ? 'Zen' : 'Firefox') + (production ? ' production' : '') + ' login alignment after fonts, delay, hover, focus and injected password-manager hosts; 8 desktop/mobile and light/dark layouts.');
} finally {
  clearTimeout(timer);
  browser?.kill();
  await server.close();
  await new Promise(resolve => setTimeout(resolve, 1000));
  await rm(profile, { recursive: true, force: true, maxRetries: 8, retryDelay: 300 });
}
