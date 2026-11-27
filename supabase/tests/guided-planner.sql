begin;
select set_config('request.jwt.claim.sub','11111111-1111-4111-8111-111111111111',true);
do $$
declare p uuid:=gen_random_uuid(); v uuid:=gen_random_uuid(); op uuid:=gen_random_uuid(); result jsonb; before_stats jsonb:=public.amigo_statistics(); next_op uuid;
begin
  assert not has_table_privilege('authenticated','amigo.action_receipts','select');
  assert not has_function_privilege('anon','public.amigo_action(uuid,uuid,text,jsonb)','execute');
  result:=public.amigo_action(p,op,'createPoll',jsonb_build_object('title','One date','organizerName','Maker','proof',repeat('a',64),
    'voter',v,'voterProof',repeat('b',64),'timesEnabled',false,'dates','{"2027-01-04":{"time":"18:00"}}'::jsonb));
  assert (result->>'accepted')::boolean;
  assert result#>>'{poll,dates,2027-01-04,time}'='';
  assert (public.amigo_statistics()->>'newPlanners')::bigint=(before_stats->>'newPlanners')::bigint+1;
  assert (public.amigo_statistics()->>'singleDatePlanners')::bigint=(before_stats->>'singleDatePlanners')::bigint+1;
  assert (public.amigo_statistics()->>'untimedPlanners')::bigint=(before_stats->>'untimedPlanners')::bigint+1;
  perform public.amigo_action(p,op,'createPoll','{}');
  assert (public.amigo_statistics()->>'newPlanners')::bigint=(before_stats->>'newPlanners')::bigint+1;
  assert (public.amigo_action_status(p,op)->>'accepted')::boolean;
  perform set_config('request.jwt.claim.sub','22222222-2222-4222-8222-222222222222',true);
  assert not (public.amigo_action_status(p,op)->>'accepted')::boolean;
  begin
    perform public.amigo_action(p,gen_random_uuid(),'edit','{"title":"Forbidden"}');
    assert false,'Other actors cannot edit';
  exception when raise_exception then assert sqlerrm='Ontgrendel eerst de bewerkmodus.'; end;
  perform set_config('request.jwt.claim.sub','11111111-1111-4111-8111-111111111111',true);
  perform public.amigo_submit_ballot(p,gen_random_uuid(),jsonb_build_object('voter',v,'proof',repeat('b',64),'submissionMode','online',
    'expectedTimes','{"2027-01-04":""}'::jsonb,'changes','{"2027-01-04":"yes"}'::jsonb));
  next_op:=gen_random_uuid();
  result:=public.amigo_action(p,next_op,'edit','{"timesEnabled":true,"times":{"2027-01-04":"18:00"},"defaultTime":"18:00","added":["2027-01-05"]}');
  assert false,'Every selected date needs a time';
exception when raise_exception then
  assert sqlerrm='Vul een tijdstip in voor elke datum.';
  -- The failed block, including creation, rolls back completely.
  assert not exists(select from amigo.polls where id=p);
  assert public.amigo_statistics()=before_stats;
end $$;

do $$
declare p uuid:=gen_random_uuid(); v uuid:=gen_random_uuid(); op uuid:=gen_random_uuid(); result jsonb; before_stats jsonb:=public.amigo_statistics();
begin
  result:=public.amigo_action(p,op,'createPoll',jsonb_build_object('title','Timed','organizerName','Maker','proof',repeat('a',64),
    'voter',v,'voterProof',repeat('b',64),'timesEnabled',true,'defaultTime','18:00',
    'dates','{"2027-01-04":{"time":"18:00"},"2027-01-05":{"time":"18:00"}}'::jsonb));
  assert (public.amigo_statistics()->>'multiDateTimedPlanners')::bigint=(before_stats->>'multiDateTimedPlanners')::bigint+1;
  assert (public.amigo_statistics()->>'uniformTimePlanners')::bigint=(before_stats->>'uniformTimePlanners')::bigint+1;
  assert (public.amigo_statistics()->>'initialDateOptions')::bigint=(before_stats->>'initialDateOptions')::bigint+2;
  perform public.amigo_submit_ballot(p,gen_random_uuid(),jsonb_build_object('voter',v,'proof',repeat('b',64),'submissionMode','online',
    'expectedTimes','{"2027-01-04":"18:00","2027-01-05":"18:00"}'::jsonb,'changes','{"2027-01-04":"yes","2027-01-05":"no"}'::jsonb));
  result:=public.amigo_action(p,gen_random_uuid(),'edit','{"times":{"2027-01-04":"19:00","2027-01-05":"18:00"}}');
  assert not exists(select from amigo.votes where poll_id=p and day='2027-01-04');
  assert exists(select from amigo.votes where poll_id=p and day='2027-01-05' and value='no');
  assert result#>>'{poll,dates,2027-01-04,time}'='19:00';
  begin
    perform public.amigo_submit_ballot(p,gen_random_uuid(),jsonb_build_object('voter',v,'proof',repeat('b',64),'submissionMode','online',
      'expectedTimes','{"2027-01-04":"18:00"}'::jsonb,'changes','{"2027-01-04":"yes"}'::jsonb));
    assert false,'A vote for an old time is rejected';
  exception when raise_exception then assert sqlerrm='Het tijdstip is gewijzigd. Controleer de datum opnieuw.'; end;
  perform public.amigo_action(p,gen_random_uuid(),'edit','{"timesEnabled":false}');
  assert not exists(select from amigo.dates where poll_id=p and clock is not null);
  assert not exists(select from amigo.votes where poll_id=p);
  perform public.amigo_action(p,gen_random_uuid(),'edit','{"removed":["2027-01-05"]}');
  assert (select count(*) from amigo.dates where poll_id=p)=1;
  begin
    perform public.amigo_action(p,gen_random_uuid(),'edit','{"removed":["2027-01-04"]}');
    assert false,'Cannot delete the last date';
  exception when raise_exception then assert sqlerrm='Kies minstens één datum.'; end;
  perform public.amigo_action(p,gen_random_uuid(),'close','{"day":"2027-01-04"}');
  begin
    perform public.amigo_action(p,gen_random_uuid(),'edit','{"timesEnabled":true,"times":{"2027-01-04":"20:00"}}');
    assert false,'Closed planners lock time changes';
  exception when raise_exception then assert sqlerrm='Heropen de poll om datums aan te passen.'; end;
  perform public.amigo_action(p,gen_random_uuid(),'edit','{"title":"A closed title"}');
  result:=public.amigo_statistics();
  delete from amigo.polls where id=p;
  assert public.amigo_statistics()=result;
  assert not exists(select from amigo.action_receipts where poll_id=p);
end $$;
rollback;
