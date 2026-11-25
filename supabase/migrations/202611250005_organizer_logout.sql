-- Revoke only this actor's organizer access to this poll, keeping read access.
create function public.amigo_lock_organizer(p uuid, operation uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'Sessie ontbreekt.'; end if;
  insert into amigo.receipts values(auth.uid(),operation) on conflict do nothing;
  if not found then return; end if;
  perform 1 from amigo.polls where id=p for update;
  if not found then return; end if;
  update amigo.members set organizer=false where poll_id=p and actor=auth.uid();
  if found then
    perform realtime.send('{}'::jsonb,'changed','amigo:'||p::text,true);
  end if;
end $$;
revoke all on function public.amigo_lock_organizer(uuid,uuid) from public, anon;
grant execute on function public.amigo_lock_organizer(uuid,uuid) to authenticated;
