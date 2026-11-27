-- Local/test databases only. Every action below is rolled back.
begin;
select set_config('request.jwt.claim.sub','11111111-1111-4111-8111-111111111111',true);

do $$
declare
  p uuid := gen_random_uuid();
  own uuid := gen_random_uuid();
  guest uuid := gen_random_uuid();
  operation uuid := gen_random_uuid();
  body jsonb;
  before_stats jsonb := public.amigo_statistics();
  after_stats jsonb;
begin
  assert has_function_privilege('anon','public.amigo_statistics()','execute');
  assert has_function_privilege('authenticated','public.amigo_statistics()','execute');
  assert not has_table_privilege('anon','amigo.statistics','select');
  assert not has_table_privilege('authenticated','amigo.statistics','update');
  assert not has_function_privilege('authenticated','amigo.count_statistics()','execute');
  assert (select count(*) from jsonb_object_keys(before_stats))=17;
  assert not (before_stats ?| array['pollId','name','title','description','verifier','actor']);

  body := jsonb_build_object('title','Statistics regression','description','Private description',
    'organizerName','Private name','proof',repeat('a',64),'voter',own,'voterProof',repeat('b',64),
    'dates','{"2027-01-02":{},"2027-01-04":{}}'::jsonb);
  perform public.amigo_apply(p,operation,'createPoll',body);
  perform public.amigo_apply(p,operation,'createPoll',body);
  assert (public.amigo_statistics()->>'planners')::bigint=(before_stats->>'planners')::bigint+1;
  assert (public.amigo_statistics()->>'registrations')::bigint=(before_stats->>'registrations')::bigint+1;
  operation := gen_random_uuid();
  body := jsonb_build_object('voter',guest,'name','Guest','proof',repeat('c',64));
  perform set_config('request.jwt.claim.sub','22222222-2222-4222-8222-222222222222',true);
  perform public.amigo_sign_in(p,operation,body);
  perform public.amigo_sign_in(p,operation,body);
  perform public.amigo_sign_in(p,gen_random_uuid(),body);
  perform set_config('request.jwt.claim.sub','11111111-1111-4111-8111-111111111111',true);
  assert (public.amigo_statistics()->>'registrations')::bigint=(before_stats->>'registrations')::bigint+2;

  operation := gen_random_uuid();
  body := jsonb_build_object('voter',own,'proof',repeat('b',64),'submissionMode','online',
    'changes','{"2027-01-02":"yes","2027-01-04":"no"}'::jsonb);
  perform public.amigo_submit_ballot(p,operation,body);
  perform public.amigo_submit_ballot(p,operation,body);
  perform public.amigo_submit_ballot(p,gen_random_uuid(),body);
  assert (public.amigo_statistics()->>'answers')::bigint=(before_stats->>'answers')::bigint+2;
  assert (public.amigo_statistics()->>'mondayAnswers')::bigint=(before_stats->>'mondayAnswers')::bigint+1;
  assert (public.amigo_statistics()->>'mondayNoAnswers')::bigint=(before_stats->>'mondayNoAnswers')::bigint+1;

  body := jsonb_set(body,'{changes}','{"2027-01-04":"maybe"}');
  perform public.amigo_submit_ballot(p,gen_random_uuid(),body);
  after_stats := public.amigo_statistics();
  assert (after_stats->>'answers')::bigint=(before_stats->>'answers')::bigint+3;
  assert (after_stats->>'maybeAnswers')::bigint=(before_stats->>'maybeAnswers')::bigint+1;
  assert (after_stats->>'mondayAnswers')::bigint=(before_stats->>'mondayAnswers')::bigint+2;

  -- Clearing and failed/rolled-back writes do not create answer events.
  perform public.amigo_submit_ballot(p,gen_random_uuid(),jsonb_set(body,'{changes}','{"2027-01-04":"none"}'));
  assert public.amigo_statistics()=after_stats;
  begin
    perform public.amigo_submit_ballot(p,gen_random_uuid(),jsonb_set(body,'{changes}','{"2027-01-02":"no","2027-01-05":"yes"}'));
    assert false, 'An invalid date should roll back the complete vote';
  exception when raise_exception then
    assert sqlerrm like 'De datum %';
  end;
  assert public.amigo_statistics()=after_stats;

  -- Every registered voter must actually say yes, including the organizer.
  perform public.amigo_submit_ballot(p,gen_random_uuid(),jsonb_build_object('voter',guest,'proof',repeat('c',64),
    'submissionMode','online','changes','{"2027-01-02":"yes"}'::jsonb));
  operation := gen_random_uuid();
  perform public.amigo_apply(p,operation,'close','{"day":"2027-01-02"}');
  after_stats := public.amigo_statistics();
  assert (after_stats->>'finalizedPlanners')::bigint=(before_stats->>'finalizedPlanners')::bigint+1;
  assert (after_stats->>'weekendDates')::bigint=(before_stats->>'weekendDates')::bigint+1;
  assert (after_stats->>'unanimousDates')::bigint=(before_stats->>'unanimousDates')::bigint+1;
  perform public.amigo_apply(p,operation,'close','{"day":"2027-01-02"}');
  perform public.amigo_apply(p,gen_random_uuid(),'reopen','{}');
  perform public.amigo_apply(p,gen_random_uuid(),'close','{"day":"2027-01-04"}');
  assert public.amigo_statistics()=after_stats;

  update amigo.polls set last_activity_at=now()-interval '15 days' where id=p;
  perform amigo.delete_inactive_polls();
  assert not exists(select from amigo.polls where id=p);
  assert public.amigo_statistics()=after_stats;
  assert position('Private' in after_stats::text)=0;
end $$;

-- A single person does not qualify as unanimous; an unanswered person does not either.
do $$
declare
  p uuid := gen_random_uuid();
  own uuid := gen_random_uuid();
  before_stats jsonb := public.amigo_statistics();
begin
  perform public.amigo_apply(p,gen_random_uuid(),'createPoll',jsonb_build_object(
    'title','Single voter','description','','organizerName','Maker','proof',repeat('a',64),
    'voter',own,'voterProof',repeat('b',64),'dates','{"2027-01-04":{},"2027-01-05":{}}'::jsonb));
  perform public.amigo_submit_ballot(p,gen_random_uuid(),jsonb_build_object('voter',own,'proof',repeat('b',64),
    'submissionMode','online','changes','{"2027-01-04":"yes"}'::jsonb));
  perform public.amigo_apply(p,gen_random_uuid(),'close','{"day":"2027-01-04"}');
  assert (public.amigo_statistics()->>'unanimousDates')::bigint=(before_stats->>'unanimousDates')::bigint;
  assert (public.amigo_statistics()->>'weekendDates')::bigint=(before_stats->>'weekendDates')::bigint;
  p := gen_random_uuid(); own := gen_random_uuid();
  perform public.amigo_apply(p,gen_random_uuid(),'createPoll',jsonb_build_object(
    'title','Unanswered guest','description','','organizerName','Maker','proof',repeat('a',64),
    'voter',own,'voterProof',repeat('b',64),'dates','{"2027-01-04":{},"2027-01-05":{}}'::jsonb));
  perform set_config('request.jwt.claim.sub','22222222-2222-4222-8222-222222222222',true);
  perform public.amigo_sign_in(p,gen_random_uuid(),jsonb_build_object('voter',gen_random_uuid(),'name','No answer','proof',repeat('c',64)));
  perform set_config('request.jwt.claim.sub','11111111-1111-4111-8111-111111111111',true);
  perform public.amigo_submit_ballot(p,gen_random_uuid(),jsonb_build_object('voter',own,'proof',repeat('b',64),
    'submissionMode','online','changes','{"2027-01-04":"yes"}'::jsonb));
  perform public.amigo_apply(p,gen_random_uuid(),'close','{"day":"2027-01-04"}');
  assert (public.amigo_statistics()->>'unanimousDates')::bigint=(before_stats->>'unanimousDates')::bigint;
end $$;

set local role anon;
select public.amigo_statistics();
reset role;
set local role authenticated;
select public.amigo_statistics();
reset role;

rollback;
