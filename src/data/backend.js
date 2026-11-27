import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
export const client = url && key ? createClient(url, key) : null;
let signingIn;

export async function connect() {
  if (!client) throw Object.assign(new Error('Supabase is not configured'), {localizationKey:'sync.notConfigured'});
  async function ensureSession() {
    const {data,error} = await client.auth.getSession();
    if (error) throw error;
    if (data.session) return;
    const result = await client.auth.signInAnonymously();
    if (result.error) throw result.error;
  }
  signingIn ??= (navigator.locks ? navigator.locks.request('amigo-session', ensureSession) : ensureSession())
    .finally(() => { signingIn = null; });
  await signingIn;
}

export async function rpc(name, params, signal) {
  const controller = new AbortController();
  const abort = () => controller.abort();
  const timer = setTimeout(abort, 10000);
  signal?.addEventListener('abort', abort, {once:true});
  if (signal?.aborted) abort();
  try {
    // Never automatically retry a write after an ambiguous HTTP response.
    const {data,error} = await client.rpc(name,params).retry(false).abortSignal(controller.signal);
    if (error) throw error;
    return data;
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', abort);
  }
}
