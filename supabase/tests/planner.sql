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
rollback;
