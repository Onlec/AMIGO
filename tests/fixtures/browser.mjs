import { spawn } from 'node:child_process';
import { mkdtemp, readFile, rm, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer } from 'vite';
export const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
export async function until(check){for(let i=0;i<120;i++){if(await check())return;await pause(100);}throw Error('Timed out waiting for browser state');}
export async function withBrowser(work){
  const profile=await mkdtemp(join(tmpdir(),'amigo-guided-'));
  const server=await createServer({server:{host:'127.0.0.1',port:0},clearScreen:false});await server.listen();
  const browser=spawn(process.env.CHROME_PATH||'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',[
    '--headless=new','--no-first-run','--no-default-browser-check','--remote-debugging-port=0',`--user-data-dir=${profile}`,'about:blank',
  ],{windowsHide:true,stdio:'ignore'});
  let socket;
  try{
    let port;await until(async()=>{try{port=(await readFile(join(profile,'DevToolsActivePort'),'utf8')).split('\n')[0];return port;}catch{return false;}});
    const targets=await(await fetch(`http://127.0.0.1:${port}/json`)).json();
    socket=new WebSocket(targets.find(target=>target.type==='page').webSocketDebuggerUrl);
    await new Promise((resolve,reject)=>{socket.addEventListener('open',resolve,{once:true});socket.addEventListener('error',reject,{once:true});});
    let id=0;const requests=new Map();
    socket.addEventListener('message',({data})=>{const response=JSON.parse(data);if(!response.id)return;const request=requests.get(response.id);requests.delete(response.id);if(response.error)request.reject(Error(response.error.message));else request.resolve(response.result);});
    const command=(method,params={})=>new Promise((resolve,reject)=>{const next=++id;requests.set(next,{resolve,reject});socket.send(JSON.stringify({id:next,method,params}));});
    const evaluate=async expression=>{const response=await command('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});if(response.exceptionDetails)throw Error(response.exceptionDetails.exception?.description||response.exceptionDetails.text);return response.result.value;};
    const errors=[];
    socket.addEventListener('message',({data})=>{const response=JSON.parse(data);if(response.method==='Runtime.exceptionThrown')errors.push(response.params.exceptionDetails.exception?.description||response.params.exceptionDetails.text);});
    await command('Page.enable');await command('Runtime.enable');await command('Emulation.setFocusEmulationEnabled',{enabled:true});
    const screenshot=async name=>{if(!process.argv.includes('--screenshots'))return;await mkdir('docs/guided-planner',{recursive:true});await evaluate("scrollTo({top:0,behavior:'instant'})");const size=await command('Page.getLayoutMetrics');const capture=await command('Page.captureScreenshot',{format:'png',captureBeyondViewport:true,clip:{x:0,y:0,width:size.cssContentSize.width,height:size.cssContentSize.height,scale:1}});await writeFile('docs/guided-planner/'+name+'.png',Buffer.from(capture.data,'base64'));};
    await work({command,evaluate,origin:server.resolvedUrls.local[0],errors,screenshot});
  }finally{socket?.close();browser.kill();await server.close();await pause(500);await rm(profile,{recursive:true,force:true,maxRetries:5,retryDelay:200});}
}
