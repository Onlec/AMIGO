-- Confirmed online actions, optional times and creation-cohort statistics.
begin;

alter table amigo.polls add column times_enabled boolean not null default false;
alter table amigo.polls add column default_time time;
alter table amigo.polls add column planning_stats_counted boolean not null default false;
update amigo.polls p set times_enabled=exists(select from amigo.dates where poll_id=p.id and clock is not null);

alter table amigo.statistics add column planning_started_at timestamptz not null default now();
alter table amigo.statistics add column new_planners bigint not null default 0;
alter table amigo.statistics add column single_date_planners bigint not null default 0;
alter table amigo.statistics add column untimed_planners bigint not null default 0;
alter table amigo.statistics add column multi_date_timed_planners bigint not null default 0;
alter table amigo.statistics add column uniform_time_planners bigint not null default 0;
alter table amigo.statistics add column initial_date_options bigint not null default 0;

create table amigo.action_receipts (
  actor uuid not null,
  operation uuid not null,
  poll_id uuid not null references amigo.polls on delete cascade,
  kind text not null,
  session jsonb,
  primary key(actor,operation)
);
revoke all on amigo.action_receipts from public, anon, authenticated;

create function amigo.parse_planner_time(value text) returns time
language plpgsql immutable set search_path='' as $$
begin
  if value is null or value='' then return null; end if;
  if value !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' then raise exception 'Vul een geldig tijdstip in.'; end if;
  return value::time;
end $$;
revoke all on function amigo.parse_planner_time(text) from public, anon, authenticated;

create or replace function public.amigo_apply(p uuid, operation uuid, kind text, body jsonb) returns void
language plpgsql security definer set search_path='' as $$
declare
  actor_id uuid := auth.uid();
  target_voter uuid := (body->>'voter')::uuid;
  enabled boolean;
begin
  if actor_id is null then raise exception 'Sessie ontbreekt.'; end if;
  if kind is null or kind not in ('createPoll','removeVoter','close','reopen') then raise exception 'Onbekende wijziging.'; end if;
  insert into amigo.receipts values(actor_id,operation) on conflict do nothing;
  if not found then return; end if;
  if kind='createPoll' then
    if nullif(trim(body->>'organizerName'),'') is null then raise exception 'Vul je naam in.'; end if;
    enabled := coalesce((body->>'timesEnabled')::boolean,
      exists(select from jsonb_each(body->'dates') where nullif(value->>'time','') is not null));
    insert into amigo.polls(id,title,description,verifier,organizer_name,times_enabled,default_time)
      values(p,body->>'title',coalesce(body->>'description',''),body->>'proof',trim(body->>'organizerName'),enabled,
        case when enabled then amigo.parse_planner_time(body->>'defaultTime') end);
    if target_voter is not null then
      perform amigo.register_voter(p,target_voter,body->>'organizerName',body->>'voterProof');
      update amigo.polls set organizer_voter_id=target_voter where id=p;
    end if;
    insert into amigo.dates(poll_id,day,clock)
      select p,key::date,case when enabled then amigo.parse_planner_time(value->>'time') end from jsonb_each(body->'dates');
    if not exists(select from amigo.dates where poll_id=p) then raise exception 'Kies minstens één datum.'; end if;
    if body ? 'timesEnabled' and enabled and exists(select from amigo.dates where poll_id=p and clock is null)
      then raise exception 'Vul een tijdstip in voor elke datum.'; end if;
    insert into amigo.members values(p,actor_id,true);
  else
    perform 1 from amigo.polls where id=p for update;
    if not found then raise exception 'Prikker niet gevonden.'; end if;
    if not exists(select from amigo.members where poll_id=p and actor=actor_id and organizer)
      then raise exception 'Ontgrendel eerst de bewerkmodus.'; end if;
    case kind
      when 'removeVoter' then
        update amigo.polls set organizer_voter_id=null where id=p and organizer_voter_id=target_voter;
        delete from amigo.voters where poll_id=p and id=target_voter;
      when 'reopen' then update amigo.polls set final_date=null where id=p;
      when 'close' then
        if not exists(select from amigo.dates where poll_id=p and day=(body->>'day')::date) then raise exception 'Deze datum is verwijderd.'; end if;
        update amigo.polls set final_date=(body->>'day')::date where id=p;
    end case;
  end if;
  perform realtime.send('{}'::jsonb,'changed','amigo:'||p::text,true);
end $$;

create or replace function public.amigo_edit(p uuid, operation uuid, body jsonb) returns void
language plpgsql security definer set search_path='' as $$
declare
  actor_id uuid := auth.uid();
  current_poll amigo.polls;
  participation jsonb := body->'organizerParticipation';
  owner_id uuid;
  enabled boolean;
  date_changes boolean;
begin
  if actor_id is null then raise exception 'Sessie ontbreekt.'; end if;
  select * into current_poll from amigo.polls where id=p for update;
  if not found then raise exception 'Prikker niet gevonden.'; end if;
  if not exists(select from amigo.members where poll_id=p and actor=actor_id and organizer)
    then raise exception 'Ontgrendel eerst de bewerkmodus.'; end if;
  insert into amigo.receipts values(actor_id,operation) on conflict do nothing;
  if not found then return; end if;
  date_changes := coalesce(jsonb_array_length(body->'added'),0)>0 or coalesce(jsonb_array_length(body->'removed'),0)>0
    or body ? 'times' or body ? 'timesEnabled' or body ? 'defaultTime';
  if date_changes and current_poll.final_date is not null then raise exception 'Heropen de poll om datums aan te passen.'; end if;
  update amigo.polls set title=coalesce(body->>'title',title),description=coalesce(body->>'description',description) where id=p;
  if date_changes then
    enabled := coalesce((body->>'timesEnabled')::boolean,current_poll.times_enabled);
    delete from amigo.dates where poll_id=p and day in(select value::date from jsonb_array_elements_text(body->'removed'));
    insert into amigo.dates(poll_id,day) select p,value::date from jsonb_array_elements_text(body->'added') on conflict do nothing;
    if not exists(select from amigo.dates where poll_id=p) then raise exception 'Kies minstens één datum.'; end if;
    -- Wiping only answers for changed times is part of this same transaction.
    delete from amigo.votes v using amigo.dates d where d.poll_id=p and v.poll_id=p and v.day=d.day
      and d.clock is distinct from case when not enabled then null when body ? 'times'
        then amigo.parse_planner_time(body->'times'->>d.day::text) else d.clock end;
    update amigo.dates d set clock=case when not enabled then null when body ? 'times'
      then amigo.parse_planner_time(body->'times'->>d.day::text) else d.clock end where poll_id=p;
    if enabled and exists(select from amigo.dates where poll_id=p and clock is null)
      then raise exception 'Vul een tijdstip in voor elke datum.'; end if;
    update amigo.polls set times_enabled=enabled,default_time=case when not enabled then null
      when body ? 'defaultTime' then amigo.parse_planner_time(body->>'defaultTime') else default_time end where id=p;
  end if;
  if participation is not null then
    owner_id := current_poll.organizer_voter_id;
    if not exists(select from amigo.voters where poll_id=p and id=owner_id) then owner_id := null; end if;
    if (participation->>'enabled')::boolean then
      if owner_id is null then
        if current_poll.final_date is not null then raise exception 'De prikker is gesloten.'; end if;
        owner_id := (participation->>'voter')::uuid;
        perform amigo.register_voter(p,owner_id,current_poll.organizer_name,participation->>'proof');
      end if;
    else
      delete from amigo.voters where poll_id=p and id=owner_id;
      owner_id := null;
    end if;
    update amigo.polls set organizer_voter_id=owner_id where id=p;
  end if;
  perform realtime.send('{}'::jsonb,'changed','amigo:'||p::text,true);
end $$;

alter function public.amigo_read(uuid) set schema amigo;
alter function amigo.amigo_read(uuid) rename to read_core;
revoke all on function amigo.read_core(uuid) from public,anon,authenticated;
create function public.amigo_read(p uuid) returns jsonb
language sql security definer set search_path='' as $$
  select amigo.read_core(p) || (select jsonb_build_object('timesEnabled',times_enabled,
    'defaultTime',coalesce(to_char(default_time,'HH24:MI'),'')) from amigo.polls where id=p);
$$;
revoke all on function public.amigo_read(uuid) from public,anon;
grant execute on function public.amigo_read(uuid) to authenticated;

create function public.amigo_action_status(p uuid, operation uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare receipt amigo.action_receipts; snapshot jsonb; identity jsonb;
begin
  if auth.uid() is null then raise exception 'Sessie ontbreekt.'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(auth.uid()::text||operation::text,0));
  select * into receipt from amigo.action_receipts r where r.actor=auth.uid() and r.operation=amigo_action_status.operation and r.poll_id=p;
  if not found then return jsonb_build_object('accepted',false); end if;
  snapshot := public.amigo_read(p);
  identity := receipt.session;
  if identity is not null and not coalesce((snapshot->>'organizer')::boolean,false) then
    identity := identity || jsonb_build_object('organizer',false);
  end if;
  return jsonb_build_object('accepted',true,'poll',snapshot,'session',identity);
end $$;
revoke all on function public.amigo_action_status(uuid,uuid) from public,anon;
grant execute on function public.amigo_action_status(uuid,uuid) to authenticated;

create function public.amigo_action(p uuid, operation uuid, kind text, body jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare identity jsonb; accepted jsonb; options bigint; enabled boolean; uniform boolean;
begin
  if auth.uid() is null then raise exception 'Sessie ontbreekt.'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(auth.uid()::text||operation::text,0));
  select public.amigo_action_status(p,operation) into accepted;
  if (accepted->>'accepted')::boolean then
    if not exists(select from amigo.action_receipts r where r.actor=auth.uid() and r.operation=amigo_action.operation and r.kind=amigo_action.kind)
      then raise exception 'Deze opdracht is niet geldig.'; end if;
    return accepted;
  end if;
  if exists(select from amigo.action_receipts r where r.actor=auth.uid() and r.operation=amigo_action.operation)
    then raise exception 'Deze opdracht is niet geldig.'; end if;
  case kind
    when 'signIn' then
      identity := public.amigo_sign_in(p,operation,body);
      if identity->>'voter' is not null then
        identity := identity || jsonb_build_object('proof',(select verifier from amigo.voters where poll_id=p and id=(identity->>'voter')::uuid));
      end if;
    when 'edit' then perform public.amigo_edit(p,operation,body);
    when 'lockOrganizer' then perform public.amigo_lock_organizer(p,operation);
    else perform public.amigo_apply(p,operation,kind,body);
  end case;
  if kind='createPoll' then
    select jsonb_build_object('voter',organizer_voter_id,'name',organizer_name,'organizer',true) into identity from amigo.polls where id=p;
    if identity->>'voter' is not null then
      identity := identity || jsonb_build_object('proof',(select verifier from amigo.voters where poll_id=p and id=(identity->>'voter')::uuid));
    end if;
    update amigo.polls set planning_stats_counted=true where id=p and not planning_stats_counted returning times_enabled into enabled;
    if found then
      select count(*),count(distinct clock)=1 and count(clock)=count(*) into options,uniform from amigo.dates where poll_id=p;
      update amigo.statistics set new_planners=new_planners+1, initial_date_options=initial_date_options+options,
        single_date_planners=single_date_planners+case when options=1 then 1 else 0 end,
        untimed_planners=untimed_planners+case when not enabled then 1 else 0 end,
        multi_date_timed_planners=multi_date_timed_planners+case when enabled and options>1 then 1 else 0 end,
        uniform_time_planners=uniform_time_planners+case when enabled and options>1 and uniform then 1 else 0 end where singleton;
    end if;
  end if;
  insert into amigo.action_receipts values(auth.uid(),operation,p,kind,identity);
  return public.amigo_action_status(p,operation);
end $$;
revoke all on function public.amigo_action(uuid,uuid,text,jsonb) from public,anon;
grant execute on function public.amigo_action(uuid,uuid,text,jsonb) to authenticated;

-- A vote for a previous time must never silently become a vote for a new time.
alter function public.amigo_submit_ballot(uuid,uuid,jsonb) set schema amigo;
alter function amigo.amigo_submit_ballot(uuid,uuid,jsonb) rename to submit_ballot_core;
revoke all on function amigo.submit_ballot_core(uuid,uuid,jsonb) from public,anon,authenticated;
create function public.amigo_submit_ballot(p uuid, operation uuid, body jsonb) returns void
language plpgsql security definer set search_path='' as $$
declare item record;
begin
  if auth.uid() is null then raise exception 'Sessie ontbreekt.'; end if;
  perform 1 from amigo.polls where id=p for update;
  if body ? 'expectedTimes' then
    for item in select * from jsonb_each_text(body->'changes') loop
      if not exists(select from amigo.dates where poll_id=p and day=item.key::date
        and coalesce(to_char(clock,'HH24:MI'),'')=body->'expectedTimes'->>item.key)
        then raise exception 'Het tijdstip is gewijzigd. Controleer de datum opnieuw.'; end if;
    end loop;
  end if;
  perform amigo.submit_ballot_core(p,operation,body);
end $$;
revoke all on function public.amigo_submit_ballot(uuid,uuid,jsonb) from public,anon;
grant execute on function public.amigo_submit_ballot(uuid,uuid,jsonb) to authenticated;

alter function public.amigo_statistics() set schema amigo;
alter function amigo.amigo_statistics() rename to statistics_core;
revoke all on function amigo.statistics_core() from public,anon,authenticated;
create function public.amigo_statistics() returns jsonb
language sql stable security definer set search_path='' as $$
  select amigo.statistics_core() || jsonb_build_object('planningStartedAt',planning_started_at,
    'newPlanners',new_planners,'singleDatePlanners',single_date_planners,'untimedPlanners',untimed_planners,
    'multiDateTimedPlanners',multi_date_timed_planners,'uniformTimePlanners',uniform_time_planners,'initialDateOptions',initial_date_options)
  from amigo.statistics where singleton;
$$;
revoke all on function public.amigo_statistics() from public;
grant execute on function public.amigo_statistics() to anon,authenticated;
commit;
