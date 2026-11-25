-- Organizers may replace a confirmed date. Voting stays closed and existing votes remain intact.
create or replace function public.amigo_apply(p uuid, operation uuid, kind text, body jsonb) returns void
language plpgsql security definer set search_path = '' as $$
declare
  actor_id uuid := auth.uid();
  target_day date := (body->>'day')::date;
  target_voter uuid := (body->>'voter')::uuid;
  chosen date;
begin
  if actor_id is null then raise exception 'Sessie ontbreekt.'; end if;
  insert into amigo.receipts values(actor_id,operation) on conflict do nothing;
  if not found then return; end if;

  if kind in ('create','createPoll') then
    insert into amigo.polls(id,title,description,verifier)
      values(p,body->>'title',body->>'description',body->>'proof');
    if kind='createPoll' then
      if nullif(trim(body->>'organizerName'),'') is null then raise exception 'Vul je naam in.'; end if;
      update amigo.polls set organizer_name=trim(body->>'organizerName') where id=p;
      if target_voter is not null then
        perform amigo.register_voter(p,target_voter,body->>'organizerName',body->>'voterProof');
        update amigo.polls set organizer_voter_id=target_voter where id=p;
      end if;
    end if;
    insert into amigo.dates select p,key::date,nullif(value->>'time','')::time from jsonb_each(body->'dates');
    if (select count(*) from amigo.dates where poll_id=p)<2 then raise exception 'Kies minstens twee datums.'; end if;
    insert into amigo.members values(p,actor_id,true);
  else
    select final_date into chosen from amigo.polls where id=p for update;
    if not found then raise exception 'Prikker niet gevonden.'; end if;
    if kind='join' then
      if chosen is not null then raise exception 'De prikker is gesloten.'; end if;
      perform amigo.register_voter(p,target_voter,body->>'name',body->>'proof');
    elsif kind in ('vote','castVote') then
      if chosen is not null then raise exception 'De prikker is gesloten.'; end if;
      if not exists(select from amigo.dates where poll_id=p and day=target_day) then raise exception 'Deze datum is verwijderd.'; end if;
      if kind='vote' then raise exception 'Selecteer je stemmer en vul het wachtwoord in.'; end if;
      if not exists(select from amigo.voters where poll_id=p and id=target_voter)
        then raise exception 'Deze deelnemer is verwijderd.'; end if;
      if not exists(select from amigo.voters where poll_id=p and id=target_voter and verifier=body->>'proof')
        then raise exception 'Wachtwoord klopt niet.'; end if;
      insert into amigo.votes values(p,target_voter,target_day,body->>'value')
        on conflict (poll_id,voter,day) do update set value=excluded.value;
    else
      if not exists(select from amigo.members where poll_id=p and actor=actor_id and organizer)
        then raise exception 'Ontgrendel eerst de bewerkmodus.'; end if;
      case kind
        when 'details' then update amigo.polls set title=body->>'title',description=body->>'description' where id=p;
        when 'addDate' then insert into amigo.dates values(p,target_day,null) on conflict do nothing;
        when 'removeDate' then
          if target_day=chosen then raise exception 'De gekozen datum blijft behouden.'; end if;
          delete from amigo.dates where poll_id=p and day=target_day;
        when 'removeVoter' then delete from amigo.voters where poll_id=p and id=target_voter;
        when 'close' then

          if not exists(select from amigo.dates where poll_id=p and day=target_day) then raise exception 'Deze datum is verwijderd.'; end if;
          update amigo.polls set final_date=target_day where id=p;
        else raise exception 'Onbekende wijziging.';
      end case;
    end if;
  end if;
  perform realtime.send('{}'::jsonb,'changed','amigo:'||p::text,true);
end $$;


