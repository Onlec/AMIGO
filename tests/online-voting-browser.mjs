// Real client HTTP transport against a local Supabase-shaped test backend.
// node tests/online-voting-browser.mjs; never connects to a production database.
import assert from 'node:assert/strict';
import { createVotingBackend } from './fixtures/online-backend.mjs';
import { spawn } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer } from 'vite';

const profile = await mkdtemp(join(tmpdir(), 'amigo-browser-'));
const fixture = await createVotingBackend();
process.env.VITE_SUPABASE_URL = fixture.url;
process.env.VITE_SUPABASE_PUBLISHABLE_KEY = 'fixture-public-key';
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
  await command('Page.enable');
  await command('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
  await command('Page.navigate', { url: origin });
  await until(() => evaluate("document.querySelector('.planner-page') !== null"));
  await evaluate(`(async()=>{
    window.pollData=await import('/src/data/polls.js');
    window.voteApi=await import('/src/data/onlineVoting.js');
    window.pollId=${JSON.stringify(fixture.id)};window.voterId=${JSON.stringify(fixture.voter)};
    await pollData.updateLocal(pollId,row=>{
      row.base=${JSON.stringify(fixture.state.poll)};
      row.queue=[{operation:crypto.randomUUID(),kind:'ballot',body:{voter:voterId,proof:'b'.repeat(64),changes:{'2026-12-04':'yes'}}}];
      row.notices=[];
    });
    sessionStorage.setItem('amigo-planner-live-v1:voter:'+pollId,JSON.stringify({voter:voterId,proof:'b'.repeat(64),name:'Participant',organizer:false}));
    localStorage.setItem('amigo-date-view','cards');
  })()`);
  await command('Page.navigate',{url:origin+'?poll='+fixture.id});
  await until(()=>evaluate("document.querySelector('.voter-ballot .date-cards button')?.matches(':disabled') === false"));
  await evaluate(`(async()=>{window.pollData=await import('/src/data/polls.js');window.voteApi=await import('/src/data/onlineVoting.js');window.pollId=${JSON.stringify(fixture.id)};window.voterId=${JSON.stringify(fixture.voter)};})()`);
  const queued=()=>evaluate("pollData.readLocal(pollId).then(row=>row.queue.filter(item=>item.kind==='ballot').length)");
  const yes="document.querySelector('.voter-ballot .date-cards button[aria-label=\"✓ Yes\"]')";
  const ready=()=>until(()=>evaluate(yes+"?.matches(':disabled') === false"));
  assert.equal(fixture.state.writes.length,0,'Startup never replays the old mobile vote');
  assert.equal(await queued(),0);
  assert.equal(await evaluate(yes+".getAttribute('aria-checked')"),'false');
  assert.ok(await evaluate("pollData.readLocal(pollId).then(row=>row.notices.some(item=>item.key==='vote.discarded'))"));

  await evaluate(yes+'.click()');
  await until(()=>evaluate(yes+".getAttribute('aria-checked') === 'true' && !"+yes+".matches(':disabled')"));
  assert.equal(fixture.state.writes.length,1);
  assert.equal(fixture.state.writes[0].body.submissionMode,'online');
  assert.equal(await queued(),0,'Confirmed votes are not queued');

  await command('Network.enable');
  const network=offline=>command('Network.emulateNetworkConditions',{offline,latency:0,downloadThroughput:offline?0:-1,uploadThroughput:offline?0:-1});
  await network(true);
  await until(()=>evaluate(yes+".matches(':disabled')"));
  await evaluate(yes+'.click()');
  assert.equal(await evaluate("pollData.enqueue(pollId,'ballot',{changes:{}}).then(()=>false,()=>true)"),true,'Even programmatic callers cannot queue votes');
  fixture.state.poll.votes[fixture.voter].votesJson='{"2026-12-04":"no"}';
  await evaluate("pollData.updateLocal(pollId,row=>{row.queue.push({operation:crypto.randomUUID(),kind:'edit',body:{title:'Old offline title',added:[],removed:[]}},{operation:crypto.randomUUID(),kind:'ballot',body:{voter:voterId,proof:'b'.repeat(64),changes:{'2026-12-04':'yes'}}});});import('/src/data/sync.js').then(module=>module.sync(pollId))");
  await until(async()=>await queued()===0);
  assert.deepEqual(await evaluate("pollData.readLocal(pollId).then(row=>row.queue.map(item=>item.kind))"),[],'Historical content commands are no longer replayed');
  assert.equal(fixture.state.writes.length,1);
  fixture.state.holdReads=true;
  const priorReads=fixture.state.reads;
  await network(false);
  await until(()=>fixture.state.reads>priorReads);
  assert.equal(await evaluate(yes+".matches(':disabled')"),true,'Reconnect waits for the latest server data');
  fixture.release();
  await ready();
  assert.equal(await evaluate(yes+".getAttribute('aria-checked')"),'false','The newer desktop choice survives reconnect');
  assert.equal(fixture.state.writes.length,1,'Reconnection never sends an old mobile vote');
  assert.equal(fixture.state.otherWrites,0,'No queued command is submitted on reconnect');

  fixture.state.failReads=true;
  await evaluate("import('/src/data/sync.js').then(module=>module.sync(pollId))");
  assert.equal(await evaluate('navigator.onLine'),true);
  assert.equal(await evaluate(yes+".matches(':disabled')"),true,'An unreachable backend also blocks voting');
  assert.equal(await evaluate("voteApi.submitVote(pollId,{voter:voterId,changes:{}}).then(()=>false,()=>true)"),true);
  fixture.state.failReads=false;
  await evaluate("import('/src/data/sync.js').then(module=>module.sync(pollId))");await ready();

  fixture.state.holdReads=true;
  await evaluate(yes+'.click()');
  await pause(10500);
  assert.equal(await evaluate("voteApi.votingStatus(pollId)"),'unavailable','A stalled preflight times out');
  fixture.release();
  await evaluate("import('/src/data/sync.js').then(module=>module.sync(pollId))");await ready();
  assert.equal(fixture.state.writes.length,1,'A late preflight response cannot submit an expired vote');

  fixture.state.holdReads=true;
  const beforePreflight=fixture.state.reads;
  await evaluate(yes+'.click()');
  await until(()=>fixture.state.reads>beforePreflight);
  await network(true); fixture.release();
  await until(()=>evaluate("voteApi.votingStatus(pollId) === 'offline'"));
  await network(false);await ready();
  assert.equal(fixture.state.writes.length,1,'Disconnect during preflight cannot leave a delayed vote');
  assert.equal(await queued(),0);

  fixture.state.loseWriteResponse=true;
  await evaluate(yes+'.click()');
  await until(()=>evaluate("document.querySelector('.voter-availability [role=alert]')?.textContent.includes('could not be confirmed')"));
  assert.equal(fixture.state.writes.length,2,'The HTTP client does not retry a failed vote response');
  assert.equal(await queued(),0,'An uncertain result is never persisted for retry');
  fixture.state.loseWriteResponse=false;
  await evaluate("import('/src/data/sync.js').then(module=>module.sync(pollId))");await ready();
  assert.equal(await evaluate(yes+".getAttribute('aria-checked')"),'true','A fresh read resolves an already accepted vote');
  assert.equal(fixture.state.writes.length,2);
  console.log('PASS: direct online votes, server reachability, offline controls, stale mobile queue removal, reconnect refresh, interrupted preflight and no retries after a lost vote response.');
} finally {
  socket?.close(); browser.kill(); await server.close(); await fixture.close();
  await pause(500); await rm(profile,{recursive:true,force:true,maxRetries:5,retryDelay:200});
}
