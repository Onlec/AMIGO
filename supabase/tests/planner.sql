-- Run against a migrated test database using psql -v ON_ERROR_STOP=1.
begin;
-- Existing pre-migration voter, with a vote and no password.
insert into amigo.polls(id,title,verifier) values
  ('99999999-1111-4111-8111-111111111111','Oude prikker',repeat('a',64));
insert into amigo.dates(poll_id,day) values ('99999999-1111-4111-8111-111111111111','2027-01-01');
insert into amigo.voters(poll_id,id,actor,name) values
  ('99999999-1111-4111-8111-111111111111','99999999-2222-4222-8222-222222222222','11111111-1111-4111-8111-111111111111','Oude deelnemer');
insert into amigo.votes values
  ('99999999-1111-4111-8111-111111111111','99999999-2222-4222-8222-222222222222','2027-01-01','yes');
set local role authenticated;
select set_config('request.jwt.claim.sub','11111111-1111-4111-8111-111111111111',true);
do $$
declare
  p uuid := gen_random_uuid();
  op uuid := gen_random_uuid();
  voter uuid := gen_random_uuid();
  owner_id text := auth.uid()::text;
  visitor text := gen_random_uuid()::text;
  snapshot jsonb;
  create_body jsonb := jsonb_build_object('title','Test','description','','proof',repeat('a',64),
    'dates','{"2027-01-01":{"time":"12:30"},"2027-01-02":{"time":""}}'::jsonb);
begin
  perform public.amigo_apply(p,op,'create',create_body);
  perform public.amigo_apply(p,op,'create',create_body);
  snapshot := public.amigo_read(p);
  assert snapshot->>'organizer'='true' and snapshot#>>'{dates,2027-01-01,time}'='12:30';
  assert not (snapshot ? 'proof' or snapshot ? 'verifier');
  perform set_config('request.jwt.claim.sub',visitor,true);
  assert not public.amigo_can_listen('amigo:'||p);
  snapshot := public.amigo_read(p);
  assert snapshot->>'organizer'='false' and public.amigo_can_listen('amigo:'||p);
  begin
    perform public.amigo_apply(p,gen_random_uuid(),'details','{"title":"Blocked","description":""}');
    raise exception using errcode='XX000', message='Visitor edited a poll';
  exception when raise_exception then assert sqlerrm='Ontgrendel eerst de bewerkmodus.'; end;
  perform public.amigo_apply(p,gen_random_uuid(),'join',jsonb_build_object('voter',voter,'name','A','proof',repeat('b',64)));
  perform public.amigo_apply(p,gen_random_uuid(),'castVote',jsonb_build_object('proof',repeat('b',64),'day','2027-01-01','voter',voter,'name','A','value','yes'));
  perform public.amigo_apply(p,gen_random_uuid(),'castVote',jsonb_build_object('proof',repeat('b',64),'day','2027-01-02','voter',voter,'name','A','value','maybe','existing',true));
  snapshot := public.amigo_read(p);
  assert (snapshot#>>array['votes',voter::text,'votesJson'])::jsonb='{"2027-01-01":"yes","2027-01-02":"maybe"}'::jsonb;
  perform set_config('request.jwt.claim.sub',owner_id,true);
  begin
    perform public.amigo_apply(p,gen_random_uuid(),'castVote',jsonb_build_object('proof',repeat('c',64),'day','2027-01-01','voter',voter,'name','B','value','no'));
    raise exception using errcode='XX000', message='Vote ownership failed';
  exception when raise_exception then assert sqlerrm='Wachtwoord klopt niet.'; end;
  op := gen_random_uuid();
  perform public.amigo_edit(p,op,'{"title":"Bijgewerkt","added":["2027-02-03"],"removed":["2027-01-02"]}');
  perform public.amigo_edit(p,op,'{"title":"Dubbel","added":[],"removed":[]}');
  snapshot := public.amigo_read(p);
  assert snapshot->>'title'='Bijgewerkt' and snapshot#>>'{dates,2027-01-01,time}'='12:30';
  assert (snapshot->'dates') ? '2027-02-03' and not ((snapshot->'dates') ? '2027-01-02');
  assert (snapshot#>>array['votes',voter::text,'votesJson'])::jsonb='{"2027-01-01":"yes"}'::jsonb;
  perform public.amigo_apply(p,gen_random_uuid(),'removeDate','{"day":"2027-01-02"}');
  perform public.amigo_apply(p,gen_random_uuid(),'removeVoter',jsonb_build_object('voter',voter));
  perform set_config('request.jwt.claim.sub',visitor,true);
  begin
    perform public.amigo_apply(p,gen_random_uuid(),'castVote',jsonb_build_object('proof',repeat('b',64),'day','2027-01-01','voter',voter,'name','A','value','yes','existing',true));
    raise exception using errcode='XX000', message='Removed voter restored';
  exception when raise_exception then assert sqlerrm='Deze deelnemer is verwijderd.'; end;
  assert not public.amigo_unlock(p,'incorrect');
  assert public.amigo_unlock(p,repeat('a',64));
  perform public.amigo_apply(p,gen_random_uuid(),'close','{"day":"2027-01-01"}');
  snapshot := public.amigo_read(p);
  begin
    perform public.amigo_edit(p,gen_random_uuid(),'{"title":"Ongeldig","added":[],"removed":["2027-01-01"]}');
    raise exception using errcode='XX000', message='Final date removed';
  exception when raise_exception then assert sqlerrm='De gekozen datum blijft behouden.'; end;
  assert public.amigo_read(p)->>'title'='Bijgewerkt';
  assert snapshot->>'status'='closed' and snapshot->'votes'='{}'::jsonb;
  begin
    perform public.amigo_apply(p,gen_random_uuid(),'castVote',jsonb_build_object('proof',repeat('b',64),'day','2027-01-01','voter',voter,'name','A','value','yes'));
    raise exception using errcode='XX000', message='Closed poll accepted a vote';
  exception when raise_exception then assert sqlerrm='De prikker is gesloten.'; end;
end $$;
select set_config('request.jwt.claim.sub','11111111-1111-4111-8111-111111111111',true);
do $$
declare
  p uuid := '99999999-1111-4111-8111-111111111111';
  v uuid := '99999999-2222-4222-8222-222222222222';
  visitor text := gen_random_uuid()::text;
  owner_id text := auth.uid()::text;
  snapshot jsonb;
begin
  assert public.amigo_read(p)->>'ownVoter'=v::text;
  perform set_config('request.jwt.claim.sub',visitor,true);
  begin
    perform public.amigo_voter_unlock(p,v,repeat('d',64),true);
    raise exception using errcode='XX000', message='Visitor claimed a legacy voter';
  exception when raise_exception then assert sqlerrm='Stel eerst een wachtwoord in op het oorspronkelijke toestel.'; end;
  perform set_config('request.jwt.claim.sub',owner_id,true);
  perform public.amigo_voter_unlock(p,v,repeat('d',64),true);
  snapshot := public.amigo_read(p);
  assert snapshot->>'ownVoter' is null and position(repeat('d',64) in snapshot::text)=0;
  assert (snapshot#>>array['votes',v::text,'votesJson'])::jsonb='{"2027-01-01":"yes"}'::jsonb;
  begin
    perform public.amigo_apply(p,gen_random_uuid(),'vote',jsonb_build_object('day','2027-01-01','voter',v,'value','no'));
    raise exception using errcode='XX000', message='Passwordless vote accepted';
  exception when raise_exception then assert sqlerrm='Selecteer je stemmer en vul het wachtwoord in.'; end;
  perform set_config('request.jwt.claim.sub',visitor,true);
  perform public.amigo_voter_unlock(p,v,repeat('d',64),false);
  perform public.amigo_apply(p,gen_random_uuid(),'castVote',jsonb_build_object('day','2027-01-01','voter',v,'proof',repeat('d',64),'value','no'));
  assert (public.amigo_read(p)#>>array['votes',v::text,'votesJson'])::jsonb='{"2027-01-01":"no"}'::jsonb;
end $$;
do $$
declare
  p uuid := gen_random_uuid();
  v uuid := gen_random_uuid();
  op uuid := gen_random_uuid();
  b jsonb := jsonb_build_object('name','Anna','voter',v,'proof',repeat('c',64),'register',true);
  snapshot jsonb;
begin
  perform public.amigo_apply(p,gen_random_uuid(),'createPoll',jsonb_build_object('title','Kaarten','description','',
    'organizerName','Maker','proof',repeat('a',64),'dates','{"2027-01-10":{},"2027-04-12":{}}'::jsonb));
  -- Sign in/register first, without answering a date. Retries stay idempotent.
  perform public.amigo_submit_ballot(p,op,b || '{"changes":{}}');
  perform public.amigo_submit_ballot(p,op,b || '{"changes":{}}');
  assert (public.amigo_read(p)#>>array['votes',v::text,'votesJson'])::jsonb='{}'::jsonb;
  b := b || '{"register":false,"changes":{}}';
  perform public.amigo_submit_ballot(p,gen_random_uuid(),b);
  begin
    perform public.amigo_submit_ballot(p,gen_random_uuid(),b || jsonb_build_object('proof',repeat('d',64)));
    raise exception using errcode='XX000', message='Incorrect login password accepted';
  exception when raise_exception then assert sqlerrm='Wachtwoord klopt niet.'; end;
  b := b || '{"changes":{"2027-01-10":"yes"}}';
  op := gen_random_uuid();
  perform public.amigo_submit_ballot(p,op,b);
  perform public.amigo_submit_ballot(p,op,b);
  b := b || '{"register":false,"changes":{"2027-04-12":"maybe"}}';
  perform public.amigo_submit_ballot(p,gen_random_uuid(),b);
  snapshot := public.amigo_read(p);
  assert (snapshot#>>array['votes',v::text,'votesJson'])::jsonb='{"2027-01-10":"yes","2027-04-12":"maybe"}'::jsonb;
  begin
    perform public.amigo_submit_ballot(p,gen_random_uuid(),b || '{"changes":{"2027-01-10":"no","2027-05-12":"yes"}}');
    raise exception using errcode='XX000', message='Removed date accepted';
  exception when raise_exception then assert sqlerrm like 'De datum % is verwijderd.%'; end;
  assert public.amigo_read(p)=snapshot;
  -- Automatic saves can clear every answer without removing the voter.
  perform public.amigo_submit_ballot(p,gen_random_uuid(),b || '{"changes":{"2027-01-10":"none","2027-04-12":"none"}}');
  assert (public.amigo_read(p)#>>array['votes',v::text,'votesJson'])::jsonb='{}'::jsonb;
  perform public.amigo_apply(p,gen_random_uuid(),'close','{"day":"2027-01-10"}');
  begin
    perform public.amigo_submit_ballot(p,gen_random_uuid(),b);
    raise exception using errcode='XX000', message='Closed poll accepted a ballot';
  exception when raise_exception then assert sqlerrm='De prikker is gesloten of verwijderd.'; end;
end $$;
do $$
declare
  p uuid := gen_random_uuid();
  other_poll uuid := gen_random_uuid();
  voter uuid := gen_random_uuid();
  op uuid := gen_random_uuid();
  owner_id text := auth.uid()::text;
  visitor text := gen_random_uuid()::text;
  body jsonb := jsonb_build_object('title','Afmelden','description','','organizerName','Maker','proof',repeat('a',64),
    'dates','{"2027-01-01":{},"2027-01-02":{}}'::jsonb);
begin
  perform public.amigo_apply(p,gen_random_uuid(),'createPoll',body);
  perform public.amigo_apply(other_poll,gen_random_uuid(),'createPoll',body);
  perform public.amigo_submit_ballot(p,gen_random_uuid(),jsonb_build_object('voter',voter,'name','Maker',
    'proof',repeat('b',64),'register',true,'changes','{"2027-01-01":"yes"}'::jsonb));
  perform public.amigo_lock_organizer(p,op);
  perform public.amigo_lock_organizer(p,op);
  assert public.amigo_read(p)->>'organizer'='false';
  assert public.amigo_read(other_poll)->>'organizer'='true';
  assert public.amigo_can_listen('amigo:'||p);
  assert (public.amigo_read(p)#>>array['votes',voter::text,'votesJson'])::jsonb='{"2027-01-01":"yes"}'::jsonb;
  begin
    perform public.amigo_edit(p,gen_random_uuid(),'{"title":"Blocked","added":[],"removed":[]}');
    raise exception using errcode='XX000', message='Signed-out organizer edited a poll';
  exception when raise_exception then assert sqlerrm='Ontgrendel eerst de bewerkmodus.'; end;
  begin
    perform public.amigo_apply(p,gen_random_uuid(),'removeVoter',jsonb_build_object('voter',voter));
    raise exception using errcode='XX000', message='Signed-out organizer removed a voter';
  exception when raise_exception then assert sqlerrm='Ontgrendel eerst de bewerkmodus.'; end;
  assert not public.amigo_unlock(p,'incorrect');
  assert public.amigo_unlock(p,repeat('a',64));
  -- A retried old logout cannot revoke a new successful password login.
  perform public.amigo_lock_organizer(p,op);
  assert public.amigo_read(p)->>'organizer'='true';
  perform set_config('request.jwt.claim.sub',visitor,true);
  perform public.amigo_lock_organizer(p,gen_random_uuid());
  perform set_config('request.jwt.claim.sub',owner_id,true);
  assert public.amigo_read(p)->>'organizer'='true';
  -- Signing out also works after the final date has been confirmed.
  perform public.amigo_apply(p,gen_random_uuid(),'close','{"day":"2027-01-01"}');
  perform public.amigo_lock_organizer(p,gen_random_uuid());
  assert public.amigo_read(p)->>'organizer'='false';
end $$;
do $$
declare
  p uuid := gen_random_uuid();
  participating_poll uuid := gen_random_uuid();
  voter uuid := gen_random_uuid();
  organizer_voter uuid := gen_random_uuid();
  login_op uuid := gen_random_uuid();
  response jsonb;
  body jsonb := jsonb_build_object('title','Eén aanmelding','description','','organizerName','Maker',
    'proof',repeat('a',64),'dates','{"2027-01-01":{},"2027-01-02":{}}'::jsonb);
begin
  perform public.amigo_apply(p,gen_random_uuid(),'createPoll',body);
  -- A normal voter never inherits the creator browser's previous organizer role.
  response := public.amigo_sign_in(p,gen_random_uuid(),jsonb_build_object('voter',voter,'name','Deelnemer',
    'proof',repeat('b',64),'organizerProof',repeat('c',64),'register',true,'changes','{}'::jsonb));
  assert response->>'organizer'='false' and response->>'voter'=voter::text;
  assert public.amigo_read(p)->>'organizer'='false';
  response := public.amigo_sign_in(p,gen_random_uuid(),jsonb_build_object('voter',voter,'name','Deelnemer',
    'proof',repeat('b',64),'organizerProof',repeat('a',64),'register',false,'changes','{}'::jsonb));
  assert response->>'organizer'='false';
  begin
    perform public.amigo_sign_in(p,gen_random_uuid(),jsonb_build_object('voter',gen_random_uuid(),'name','Maker',
      'proof',repeat('d',64),'organizerProof',repeat('c',64),'register',true,'changes','{}'::jsonb));
    raise exception using errcode='XX000', message='Organizer name granted access without its password';
  exception when raise_exception then assert sqlerrm='Wachtwoord klopt niet.'; end;
  assert public.amigo_read(p)->>'organizer'='false';
  response := public.amigo_sign_in(p,login_op,jsonb_build_object('voter',gen_random_uuid(),'name','maker',
    'proof',repeat('d',64),'organizerProof',repeat('a',64),'register',true,'changes','{}'::jsonb));
  assert response->>'organizer'='true' and response->>'voter' is null and response->>'name'='Maker';
  assert public.amigo_read(p)->>'organizer'='true';
  assert (select count(*) from jsonb_object_keys(public.amigo_read(p)->'votes'))=1;
  perform public.amigo_lock_organizer(p,gen_random_uuid());
  -- Retrying a successful login only returns its receipt, without signing in again.
  assert public.amigo_sign_in(p,login_op,jsonb_build_object('name','Maker'))=response;
  assert public.amigo_read(p)->>'organizer'='false';
  response := public.amigo_sign_in(p,gen_random_uuid(),jsonb_build_object('voter',gen_random_uuid(),'name','Maker',
    'proof',repeat('d',64),'organizerProof',repeat('a',64),'register',true,'changes','{}'::jsonb));
  perform public.amigo_apply(p,gen_random_uuid(),'close','{"day":"2027-01-01"}');
  perform public.amigo_lock_organizer(p,gen_random_uuid());
  response := public.amigo_sign_in(p,gen_random_uuid(),jsonb_build_object('voter',gen_random_uuid(),'name','Maker',
    'proof',repeat('d',64),'organizerProof',repeat('a',64),'register',true,'changes','{}'::jsonb));
  assert response->>'organizer'='true' and response->>'voter' is null;
  response := public.amigo_sign_in(p,gen_random_uuid(),jsonb_build_object('voter',voter,'name','Deelnemer',
    'proof',repeat('b',64),'organizerProof',repeat('c',64),'register',false,'changes','{}'::jsonb));
  assert response->>'organizer'='false' and response->>'voter'=voter::text;
  assert public.amigo_read(p)->>'organizer'='false';
  -- A participating organizer authenticates both roles with the same login.
  perform public.amigo_apply(participating_poll,gen_random_uuid(),'createPoll',body || jsonb_build_object(
    'voter',organizer_voter,'voterProof',repeat('d',64)));
  response := public.amigo_sign_in(participating_poll,gen_random_uuid(),jsonb_build_object('voter',organizer_voter,'name','Maker',
    'proof',repeat('d',64),'organizerProof',repeat('a',64),'register',false,'changes','{}'::jsonb));
  assert response->>'organizer'='true' and response->>'voter'=organizer_voter::text;
end $$;
do $$
declare
  p uuid := gen_random_uuid();
  own uuid := gen_random_uuid();
  other uuid := gen_random_uuid();
  created uuid := gen_random_uuid();
  off_op uuid := gen_random_uuid();
  owner_actor text := auth.uid()::text;
  visitor text := gen_random_uuid()::text;
  response jsonb;
  body jsonb := jsonb_build_object('title','Deelname','description','','organizerName','Maker',
    'proof',repeat('a',64),'dates','{"2027-01-01":{},"2027-01-02":{}}'::jsonb);
  participation jsonb := jsonb_build_object('voter',own,'proof',repeat('b',64),'enabled',true);
begin
  perform public.amigo_apply(p,gen_random_uuid(),'createPoll',body);
  assert public.amigo_read(p)->>'organizerVoter' is null;
  perform public.amigo_submit_ballot(p,gen_random_uuid(),jsonb_build_object('voter',other,'name','Andere',
    'proof',repeat('c',64),'register',true,'changes','{"2027-01-01":"no"}'::jsonb));
  perform public.amigo_edit(p,gen_random_uuid(),jsonb_build_object('organizerParticipation',
    jsonb_build_object('voter',other,'proof',repeat('c',64),'enabled',false)));
  assert public.amigo_read(p)->'votes' ? other::text;
  perform public.amigo_edit(p,gen_random_uuid(),jsonb_build_object('organizerParticipation',participation));
  assert public.amigo_read(p)->>'organizerVoter'=own::text;
  assert (public.amigo_read(p)#>>array['votes',own::text,'votesJson'])::jsonb='{}'::jsonb;
  perform public.amigo_submit_ballot(p,gen_random_uuid(),jsonb_build_object('voter',own,'name','Maker',
    'proof',repeat('b',64),'register',false,'changes','{"2027-01-01":"yes"}'::jsonb));
  perform public.amigo_edit(p,off_op,jsonb_build_object('organizerParticipation',participation || '{"enabled":false}'));
  assert public.amigo_read(p)->>'organizerVoter' is null;
  assert not (public.amigo_read(p)->'votes' ? own::text);
  assert not exists(select from amigo.votes where poll_id=p and voter=own);
  assert public.amigo_read(p)->>'organizer'='true';
  assert (public.amigo_read(p)#>>array['votes',other::text,'votesJson'])::jsonb='{"2027-01-01":"no"}'::jsonb;
  perform public.amigo_edit(p,gen_random_uuid(),jsonb_build_object('organizerParticipation',participation));
  perform public.amigo_edit(p,off_op,jsonb_build_object('organizerParticipation',participation || '{"enabled":false}'));
  assert public.amigo_read(p)->>'organizerVoter'=own::text;
  assert (public.amigo_read(p)#>>array['votes',own::text,'votesJson'])::jsonb='{}'::jsonb;
  -- A fresh device uses the organizer password instead of the generated voter token.
  perform set_config('request.jwt.claim.sub',visitor,true);
  begin
    perform public.amigo_edit(p,gen_random_uuid(),jsonb_build_object('organizerParticipation',participation || '{"enabled":false}'));
    raise exception using errcode='XX000', message='Visitor changed organizer participation';
  exception when raise_exception then assert sqlerrm='Ontgrendel eerst de bewerkmodus.'; end;
  response := public.amigo_sign_in(p,gen_random_uuid(),jsonb_build_object('name','Maker','voter',gen_random_uuid(),
    'proof',repeat('d',64),'organizerProof',repeat('a',64),'register',true,'changes','{}'::jsonb));
  assert response->>'voter'=own::text and response->>'proof'=repeat('b',64) and response->>'organizer'='true';
  perform set_config('request.jwt.claim.sub',owner_actor,true);
  perform public.amigo_apply(created,gen_random_uuid(),'createPoll',body || jsonb_build_object('voter',own,'voterProof',repeat('b',64)));
  assert public.amigo_read(created)->>'organizerVoter'=own::text;
  -- Legacy linkage requires verified own participant credentials.
  update amigo.polls set organizer_voter_id=null where id=created;
  perform public.amigo_edit(created,gen_random_uuid(),jsonb_build_object('organizerParticipation',participation || '{"enabled":false}'));
  assert not (public.amigo_read(created)->'votes' ? own::text);
end $$;
do $$
declare
  p uuid := gen_random_uuid();
  voter uuid := gen_random_uuid();
  owner_actor text := auth.uid()::text;
  op uuid := gen_random_uuid();
begin
  perform public.amigo_apply(p,gen_random_uuid(),'createPoll',jsonb_build_object('title','Nieuwe einddatum',
    'organizerName','Maker','proof',repeat('a',64),'dates','{"2027-01-01":{},"2027-01-02":{}}'::jsonb));
  perform public.amigo_submit_ballot(p,gen_random_uuid(),jsonb_build_object('voter',voter,'name','Anna',
    'proof',repeat('b',64),'register',true,'changes','{"2027-01-01":"yes","2027-01-02":"no"}'::jsonb));
  perform public.amigo_apply(p,gen_random_uuid(),'close','{"day":"2027-01-01"}');
  perform set_config('request.jwt.claim.sub',gen_random_uuid()::text,true);
  begin
    perform public.amigo_apply(p,gen_random_uuid(),'close','{"day":"2027-01-02"}');
    raise exception using errcode='XX000', message='Visitor replaced final date';
  exception when raise_exception then assert sqlerrm='Ontgrendel eerst de bewerkmodus.'; end;
  perform set_config('request.jwt.claim.sub',owner_actor,true);
  begin
    perform public.amigo_apply(p,gen_random_uuid(),'close','{"day":"2027-01-03"}');
    raise exception using errcode='XX000', message='Missing replacement date accepted';
  exception when raise_exception then assert sqlerrm='Deze datum is verwijderd.'; end;
  assert public.amigo_read(p)->>'finalDateId'='2027-01-01';
  perform public.amigo_apply(p,op,'close','{"day":"2027-01-02"}');
  assert public.amigo_read(p)->>'finalDateId'='2027-01-02';
  assert public.amigo_read(p)->>'status'='closed';
  assert (public.amigo_read(p)#>>array['votes',voter::text,'votesJson'])::jsonb='{"2027-01-01":"yes","2027-01-02":"no"}'::jsonb;
  perform public.amigo_apply(p,gen_random_uuid(),'close','{"day":"2027-01-01"}');
  perform public.amigo_apply(p,op,'close','{"day":"2027-01-02"}');
  assert public.amigo_read(p)->>'finalDateId'='2027-01-01';
end $$;
do $$
declare
  p uuid := gen_random_uuid();
  voter uuid := gen_random_uuid();
  owner_actor text := auth.uid()::text;
  op uuid := gen_random_uuid();
  close_op uuid := gen_random_uuid();
  snapshot jsonb;
begin
  perform public.amigo_apply(p,gen_random_uuid(),'createPoll',jsonb_build_object('title','Heropenen',
    'organizerName','Maker','proof',repeat('a',64),'dates','{"2027-01-01":{},"2027-01-02":{}}'::jsonb));
  perform public.amigo_submit_ballot(p,gen_random_uuid(),jsonb_build_object('voter',voter,'name','Anna',
    'proof',repeat('b',64),'register',true,'changes','{"2027-01-01":"yes"}'::jsonb));
  perform public.amigo_apply(p,close_op,'close','{"day":"2027-01-01"}');
  snapshot := public.amigo_read(p);
  perform set_config('request.jwt.claim.sub',gen_random_uuid()::text,true);
  begin
    perform public.amigo_apply(p,gen_random_uuid(),'reopen','{}');
    raise exception using errcode='XX000', message='Visitor reopened poll';
  exception when raise_exception then assert sqlerrm='Ontgrendel eerst de bewerkmodus.'; end;
  perform set_config('request.jwt.claim.sub',owner_actor,true);
  assert public.amigo_read(p)=snapshot;
  perform public.amigo_apply(p,op,'reopen','{}');
  assert public.amigo_read(p)->>'finalDateId' is null;
  assert public.amigo_read(p)->>'status'='open';
  assert public.amigo_read(p)->'votes'=snapshot->'votes';
  assert public.amigo_read(p)->'dates'=snapshot->'dates';
  assert public.amigo_read(p)->>'organizer'='true';
  -- Retrying the old close must not close the reopened poll.
  perform public.amigo_apply(p,close_op,'close','{"day":"2027-01-01"}');
  assert public.amigo_read(p)->>'status'='open';
  perform public.amigo_submit_ballot(p,gen_random_uuid(),jsonb_build_object('voter',voter,'name','Anna',
    'proof',repeat('b',64),'register',false,'changes','{"2027-01-02":"yes"}'::jsonb));
  assert (public.amigo_read(p)#>>array['votes',voter::text,'votesJson'])::jsonb='{"2027-01-01":"yes","2027-01-02":"yes"}'::jsonb;
  perform public.amigo_apply(p,gen_random_uuid(),'close','{"day":"2027-01-02"}');
  -- Retrying the old reopen must not undo the new final date.
  perform public.amigo_apply(p,op,'reopen','{}');
  assert public.amigo_read(p)->>'finalDateId'='2027-01-02';
end $$;
do $$
declare
  expired uuid := gen_random_uuid();
  closed_expired uuid := gen_random_uuid();
  active_poll uuid := gen_random_uuid();
  recent_poll uuid := gen_random_uuid();
  participant uuid := gen_random_uuid();
  active_voter uuid := gen_random_uuid();
  baseline timestamptz := now() - interval '13 days';
  body jsonb := jsonb_build_object('title','Bewaartermijn','organizerName','Maker','proof',repeat('a',64),
    'dates','{"2027-01-01":{},"2027-01-02":{}}'::jsonb);
begin
  assert not has_function_privilege('authenticated','amigo.delete_inactive_polls()','execute');
  assert not has_function_privilege('anon','amigo.delete_inactive_polls()','execute');
  assert (select count(*) from cron.job where jobname='amigo-delete-inactive-polls' and active)=1;
  perform public.amigo_apply(expired,gen_random_uuid(),'createPoll',body || jsonb_build_object(
    'voter',participant,'voterProof',repeat('b',64)));
  perform public.amigo_submit_ballot(expired,gen_random_uuid(),jsonb_build_object('name','Maker',
    'voter',participant,'proof',repeat('b',64),'register',false,'changes','{"2027-01-01":"yes"}'::jsonb));
  perform public.amigo_sign_in(expired,gen_random_uuid(),jsonb_build_object('name','Maker',
    'voter',participant,'proof',repeat('b',64),'organizerProof',repeat('a',64),'register',false,'changes','{}'::jsonb));
  perform public.amigo_apply(closed_expired,gen_random_uuid(),'createPoll',body);
  perform public.amigo_apply(closed_expired,gen_random_uuid(),'close','{"day":"2027-01-01"}');
  perform public.amigo_apply(active_poll,gen_random_uuid(),'createPoll',body);
  perform public.amigo_apply(recent_poll,gen_random_uuid(),'createPoll',body);

  update amigo.polls set last_activity_at=baseline where id=recent_poll;
  perform public.amigo_read(recent_poll);
  perform public.amigo_sign_in(recent_poll,gen_random_uuid(),jsonb_build_object('name','Maker',
    'voter',gen_random_uuid(),'proof',repeat('c',64),'organizerProof',repeat('a',64),
    'register',true,'changes','{}'::jsonb));
  perform public.amigo_lock_organizer(recent_poll,gen_random_uuid());
  assert (select last_activity_at from amigo.polls where id=recent_poll)=baseline;
  assert public.amigo_unlock(recent_poll,repeat('a',64));
  perform public.amigo_edit(recent_poll,gen_random_uuid(),'{"title":"Bewaartermijn","added":[],"removed":[]}');
  assert (select last_activity_at from amigo.polls where id=recent_poll)=baseline;
  perform public.amigo_edit(recent_poll,gen_random_uuid(),'{"title":"Nieuwe titel","added":[],"removed":[]}');
  assert (select last_activity_at from amigo.polls where id=recent_poll)>baseline;

  perform public.amigo_submit_ballot(active_poll,gen_random_uuid(),jsonb_build_object('name','Anna',
    'voter',active_voter,'proof',repeat('d',64),'register',true,'changes','{"2027-01-01":"yes"}'::jsonb));
  update amigo.polls set last_activity_at=baseline where id=active_poll;
  perform public.amigo_submit_ballot(active_poll,gen_random_uuid(),jsonb_build_object('name','Anna',
    'voter',active_voter,'proof',repeat('d',64),'register',false,'changes','{"2027-01-01":"yes"}'::jsonb));
  assert (select last_activity_at from amigo.polls where id=active_poll)=baseline;
  perform public.amigo_apply(active_poll,gen_random_uuid(),'addDate','{"day":"2027-01-03"}');
  assert (select last_activity_at from amigo.polls where id=active_poll)>baseline;
  update amigo.polls set last_activity_at=now()-interval '15 days' where id=active_poll;
  perform public.amigo_submit_ballot(active_poll,gen_random_uuid(),jsonb_build_object('name','Anna',
    'voter',active_voter,'proof',repeat('d',64),'register',false,'changes','{"2027-01-02":"no"}'::jsonb));
  assert (select last_activity_at from amigo.polls where id=active_poll)>=now();

  update amigo.polls set last_activity_at=baseline where id=recent_poll;
  update amigo.polls set last_activity_at=now()-interval '14 days' where id=expired;
  update amigo.polls set last_activity_at=now()-interval '15 days' where id=closed_expired;
  perform amigo.delete_inactive_polls();
  assert public.amigo_read(expired) is null;
  assert public.amigo_read(closed_expired) is null;
  assert public.amigo_read(active_poll) is not null;
  assert public.amigo_read(recent_poll) is not null;
  assert not exists(select from amigo.dates where poll_id=expired);
  assert not exists(select from amigo.voters where poll_id=expired);
  assert not exists(select from amigo.votes where poll_id=expired);
  assert not exists(select from amigo.members where poll_id=expired);
  assert not exists(select from amigo.login_receipts where poll_id=expired);
end $$;
rollback;
