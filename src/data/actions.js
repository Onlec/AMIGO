import { useRef, useState } from 'react';
import { client, connect, rpc } from './backend.js';
import { updateLocal } from './polls.js';
import { setVotingStatus } from './onlineVoting.js';
import { PLANNER_STORAGE_NAMESPACE } from '../config.js';

const logoutKey = PLANNER_STORAGE_NAMESPACE + ':logout:';
const failure = key => Object.assign(new Error(key), { localizationKey: key });
const business = error => ['P0001','23503','23505','23514','23502','22007','22P02'].includes(error.code);

// Access revocation is the sole deferred operation: it cannot replay content changes.
export async function flushLogout(id) {
  const operation = sessionStorage.getItem(logoutKey + id);
  if (!operation) return;
  await rpc('amigo_lock_organizer', { p: id, operation });
  if (sessionStorage.getItem(logoutKey + id) === operation) sessionStorage.removeItem(logoutKey + id);
}
export async function revokeOrganizer(id) {
  sessionStorage.setItem(logoutKey + id, crypto.randomUUID());
  if (!navigator.onLine || !client) return;
  await connect();
  await flushLogout(id);
}

async function transport(command, checking) {
  if (!navigator.onLine || !client) throw failure('action.onlineRequired');
  const controller = new AbortController();
  let timer, started = false;
  const abort = () => controller.abort();
  window.addEventListener('offline', abort, { once: true });
  const work = async () => {
    await connect();
    if (controller.signal.aborted || !navigator.onLine) throw failure('action.onlineRequired');
    await flushLogout(command.id);
    if (controller.signal.aborted || !navigator.onLine) throw failure('action.onlineRequired');
    started = true;
    const result = await rpc(checking ? 'amigo_action_status' : 'amigo_action', {
      p: command.id, operation: command.operation,
      ...(!checking && { kind: command.kind, body: command.body }),
    }, controller.signal);
    if (result.accepted) {
      await updateLocal(command.id, row => { row.base = result.poll; row.missing = !result.poll; });
      setVotingStatus(command.id, result.poll ? 'ready' : 'unavailable');
    }
    return result;
  };
  try {
    const deadline = new Promise((_, reject) => { timer = setTimeout(() => {
      controller.abort(); reject(failure(started ? 'action.unknown' : 'action.onlineRequired'));
    }, 10000); });
    const request = navigator.locks ? navigator.locks.request('amigo-sync-' + command.id, { signal: controller.signal }, work) : work();
    return await Promise.race([request, deadline]);
  } catch (error) {
    if (business(error) || error.localizationKey) throw error;
    throw failure(started ? 'action.unknown' : 'action.onlineRequired');
  } finally {
    clearTimeout(timer); controller.abort(); window.removeEventListener('offline', abort);
  }
}

export function usePlannerAction(scope, onRecovered) {
  const storageKey=scope?PLANNER_STORAGE_NAMESPACE+':action:'+scope:null;
  const readPending=()=>{
    try { const pending=JSON.parse(sessionStorage.getItem(storageKey)||'null');return pending?.id&&pending?.operation&&pending?.kind?{...pending,body:null,onSuccess:onRecovered}:null; } catch { return null; }
  };
  const job = useRef(undefined);
  if(job.current===undefined)job.current=storageKey?readPending():null;
  if(job.current && job.current.body===null)job.current.onSuccess=onRecovered;
  function storePending(command){
    if(!storageKey)return;
    try { if(command)sessionStorage.setItem(storageKey,JSON.stringify({id:command.id,operation:command.operation,kind:command.kind}));else sessionStorage.removeItem(storageKey); } catch {}
  }
  const executing = useRef(false);
  const [status, setStatus] = useState(job.current?'unknown':'idle');
  const [error, setError] = useState(job.current?failure('action.unknown'):null);
  const [retryAllowed, setRetryAllowed] = useState(false);
  async function perform(checking) {
    if (executing.current || !job.current) return;
    executing.current = true; setStatus('busy'); setError(null); setRetryAllowed(false);
    const current = job.current;
    try {
      const result = await transport(current, checking);
      if (!result.accepted) {
        if(current.body===null){job.current=null;storePending(null);setStatus('error');setError(failure('action.notConfirmed'));}
        else {setStatus('unknown');setError(failure('action.notConfirmed'));setRetryAllowed(true);} return;
      }
      job.current = null;storePending(null);setStatus('idle');
      await current.onSuccess?.(result,current);
      return result;
    } catch (err) {
      const uncertain = checking || err.localizationKey === 'action.unknown';
      if (!uncertain){job.current=null;storePending(null);}
      setStatus(uncertain ? 'unknown' : 'error'); setError(err);
    } finally { executing.current = false; }
  }
  return { status, error, retryAllowed, locked: status === 'busy' || status === 'unknown',
    clearError: () => setError(null),
    run: (id, kind, body, onSuccess) => {
      if (job.current || executing.current) return;
      job.current = { id, kind, body: structuredClone(body), operation: crypto.randomUUID(), onSuccess };
      storePending(job.current);
      return perform(false);
    },
    check: () => perform(true), retry: () => perform(false),
  };
}
