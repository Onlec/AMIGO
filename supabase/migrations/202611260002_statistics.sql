-- Aggregate-only public statistics. No historical planner or person archive.
begin;

-- Take a consistent baseline while writes wait; no planner data is reset.
lock table amigo.polls, amigo.voters, amigo.votes in share row exclusive mode;

create table amigo.statistics (
  singleton boolean primary key default true check (singleton),
  started_at timestamptz not null default now(),
  planners bigint not null default 0,
  registrations bigint not null default 0,
  answers bigint not null default 0,
  maybe_answers bigint not null default 0,
  monday_answers bigint not null default 0,
  monday_no_answers bigint not null default 0,
  finalized_planners bigint not null default 0,
  weekend_dates bigint not null default 0,
  unanimous_dates bigint not null default 0
);
revoke all on amigo.statistics from public, anon, authenticated;

insert into amigo.statistics(singleton, planners, registrations, answers, maybe_answers,
  monday_answers, monday_no_answers, finalized_planners, weekend_dates, unanimous_dates)
select true,
  (select count(*) from amigo.polls),
  (select count(*) from amigo.voters),
  (select count(*) from amigo.votes where value in ('yes','maybe','no')),
  (select count(*) from amigo.votes where value='maybe'),
  (select count(*) from amigo.votes where value in ('yes','maybe','no') and extract(isodow from day)=1),
  (select count(*) from amigo.votes where value='no' and extract(isodow from day)=1),
  (select count(*) from amigo.polls where final_date is not null),
  (select count(*) from amigo.polls where extract(isodow from final_date) in (6,7)),
  (select count(*) from amigo.polls p where p.final_date is not null
    and (select count(*) from amigo.voters where poll_id=p.id)>=2
    and not exists(select from amigo.voters v where v.poll_id=p.id and not exists(
      select from amigo.votes a where a.poll_id=p.id and a.voter=v.id and a.day=p.final_date and a.value='yes')));

-- This flag disappears with its planner; only the totals survive deletion.
alter table amigo.polls add column statistics_final_recorded boolean not null default false;
update amigo.polls set statistics_final_recorded=true where final_date is not null;

create function amigo.count_statistics() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_table_name='polls' then
    if tg_op='INSERT' then
      update amigo.statistics set planners=planners+1 where singleton;
    elsif new.final_date is not null and not old.statistics_final_recorded then
      new.statistics_final_recorded := true;
      update amigo.statistics set
        finalized_planners=finalized_planners+1,
        weekend_dates=weekend_dates+case when extract(isodow from new.final_date) in (6,7) then 1 else 0 end,
        unanimous_dates=unanimous_dates+case when
          (select count(*) from amigo.voters where poll_id=new.id)>=2
          and not exists(select from amigo.voters v where v.poll_id=new.id and not exists(
            select from amigo.votes a where a.poll_id=new.id and a.voter=v.id and a.day=new.final_date and a.value='yes'))
          then 1 else 0 end
        where singleton;
    else
      -- Never reset the first-confirmation flag on reopen or unrelated edits.
      new.statistics_final_recorded := old.statistics_final_recorded;
    end if;
  elsif tg_table_name='voters' then
    update amigo.statistics set registrations=registrations+1 where singleton;
  elsif tg_table_name='votes' then
    if tg_op='UPDATE' then
      if new.value is not distinct from old.value then return new; end if;
    end if;
    if new.value in ('yes','maybe','no') then
      update amigo.statistics set
        answers=answers+1,
        maybe_answers=maybe_answers+case when new.value='maybe' then 1 else 0 end,
        monday_answers=monday_answers+case when extract(isodow from new.day)=1 then 1 else 0 end,
        monday_no_answers=monday_no_answers+case when extract(isodow from new.day)=1 and new.value='no' then 1 else 0 end
        where singleton;
    end if;
  end if;
  return new;
end $$;
revoke all on function amigo.count_statistics() from public, anon, authenticated;

create trigger statistics_poll_insert after insert on amigo.polls
  for each row execute function amigo.count_statistics();
create trigger statistics_first_final before update on amigo.polls
  for each row execute function amigo.count_statistics();
create trigger statistics_registration after insert on amigo.voters
  for each row execute function amigo.count_statistics();
create trigger statistics_answer after insert or update on amigo.votes
  for each row execute function amigo.count_statistics();

create function public.amigo_statistics() returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'startedAt', started_at, 'planners', planners, 'registrations', registrations,
    'answers', answers, 'maybeAnswers', maybe_answers, 'mondayAnswers', monday_answers,
    'mondayNoAnswers', monday_no_answers, 'finalizedPlanners', finalized_planners,
    'weekendDates', weekend_dates, 'unanimousDates', unanimous_dates)
  from amigo.statistics where singleton;
$$;
revoke all on function public.amigo_statistics() from public;
grant execute on function public.amigo_statistics() to anon, authenticated;

commit;
