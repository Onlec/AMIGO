-- Enforce the date lock for every write path, including older clients and queued edits.
create function amigo.guard_closed_poll_dates() returns trigger
language plpgsql set search_path = '' as $$
declare
  target_poll uuid;
  chosen date;
begin
  if tg_op='DELETE' then target_poll := old.poll_id;
  else target_poll := new.poll_id;
  end if;
  select final_date into chosen from amigo.polls where id=target_poll for update;
  -- A cascading poll deletion has no parent row left; let its dates be removed.
  if found and chosen is not null then
    raise exception 'Heropen de poll om datums aan te passen.';
  end if;
  if tg_op='DELETE' then return old; end if;
  return new;
end $$;
revoke all on function amigo.guard_closed_poll_dates() from public, anon, authenticated;

create trigger closed_poll_dates before insert or update or delete on amigo.dates
  for each row execute function amigo.guard_closed_poll_dates();
