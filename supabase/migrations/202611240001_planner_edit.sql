-- Apply a saved organizer draft and publish one notification for the whole edit.
create function public.amigo_edit(p uuid, operation uuid, body jsonb) returns void
language plpgsql security definer set search_path = '' as $$
declare
  actor_id uuid := auth.uid();
  chosen date;
begin
  if actor_id is null then raise exception 'Sessie ontbreekt.'; end if;
  select final_date into chosen from amigo.polls where id=p for update;
  if not found then raise exception 'Prikker niet gevonden.'; end if;
  if not exists(select from amigo.members where poll_id=p and actor=actor_id and organizer)
    then raise exception 'Ontgrendel eerst de bewerkmodus.'; end if;

  insert into amigo.receipts values(actor_id,operation) on conflict do nothing;
  if not found then return; end if;

  if chosen in (select value::date from jsonb_array_elements_text(body->'removed')) then
    raise exception 'De gekozen datum blijft behouden.';
  end if;
  update amigo.polls set title=coalesce(body->>'title',title),
    description=coalesce(body->>'description',description) where id=p;
  delete from amigo.dates where poll_id=p and day in
    (select value::date from jsonb_array_elements_text(body->'removed'));
  insert into amigo.dates(poll_id,day)
    select p,value::date from jsonb_array_elements_text(body->'added') on conflict do nothing;
  perform realtime.send('{}'::jsonb,'changed','amigo:'||p::text,true);
end $$;

revoke all on function public.amigo_edit(uuid,uuid,jsonb) from public, anon;
grant execute on function public.amigo_edit(uuid,uuid,jsonb) to authenticated;
