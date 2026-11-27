// Optional local SQL validation: downloads pinned PGlite into a temporary directory.
// No project dependency or live database connection is used.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const temporary = await mkdtemp(join(tmpdir(), 'amigo-sql-check-'));
let database;
try {
  const response = await fetch('https://registry.npmjs.org/@electric-sql/pglite/0.6.0', { signal: AbortSignal.timeout(30000) });
  assert.ok(response.ok);
  const manifest = await response.json();
  const packageResponse = await fetch(manifest.dist.tarball, { signal: AbortSignal.timeout(30000) });
  assert.ok(packageResponse.ok);
  const archive = Buffer.from(await packageResponse.arrayBuffer());
  assert.equal('sha512-' + createHash('sha512').update(archive).digest('base64'), manifest.dist.integrity);
  const archivePath = join(temporary, 'pglite.tgz');
  await writeFile(archivePath, archive);
  execFileSync('tar', ['-xzf', archivePath, '-C', temporary]);
  const { PGlite } = await import(pathToFileURL(join(temporary, 'package/dist/index.js')));
  database = await PGlite.create();
  // Only Supabase transports/scheduling are stubs; PostgreSQL executes the rest.
  await database.exec(`
    create role anon; create role authenticated;
    create schema auth;
    create function auth.uid() returns uuid language sql as $$
      select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid;
    $$;
    create schema realtime;
    create table realtime.messages(extension text);
    create function realtime.topic() returns text language sql as $$ select ''; $$;
    create function realtime.send(jsonb,text,text,boolean) returns void language plpgsql as $$ begin return; end $$;
    create schema cron;
    create table cron.job(jobid bigint generated always as identity, jobname text unique, schedule text, command text, active boolean default true);
    create function cron.schedule(text,text,text) returns bigint language sql as $$
      insert into cron.job(jobname,schedule,command) values($1,$2,$3)
      on conflict(jobname) do update set schedule=excluded.schedule,command=excluded.command returning jobid;
    $$;
  `);
  const names = (await readdir('supabase/migrations')).filter(name => name.endsWith('.sql')).sort();
  for (const name of names) {
    if (name === '202611260002_statistics.sql') {
      // Existing data must be counted once when statistics are introduced.
      await database.exec(`
        select set_config('request.jwt.claim.sub','11111111-1111-4111-8111-111111111111',false);
        select public.amigo_apply('eeeeeeee-1111-4111-8111-111111111111',gen_random_uuid(),'createPoll',
          jsonb_build_object('title','Statistics baseline','description','','organizerName','Maker',
            'proof',repeat('a',64),'voter','eeeeeeee-2222-4222-8222-222222222222','voterProof',repeat('b',64),
            'dates','{"2027-01-02":{},"2027-01-04":{}}'::jsonb));
        select set_config('request.jwt.claim.sub','22222222-2222-4222-8222-222222222222',false);
        select public.amigo_sign_in('eeeeeeee-1111-4111-8111-111111111111',gen_random_uuid(),
          jsonb_build_object('voter','eeeeeeee-3333-4333-8333-333333333333','name','Guest','proof',repeat('c',64)));
        select set_config('request.jwt.claim.sub','11111111-1111-4111-8111-111111111111',false);
        select public.amigo_submit_ballot('eeeeeeee-1111-4111-8111-111111111111',gen_random_uuid(),
          jsonb_build_object('voter','eeeeeeee-2222-4222-8222-222222222222','proof',repeat('b',64),
            'submissionMode','online','changes','{"2027-01-02":"yes","2027-01-04":"no"}'::jsonb));
        select public.amigo_submit_ballot('eeeeeeee-1111-4111-8111-111111111111',gen_random_uuid(),
          jsonb_build_object('voter','eeeeeeee-3333-4333-8333-333333333333','proof',repeat('c',64),
            'submissionMode','online','changes','{"2027-01-02":"yes","2027-01-04":"maybe"}'::jsonb));
        select public.amigo_apply('eeeeeeee-1111-4111-8111-111111111111',gen_random_uuid(),'close','{"day":"2027-01-02"}');
      `);
    }
    const sql = (await readFile(join('supabase/migrations', name), 'utf8'))
      .replace('create extension if not exists pg_cron with schema pg_catalog;', '-- Scheduling stub replaces the pg_cron extension.');
    try { await database.exec(sql); }
    catch (error) { throw new Error('Migration failed: ' + name, { cause: error }); }
    if (name === '202611260002_statistics.sql') {
      const baseline = (await database.query('select public.amigo_statistics() as data')).rows[0].data;
      assert.deepEqual({ ...baseline, startedAt: null }, { startedAt: null, planners: 1, registrations: 2,
        answers: 4, maybeAnswers: 1, mondayAnswers: 2, mondayNoAnswers: 1, finalizedPlanners: 1, weekendDates: 1, unanimousDates: 1 });
      await database.exec("delete from amigo.polls where id='eeeeeeee-1111-4111-8111-111111111111';");
      assert.deepEqual((await database.query('select public.amigo_statistics() as data')).rows[0].data, baseline);
      console.log('PASS: statistics backfill counts existing data once and survives cascading planner deletion.');
    }
  }
  console.log('PASS: all ' + names.length + ' migrations apply to fresh PostgreSQL (Realtime/Cron stubbed).');
  try { await database.exec(await readFile('supabase/tests/planner.sql', 'utf8')); }
  catch (error) { throw new Error('Planner SQL regression failed', { cause: error }); }
  console.log('PASS: current planner SQL regression, including permissions, retries, votes, final dates, participation, expiry and rejected obsolete APIs.');
  try { await database.exec(await readFile('supabase/tests/statistics.sql', 'utf8')); }
  catch (error) { throw new Error('Statistics SQL regression failed', { cause: error }); }
  console.log('PASS: anonymous statistics permissions, successful actions, retries, rollbacks, unanimity, reopening and expiry.');
  try { await database.exec(await readFile('supabase/tests/guided-planner.sql', 'utf8')); }
  catch (error) { throw new Error('Guided planner SQL regression failed', { cause: error }); }
  console.log('PASS: online action receipts, single dates, optional/bulk times, atomic invalidation, stale votes, cohort statistics and expiry.');
  await database.exec(`
    select set_config('request.jwt.claim.sub','11111111-1111-4111-8111-111111111111',false);
    select public.amigo_apply('aaaaaaaa-1111-4111-8111-111111111111',gen_random_uuid(),'createPoll',
      jsonb_build_object('title','Retain after duplicate reset','description','','organizerName','Maker',
        'proof',repeat('a',64),'dates',jsonb_build_object('2027-01-01','{}'::jsonb,'2027-01-02','{}'::jsonb)));
  `);
  let refused = false;
  try { await database.exec(await readFile('supabase/migrations/202611250012_production_reset.sql', 'utf8')); }
  catch { refused = true; await database.exec('rollback;'); }
  assert.ok(refused);
  assert.equal((await database.query('select count(*)::int as count from amigo.polls')).rows[0].count, 1);
  console.log('PASS: rerunning the one-time rollout reset rolls back and preserves later polls.');
} finally {
  await database?.close();
  await rm(temporary, { recursive: true, force: true });
}
