-- Registration, password verification and all changed days share one transaction.
create function public.amigo_submit_ballot(p uuid, operation uuid, body jsonb) returns void
language plpgsql security definer set search_path = '' as $$
declare
  participant uuid := (body->>'voter')::uuid;
  changes jsonb := body->'changes';
  item record;
begin
  if auth.uid() is null then raise exception 'Sessie ontbreekt.'; end if;
  insert into amigo.receipts values(auth.uid(),operation) on conflict do nothing;
  if not found then return; end if;
  perform 1 from amigo.polls where id=p and final_date is null for update;
  if not found then raise exception 'De prikker is gesloten of verwijderd.'; end if;
  if nullif(trim(body->>'name'),'') is null or jsonb_typeof(changes) is distinct from 'object' then
    raise exception 'Vul je naam en beschikbaarheid in.';
  end if;

  if (body->>'register')::boolean then
    perform amigo.register_voter(p,participant,body->>'name',body->>'proof');
  else
    perform public.amigo_voter_unlock(p,participant,body->>'proof',coalesce((body->>'claim')::boolean,false));
  end if;

  for item in select * from jsonb_each_text(changes) loop
    if not exists(select from amigo.dates where poll_id=p and day=item.key::date) then
      raise exception 'De datum % is verwijderd. Controleer je keuzes.',item.key;
    end if;
    if item.value='none' then
      delete from amigo.votes where poll_id=p and voter=participant and day=item.key::date;
    else
      insert into amigo.votes values(p,participant,item.key::date,item.value)
        on conflict (poll_id,voter,day) do update set value=excluded.value;
    end if;
  end loop;
  if not exists(select from amigo.votes where poll_id=p and voter=participant and value<>'none') then
    raise exception 'Beantwoord minstens één datum.';
  end if;
  perform realtime.send('{}'::jsonb,'changed','amigo:'||p::text,true);
end $$;
revoke all on function public.amigo_submit_ballot(uuid,uuid,jsonb) from public, anon;
grant execute on function public.amigo_submit_ballot(uuid,uuid,jsonb) to authenticated;
