-- Refuse vote requests from older clients that can replay an offline queue.
-- New clients submit directly after a live read, without durable vote retries.
begin;

create or replace function public.amigo_submit_ballot(p uuid, operation uuid, body jsonb) returns void
language plpgsql security definer set search_path = '' as $$
declare
  participant uuid := (body->>'voter')::uuid;
  item record;
begin
  if auth.uid() is null then raise exception 'Sessie ontbreekt.'; end if;
  if body->>'submissionMode' is distinct from 'online' then
    raise exception 'Vernieuw de pagina om online te stemmen.';
  end if;
  insert into amigo.receipts values(auth.uid(),operation) on conflict do nothing;
  if not found then return; end if;
  perform 1 from amigo.polls where id=p and final_date is null for update;
  if not found then raise exception 'De prikker is gesloten of verwijderd.'; end if;
  if not exists(select from amigo.voters where poll_id=p and id=participant)
    then raise exception 'Deze deelnemer is verwijderd.'; end if;
  if not exists(select from amigo.voters where poll_id=p and id=participant and verifier=body->>'proof')
    then raise exception 'Wachtwoord klopt niet.'; end if;
  if jsonb_typeof(body->'changes') is distinct from 'object'
    then raise exception 'Vul je beschikbaarheid in.'; end if;
  for item in select * from jsonb_each_text(body->'changes') loop
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
  perform realtime.send('{}'::jsonb,'changed','amigo:'||p::text,true);
end $$;

revoke all on function public.amigo_submit_ballot(uuid,uuid,jsonb) from public, anon;
grant execute on function public.amigo_submit_ballot(uuid,uuid,jsonb) to authenticated;
commit;
