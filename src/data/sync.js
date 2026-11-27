import { pendingPolls, updateLocal, discardPendingActions } from './polls.js';
import { message } from '../i18n/index.js';
import { errorMessage } from '../i18n/errors.js';
import { client, connect, rpc } from './backend.js';
import { flushLogout } from './actions.js';
import { setVotingStatus } from './onlineVoting.js';

const statuses=new Map();
const events=new EventTarget();
export function syncStatus(id){return statuses.get(id)||'';}
function status(id,key,params={}){statuses.set(id,message(key,params));events.dispatchEvent(new Event(id));}
export function watchStatus(id,listener){events.addEventListener(id,listener);return()=>events.removeEventListener(id,listener);}
const supportedId=/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i;
async function synchronize(id){
  await discardPendingActions(id);
  if(!supportedId.test(id)){setVotingStatus(id,'unavailable');return status(id,'sync.missing');}
  if(!navigator.onLine){setVotingStatus(id,'offline');return status(id,'sync.offline');}
  await connect();await flushLogout(id);
  const base=await rpc('amigo_read',{p:id});
  await updateLocal(id,row=>{row.base=base;row.missing=base===null;});
  setVotingStatus(id,base&&navigator.onLine?'ready':'unavailable');
  status(id,base?'sync.synced':'sync.missing');
}
const running=new Map();
export function sync(id){
  const active=running.get(id);
  if(active){active.again=true;return active.promise;}
  const job={again:false};running.set(id,job);
  const work=async()=>{do{job.again=false;await synchronize(id);}while(job.again);};
  job.promise=Promise.resolve().then(()=>navigator.locks?navigator.locks.request('amigo-sync-'+id,work):work())
    .catch(error=>{setVotingStatus(id,navigator.onLine?'unavailable':'offline');status(id,client?'sync.deferred':'sync.notConfigured',{detail:errorMessage(error)});})
    .finally(()=>running.delete(id));
  return job.promise;
}
export function follow(id){
  let subscription,stopped=false,joining=false;
  async function refresh(){
    await sync(id);
    if(stopped||joining||subscription||!client||syncStatus(id)?.key!=='sync.synced')return;
    joining=true;
    try{
      await client.realtime.setAuth();if(stopped)return;
      subscription=client.channel('amigo:'+id,{config:{private:true}})
        .on('broadcast',{event:'changed'},()=>sync(id)).subscribe(state=>{if(state==='SUBSCRIBED')sync(id);});
    }catch(error){status(id,'sync.liveDeferred',{detail:errorMessage(error)});}finally{joining=false;}
  }
  refresh();const timer=setInterval(refresh,30000);
  const visible=()=>{if(document.visibilityState==='visible')refresh();};
  window.addEventListener('online',refresh);window.addEventListener('offline',refresh);document.addEventListener('visibilitychange',visible);
  return()=>{stopped=true;clearInterval(timer);window.removeEventListener('online',refresh);window.removeEventListener('offline',refresh);document.removeEventListener('visibilitychange',visible);if(subscription)client.removeChannel(subscription);};
}
export function startSync(){
  // Retire historical queues without replaying them. New writes are always direct.
  pendingPolls().then(ids=>Promise.all(ids.map(discardPendingActions))).catch(error=>console.warn('Local cache:',error.message));
}
