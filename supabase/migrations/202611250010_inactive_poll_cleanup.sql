-- Existing polls start their first 14-day inactivity window on migration.
alter table amigo.polls add column last_activity_at timestamptz not null default now();
create index polls_last_activity_at on amigo.polls(last_activity_at);

-- Reading, logging in/out and retrying an unchanged write are not poll activity.
create function amigo.track_poll_activity() returns trigger
language plpgsql set search_path = '' as $$
begin
  if (new.title, new.description, new.final_date, new.organizer_name, new.organizer_voter_id)
      is distinct from
     (old.title, old.description, old.final_date, old.organizer_name, old.organizer_voter_id) then
    new.last_activity_at := clock_timestamp();
  end if;
  return new;
end $$;
revoke all on function amigo.track_poll_activity() from public, anon, authenticated;

create trigger poll_activity before update on amigo.polls
  for each row execute function amigo.track_poll_activity();

create function amigo.track_poll_content_activity() returns trigger
language plpgsql set search_path = '' as $$
declare target_poll uuid;
begin
  if tg_op='UPDATE' then
    if new is not distinct from old then return null; end if;
  end if;
  if tg_op='DELETE' then target_poll := old.poll_id;
  else target_poll := new.poll_id;
  end if;
  -- During cascading poll deletion this updates no rows and cannot revive a poll.
  update amigo.polls set last_activity_at=clock_timestamp() where id=target_poll;
  return null;
end $$;
revoke all on function amigo.track_poll_content_activity() from public, anon, authenticated;

create trigger dates_activity after insert or update or delete on amigo.dates
  for each row execute function amigo.track_poll_content_activity();
create trigger voters_activity after insert or update of name or delete on amigo.voters
  for each row execute function amigo.track_poll_content_activity();
create trigger votes_activity after insert or update or delete on amigo.votes
  for each row execute function amigo.track_poll_content_activity();

create function amigo.delete_inactive_polls() returns integer
language plpgsql security definer set search_path = '' as $$
declare removed integer;
begin
  -- Foreign keys also delete the dates, participants, votes, memberships and login receipts.
  delete from amigo.polls where last_activity_at <= now() - interval '14 days';
  get diagnostics removed = row_count;
  return removed;
end $$;
revoke all on function amigo.delete_inactive_polls() from public, anon, authenticated;

-- Supabase Cron runs on the server even when nobody has the app open.
-- https://supabase.com/docs/guides/cron/install
create extension if not exists pg_cron with schema pg_catalog;
grant usage on schema cron to postgres;
grant all privileges on all tables in schema cron to postgres;
select cron.schedule('amigo-delete-inactive-polls', '*/15 * * * *',
  'select amigo.delete_inactive_polls();');
