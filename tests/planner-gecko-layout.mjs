// Actual React login form in Firefox/Zen, using isolated profiles and no database.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer } from 'vite';

process.env.VITE_SUPABASE_URL = '';
process.env.VITE_SUPABASE_PUBLISHABLE_KEY = '';
const zen = process.argv.includes('--zen');
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
<div id="root" class="planner-page"><div class="form" id="form"></div></div><script type="module">
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
const inputs = [...row.querySelectorAll('input')].map(input => input.getBoundingClientRect());
const button = row.querySelector('button').getBoundingClientRect();
const errors = [];
const near = (a, b, name) => { if (Math.abs(a-b) > 1) errors.push(name + ': ' + a + ' vs ' + b); };
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
await fetch('/gecko-report', {method:'POST', body:JSON.stringify({width:innerWidth, theme:params.get('theme'), errors})});
</script></body></html>`;
const reports = [];
const handle = async (req, res, next) => {
  if (req.url.startsWith('/gecko-report')) {
    let body = ''; for await (const chunk of req) body += chunk;
    reports.push(JSON.parse(body)); res.end('ok');
    if (reports.length === 8) finish(reports);
  } else if (req.url.startsWith('/gecko-form') || req.url === '/gecko-layout') {
    res.setHeader('Content-Type', 'text/html');
    res.end(await server.transformIndexHtml(req.url, req.url === '/gecko-layout' ? fixture : form));
  } else next();
};
try {
  await server.listen();
  browser = spawn(executable, ['--headless', '--no-remote', '--profile', profile, server.resolvedUrls.local[0] + 'gecko-layout'],
    { windowsHide: true, stdio: ['ignore', 'ignore', 'pipe'] });
  browser.stderr.on('data', chunk => process.stderr.write(chunk));
  browser.on('exit', code => { if (reports.length < 8) fail(new Error('Browser exited with code ' + code)); });
  browser.on('error', fail);
  timer = setTimeout(() => fail(new Error('Gecko layout timed out; reports: ' + JSON.stringify(reports))), 45000);
  const results = await report;
  for (const result of results) assert.deepEqual(result.errors, [], JSON.stringify(result));
  console.log('PASS: ' + (zen ? 'Zen' : 'Firefox') + ' login fields/button share top and bottom edges; 8 desktop/mobile and light/dark layouts.');
} finally {
  clearTimeout(timer);
  browser?.kill();
  await server.close();
  await new Promise(resolve => setTimeout(resolve, 1000));
  await rm(profile, { recursive: true, force: true, maxRetries: 8, retryDelay: 300 });
}
