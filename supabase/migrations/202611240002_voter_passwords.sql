alter table amigo.polls add column organizer_name text;
alter table amigo.voters add column verifier text check (verifier ~ '^[0-9a-f]{64}$');
alter table amigo.voters drop constraint voters_poll_id_actor_key;
create unique index voters_legacy_actor on amigo.voters(poll_id,actor) where verifier is null;

-- Called while the poll is locked, or in the transaction that creates it.
create function amigo.register_voter(p uuid, voter uuid, name_input text, proof text) returns void
language plpgsql set search_path = '' as $$
begin
  if proof is null or proof !~ '^[0-9a-f]{64}$' then raise exception 'Kies een stemwachtwoord.'; end if;
  if exists(select from amigo.voters where poll_id=p and lower(name)=lower(trim(name_input)))
    then raise exception 'Deze naam is al in gebruik. Kies je bestaande stem of gebruik een andere naam.'; end if;
  insert into amigo.voters(poll_id,id,actor,name,verifier) values(p,voter,auth.uid(),trim(name_input),proof);
end $$;
revoke all on function amigo.register_voter(uuid,uuid,text,text) from public;

create function public.amigo_voter_unlock(p uuid, voter uuid, proof text, claim boolean) returns void
language plpgsql security definer set search_path = '' as $$
declare
  participant amigo.voters;
begin
  if auth.uid() is null then raise exception 'Sessie ontbreekt.'; end if;
  perform 1 from amigo.polls where id=p and final_date is null for update;
  if not found then raise exception 'De prikker is gesloten of verwijderd.'; end if;
  select * into participant from amigo.voters where poll_id=p and id=voter;
  if not found then raise exception 'Deze deelnemer is verwijderd.'; end if;
  if proof is null or proof !~ '^[0-9a-f]{64}$' then raise exception 'Vul een stemwachtwoord in.'; end if;
  if participant.verifier is null then
    if not coalesce(claim,false) or participant.actor<>auth.uid()
      then raise exception 'Stel eerst een wachtwoord in op het oorspronkelijke toestel.'; end if;
    update amigo.voters set verifier=proof where poll_id=p and id=voter;
    perform realtime.send('{}'::jsonb,'changed','amigo:'||p::text,true);
  elsif participant.verifier<>proof then
    raise exception 'Wachtwoord klopt niet.';
  end if;
end $$;
revoke all on function public.amigo_voter_unlock(uuid,uuid,text,boolean) from public, anon;
grant execute on function public.amigo_voter_unlock(uuid,uuid,text,boolean) to authenticated;

create or replace function public.amigo_read(p uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare result jsonb;
begin
  if auth.uid() is null then raise exception 'Sessie ontbreekt.'; end if;
  if not exists (select from amigo.polls where id=p) then return null; end if;
  insert into amigo.members(poll_id,actor) values(p,auth.uid()) on conflict do nothing;
  select jsonb_build_object(
    'title', title, 'description', description, 'finalDateId', final_date,
    'status', case when final_date is null then 'open' else 'closed' end,
    'organizer', (select organizer from amigo.members where poll_id=p and actor=auth.uid()),
    'ownVoter', (select id from amigo.voters where poll_id=p and actor=auth.uid() and verifier is null),
    'dates', coalesce((select jsonb_object_agg(day,jsonb_build_object('date',day,'time',coalesce(to_char(clock,'HH24:MI'),''))) from amigo.dates where poll_id=p),'{}'),
    'votes', coalesce((select jsonb_object_agg(v.id,jsonb_build_object('name',v.name,'needsPassword',v.verifier is null,'votesJson',
      coalesce((select jsonb_object_agg(day,value)::text from amigo.votes where poll_id=p and voter=v.id),'{}')))
      from amigo.voters v where v.poll_id=p),'{}')
  ) into result from amigo.polls where id=p;
  return result;
end $$;

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
          if chosen is not null then raise exception 'De prikker is al gesloten.'; end if;
          if not exists(select from amigo.dates where poll_id=p and day=target_day) then raise exception 'Deze datum is verwijderd.'; end if;
          update amigo.polls set final_date=target_day where id=p;
        else raise exception 'Onbekende wijziging.';
      end case;
    end if;
  end if;
  perform realtime.send('{}'::jsonb,'changed','amigo:'||p::text,true);
end $$;

