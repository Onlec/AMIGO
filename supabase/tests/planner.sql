-- Run as the database owner against a test database migrated through 013.
-- Test rows, role changes and assertions are all rolled back.
begin;
select set_config('request.jwt.claim.sub','11111111-1111-4111-8111-111111111111',true);

create function pg_temp.new_poll(participating boolean default false) returns uuid
language plpgsql as $$
declare p uuid := gen_random_uuid(); body jsonb;
begin
  body := jsonb_build_object('title','Planner test','description','','organizerName','Maker','proof',repeat('a',64),
    'dates','{"2027-01-01":{},"2027-01-02":{}}'::jsonb);
  if participating then body := body || jsonb_build_object('voter',gen_random_uuid(),'voterProof',repeat('d',64)); end if;
  perform public.amigo_apply(p,gen_random_uuid(),'createPoll',body);
  return p;
end $$;

create function pg_temp.join_voter(p uuid, name_input text default 'Anna') returns uuid
language plpgsql as $$
declare
  voter uuid := gen_random_uuid();
  original_actor text := auth.uid()::text;
  response jsonb;
begin
  perform set_config('request.jwt.claim.sub',gen_random_uuid()::text,true);
  response := public.amigo_sign_in(p,gen_random_uuid(),jsonb_build_object('voter',voter,'name',name_input,'proof',repeat('b',64)));
  assert response->>'voter'=voter::text and response->>'organizer'='false';
  perform set_config('request.jwt.claim.sub',original_actor,true);
  return voter;
end $$;

do $$ begin
  assert not has_schema_privilege('authenticated','amigo','usage');
  assert has_function_privilege('authenticated','public.amigo_sign_in(uuid,uuid,jsonb)','execute');
  assert not has_function_privilege('anon','public.amigo_sign_in(uuid,uuid,jsonb)','execute');
  assert not has_function_privilege('authenticated','amigo.delete_inactive_polls()','execute');
  assert not has_function_privilege('anon','amigo.delete_inactive_polls()','execute');
  assert to_regprocedure('public.amigo_unlock(uuid,text)') is null;
  assert to_regprocedure('public.amigo_voter_unlock(uuid,uuid,text,boolean)') is null;
  assert not exists(select from information_schema.columns where table_schema='amigo' and table_name='voters' and column_name='actor');
  assert exists(select from information_schema.columns where table_schema='amigo' and table_name='voters' and column_name='verifier' and is_nullable='NO');
  assert exists(select from information_schema.columns where table_schema='amigo' and table_name='polls' and column_name='organizer_name' and is_nullable='NO');
end $$;

-- Unified sign-in, role isolation and retry receipts.
do $$
declare
  p uuid := pg_temp.new_poll();
  owner_actor text := auth.uid()::text;
  voter uuid := pg_temp.join_voter(p);
  op uuid := gen_random_uuid();
  response jsonb;
begin
  assert public.amigo_read(p)->>'organizer'='true';
  assert not (public.amigo_read(p) ? 'ownVoter');
  assert not (public.amigo_read(p)#>array['votes',voter::text] ? 'needsPassword');
  assert position(repeat('b',64) in public.amigo_read(p)::text)=0;
  perform set_config('request.jwt.claim.sub',gen_random_uuid()::text,true);
  assert not public.amigo_can_listen('amigo:'||p);
  perform public.amigo_read(p);
  assert public.amigo_can_listen('amigo:'||p);
  begin
    perform public.amigo_edit(p,gen_random_uuid(),'{"title":"Blocked","added":[],"removed":[]}');
    raise exception using errcode='XX000', message='Visitor edited poll';
  exception when raise_exception then assert sqlerrm='Ontgrendel eerst de bewerkmodus.'; end;
  begin
    perform public.amigo_sign_in(p,gen_random_uuid(),jsonb_build_object('voter',gen_random_uuid(),'name','Maker','proof',repeat('c',64)));
    raise exception using errcode='XX000', message='Wrong organizer password accepted';
  exception when raise_exception then assert sqlerrm='Wachtwoord klopt niet.'; end;
  response := public.amigo_sign_in(p,op,jsonb_build_object('name','maker','organizerProof',repeat('a',64)));
  assert response->>'organizer'='true' and response->>'name'='Maker' and response->>'voter' is null;
  assert (select count(*) from amigo.voters where poll_id=p)=1;
  perform public.amigo_lock_organizer(p,gen_random_uuid());
  assert public.amigo_read(p)->>'organizer'='false';
  assert public.amigo_sign_in(p,op,jsonb_build_object('name','Maker'))=response;
  assert public.amigo_read(p)->>'organizer'='false';
  perform public.amigo_sign_in(p,gen_random_uuid(),jsonb_build_object('name','Maker','organizerProof',repeat('a',64)));
  assert public.amigo_read(p)->>'organizer'='true';
  response := public.amigo_sign_in(p,gen_random_uuid(),jsonb_build_object('voter',voter,'name','Anna','proof',repeat('b',64),'organizerProof',repeat('a',64)));
  assert response->>'organizer'='false' and response->>'voter'=voter::text;
  assert public.amigo_read(p)->>'organizer'='false';
  perform set_config('request.jwt.claim.sub',owner_actor,true);
end $$;

-- Registration is separate from voting; ballots are password-verified and atomic.
do $$
declare
  p uuid := pg_temp.new_poll();
  voter uuid := pg_temp.join_voter(p);
  op uuid := gen_random_uuid();
  close_op uuid := gen_random_uuid();
  reopen_op uuid := gen_random_uuid();
  body jsonb := jsonb_build_object('voter',voter,'proof',repeat('b',64),'submissionMode','online');
  snapshot jsonb;
  old_kind text;
begin
  assert (public.amigo_read(p)#>>array['votes',voter::text,'votesJson'])::jsonb='{}'::jsonb;
  begin
    perform public.amigo_submit_ballot(p,gen_random_uuid(),(body-'submissionMode') || '{"changes":{"2027-01-01":"yes"}}');
    raise exception using errcode='XX000',message='An old queued vote was accepted';
  exception when raise_exception then
    assert sqlerrm='Vernieuw de pagina om online te stemmen.';
  end;
  assert (public.amigo_read(p)#>>array['votes',voter::text,'votesJson'])::jsonb='{}'::jsonb;
  perform public.amigo_submit_ballot(p,op,body || '{"changes":{"2027-01-01":"yes"}}');
  perform public.amigo_submit_ballot(p,op,body || '{"changes":{"2027-01-01":"no"}}');
  perform public.amigo_submit_ballot(p,gen_random_uuid(),body || '{"changes":{"2027-01-02":"maybe"}}');
  snapshot := public.amigo_read(p);
  assert (snapshot#>>array['votes',voter::text,'votesJson'])::jsonb='{"2027-01-01":"yes","2027-01-02":"maybe"}'::jsonb;
  begin
    perform public.amigo_submit_ballot(p,gen_random_uuid(),body || jsonb_build_object('proof',repeat('c',64),'changes','{}'::jsonb));
    raise exception using errcode='XX000', message='Wrong voter password accepted';
  exception when raise_exception then assert sqlerrm='Wachtwoord klopt niet.'; end;
  begin
    perform public.amigo_submit_ballot(p,gen_random_uuid(),body || '{"changes":{"2027-01-01":"no","2027-01-03":"yes"}}');
    raise exception using errcode='XX000', message='Invalid date accepted';
  exception when raise_exception then assert sqlerrm like 'De datum % is verwijderd.%'; end;
  assert public.amigo_read(p)=snapshot;
  foreach old_kind in array array['create','join','vote','castVote','details','addDate','removeDate'] loop
    begin
      perform public.amigo_apply(p,gen_random_uuid(),old_kind,'{}');
      raise exception using errcode='XX000', message='Obsolete command accepted';
    exception when raise_exception then assert sqlerrm='Onbekende wijziging.'; end;
  end loop;
  assert public.amigo_read(p)=snapshot;
  perform public.amigo_apply(p,close_op,'close','{"day":"2027-01-01"}');
  begin
    perform public.amigo_submit_ballot(p,gen_random_uuid(),body || '{"changes":{"2027-01-01":"no"}}');
    raise exception using errcode='XX000', message='Closed poll accepted vote';
  exception when raise_exception then assert sqlerrm='De prikker is gesloten of verwijderd.'; end;
  perform public.amigo_sign_in(p,gen_random_uuid(),jsonb_build_object('voter',voter,'name','Anna','proof',repeat('b',64)));
  begin
    perform public.amigo_sign_in(p,gen_random_uuid(),jsonb_build_object('voter',gen_random_uuid(),'name','Nieuwe stemmer','proof',repeat('b',64)));
    raise exception using errcode='XX000', message='Closed poll accepted new participant';
  exception when raise_exception then assert sqlerrm='De prikker is gesloten.'; end;
  perform public.amigo_sign_in(p,gen_random_uuid(),jsonb_build_object('name','Maker','organizerProof',repeat('a',64)));
  perform public.amigo_apply(p,reopen_op,'reopen','{}');
  perform public.amigo_apply(p,close_op,'close','{"day":"2027-01-01"}');
  assert public.amigo_read(p)->>'status'='open';
  perform public.amigo_submit_ballot(p,gen_random_uuid(),body || '{"changes":{"2027-01-01":"none","2027-01-02":"none"}}');
  assert (public.amigo_read(p)#>>array['votes',voter::text,'votesJson'])::jsonb='{}'::jsonb;
  perform public.amigo_apply(p,gen_random_uuid(),'close','{"day":"2027-01-02"}');
  perform public.amigo_apply(p,reopen_op,'reopen','{}');
  assert public.amigo_read(p)->>'finalDateId'='2027-01-02';
  perform public.amigo_apply(p,gen_random_uuid(),'removeVoter',jsonb_build_object('voter',voter));
  begin
    perform public.amigo_submit_ballot(p,gen_random_uuid(),body || '{"changes":{}}');
    raise exception using errcode='XX000', message='Removed participant restored by ballot';
  exception when raise_exception then assert sqlerrm='De prikker is gesloten of verwijderd.'; end;
end $$;

-- Edit drafts, closed-date protection, final-date replacement and logout.
do $$
declare
  p uuid := pg_temp.new_poll();
  op uuid := gen_random_uuid();
  logout_op uuid := gen_random_uuid();
  dates_before jsonb;
begin
  perform public.amigo_edit(p,op,'{"title":"Bewerkt","added":["2027-01-03"],"removed":[]}');
  perform public.amigo_edit(p,op,'{"title":"Dubbel","added":[],"removed":[]}');
  assert public.amigo_read(p)->>'title'='Bewerkt';
  perform public.amigo_apply(p,gen_random_uuid(),'close','{"day":"2027-01-01"}');
  dates_before := public.amigo_read(p)->'dates';
  begin
    perform public.amigo_edit(p,gen_random_uuid(),'{"title":"Verboden","added":[],"removed":["2027-01-03"]}');
    raise exception using errcode='XX000', message='Closed date edit accepted';
  exception when raise_exception then assert sqlerrm='Heropen de poll om datums aan te passen.'; end;
  assert public.amigo_read(p)->>'title'='Bewerkt';
  perform public.amigo_edit(p,gen_random_uuid(),'{"title":"Nieuwe titel","description":"Omschrijving","added":[],"removed":[]}');
  assert public.amigo_read(p)->'dates'=dates_before;
  assert public.amigo_read(p)->>'description'='Omschrijving';
  begin
    update amigo.dates set clock='12:00' where poll_id=p and day='2027-01-03';
    raise exception using errcode='XX000', message='Closed time edit accepted';
  exception when raise_exception then assert sqlerrm='Heropen de poll om datums aan te passen.'; end;
  begin
    perform public.amigo_apply(p,gen_random_uuid(),'close','{"day":"2027-01-04"}');
    raise exception using errcode='XX000', message='Missing final date accepted';
  exception when raise_exception then assert sqlerrm='Deze datum is verwijderd.'; end;
  perform public.amigo_apply(p,gen_random_uuid(),'close','{"day":"2027-01-03"}');
  assert public.amigo_read(p)->>'finalDateId'='2027-01-03';
  perform public.amigo_lock_organizer(p,logout_op);
  begin
    perform public.amigo_apply(p,gen_random_uuid(),'reopen','{}');
    raise exception using errcode='XX000', message='Signed-out organizer reopened poll';
  exception when raise_exception then assert sqlerrm='Ontgrendel eerst de bewerkmodus.'; end;
  perform public.amigo_sign_in(p,gen_random_uuid(),jsonb_build_object('name','Maker','organizerProof',repeat('a',64)));
  perform public.amigo_lock_organizer(p,logout_op);
  assert public.amigo_read(p)->>'organizer'='true';
  perform public.amigo_apply(p,gen_random_uuid(),'reopen','{}');
  perform public.amigo_edit(p,gen_random_uuid(),'{"added":["2027-01-04"],"removed":["2027-01-03"]}');
  assert public.amigo_read(p)->'dates' ? '2027-01-04';
  perform public.amigo_apply(p,gen_random_uuid(),'close','{"day":"2027-01-04"}');
  delete from amigo.polls where id=p;
  assert not exists(select from amigo.dates where poll_id=p);
end $$;

-- Optional organizer participation is authoritative and works across devices.
do $$
declare
  p uuid := pg_temp.new_poll();
  other uuid := pg_temp.join_voter(p);
  own uuid := gen_random_uuid();
  original_actor text := auth.uid()::text;
  off_op uuid := gen_random_uuid();
  response jsonb;
  participation jsonb := jsonb_build_object('voter',own,'proof',repeat('d',64),'enabled',true);
begin
  perform public.amigo_edit(p,gen_random_uuid(),jsonb_build_object('organizerParticipation',participation));
  perform public.amigo_submit_ballot(p,gen_random_uuid(),jsonb_build_object('submissionMode','online','voter',own,'proof',repeat('d',64),'changes','{"2027-01-01":"yes"}'::jsonb));
  perform public.amigo_edit(p,off_op,jsonb_build_object('organizerParticipation',participation || '{"enabled":false}'));
  assert public.amigo_read(p)->>'organizerVoter' is null;
  assert not (public.amigo_read(p)->'votes' ? own::text);
  assert public.amigo_read(p)->'votes' ? other::text;
  assert not exists(select from amigo.votes where poll_id=p and voter=own);
  assert public.amigo_read(p)->>'organizer'='true';
  perform public.amigo_edit(p,gen_random_uuid(),jsonb_build_object('organizerParticipation',participation));
  perform public.amigo_edit(p,off_op,jsonb_build_object('organizerParticipation',participation || '{"enabled":false}'));
  assert public.amigo_read(p)->>'organizerVoter'=own::text;
  assert (public.amigo_read(p)#>>array['votes',own::text,'votesJson'])::jsonb='{}'::jsonb;
  perform set_config('request.jwt.claim.sub',gen_random_uuid()::text,true);
  response := public.amigo_sign_in(p,gen_random_uuid(),jsonb_build_object('name','Maker','organizerProof',repeat('a',64)));
  assert response->>'organizer'='true' and response->>'voter'=own::text and response->>'proof'=repeat('d',64);
  perform public.amigo_apply(p,gen_random_uuid(),'removeVoter',jsonb_build_object('voter',own));
  assert public.amigo_read(p)->>'organizerVoter' is null;
  perform set_config('request.jwt.claim.sub',original_actor,true);
  p := pg_temp.new_poll(true);
  own := (public.amigo_read(p)->>'organizerVoter')::uuid;
  response := public.amigo_sign_in(p,gen_random_uuid(),jsonb_build_object('name','Maker','organizerProof',repeat('a',64)));
  assert response->>'voter'=own::text;
end $$;

-- Unique names, activity accounting and automatic cascading expiry.
do $$
declare
  p uuid := pg_temp.new_poll();
  voter uuid := pg_temp.join_voter(p);
  expired uuid := pg_temp.new_poll(true);
  baseline timestamptz := now()-interval '13 days';
begin
  begin
    perform public.amigo_sign_in(p,gen_random_uuid(),jsonb_build_object('name',' anna ','voter',gen_random_uuid(),'proof',repeat('b',64)));
    raise exception using errcode='XX000', message='Duplicate registration accepted';
  exception when raise_exception then assert sqlerrm='Deze naam is al in gebruik. Kies je bestaande stem of gebruik een andere naam.'; end;
  begin
    insert into amigo.voters(poll_id,id,name,verifier) values(p,gen_random_uuid(),' ANNA ',repeat('b',64));
    raise exception using errcode='XX000', message='Duplicate database name accepted';
  exception when unique_violation then null; end;
  update amigo.polls set last_activity_at=baseline where id=p;
  perform public.amigo_read(p);
  perform public.amigo_sign_in(p,gen_random_uuid(),jsonb_build_object('name','Maker','organizerProof',repeat('a',64)));
  perform public.amigo_edit(p,gen_random_uuid(),'{"title":"Planner test","added":[],"removed":[]}');
  assert (select last_activity_at from amigo.polls where id=p)=baseline;
  perform public.amigo_submit_ballot(p,gen_random_uuid(),jsonb_build_object('submissionMode','online','voter',voter,'proof',repeat('b',64),'changes','{"2027-01-01":"yes"}'::jsonb));
  assert (select last_activity_at from amigo.polls where id=p)>baseline;
  update amigo.polls set last_activity_at=baseline where id=p;
  perform public.amigo_submit_ballot(p,gen_random_uuid(),jsonb_build_object('submissionMode','online','voter',voter,'proof',repeat('b',64),'changes','{"2027-01-01":"yes"}'::jsonb));
  assert (select last_activity_at from amigo.polls where id=p)=baseline;
  perform public.amigo_apply(expired,gen_random_uuid(),'close','{"day":"2027-01-01"}');
  update amigo.polls set last_activity_at=now()-interval '14 days' where id=expired;
  perform amigo.delete_inactive_polls();
  assert public.amigo_read(expired) is null;
  assert public.amigo_read(p) is not null;
  assert not exists(select from amigo.voters where poll_id=expired);
  assert not exists(select from amigo.votes where poll_id=expired);
  assert not exists(select from amigo.members where poll_id=expired);
  assert not exists(select from amigo.login_receipts where poll_id=expired);
  assert (select count(*) from cron.job where jobname='amigo-delete-inactive-polls' and active)=1;
end $$;
rollback;
