-- Apply after the clean rollout reset (012). Keep migration history intact;
-- the active API below supports only the current named/password identities.
begin;

alter table amigo.polls alter column organizer_name set not null;
alter table amigo.voters alter column verifier set not null;

create or replace function amigo.register_voter(p uuid, voter uuid, name_input text, proof text) returns void
language plpgsql set search_path = '' as $$
begin
  if proof is null or proof !~ '^[0-9a-f]{64}$' then raise exception 'Kies een stemwachtwoord.'; end if;
  if exists(select from amigo.voters where poll_id=p and lower(name)=lower(trim(name_input)))
    then raise exception 'Deze naam is al in gebruik. Kies je bestaande stem of gebruik een andere naam.'; end if;
  insert into amigo.voters(poll_id,id,name,verifier) values(p,voter,trim(name_input),proof);
end $$;

create or replace function public.amigo_apply(p uuid, operation uuid, kind text, body jsonb) returns void
language plpgsql security definer set search_path = '' as $$
declare
  actor_id uuid := auth.uid();
  target_day date := (body->>'day')::date;
  target_voter uuid := (body->>'voter')::uuid;
begin
  if actor_id is null then raise exception 'Sessie ontbreekt.'; end if;
  if kind is null or kind not in ('createPoll','removeVoter','close','reopen') then raise exception 'Onbekende wijziging.'; end if;
  insert into amigo.receipts values(actor_id,operation) on conflict do nothing;
  if not found then return; end if;

  if kind='createPoll' then
    if nullif(trim(body->>'organizerName'),'') is null then raise exception 'Vul je naam in.'; end if;
    insert into amigo.polls(id,title,description,verifier,organizer_name)
      values(p,body->>'title',coalesce(body->>'description',''),body->>'proof',trim(body->>'organizerName'));
    if target_voter is not null then
      perform amigo.register_voter(p,target_voter,body->>'organizerName',body->>'voterProof');
      update amigo.polls set organizer_voter_id=target_voter where id=p;
    end if;
    insert into amigo.dates select p,key::date,nullif(value->>'time','')::time from jsonb_each(body->'dates');
    if (select count(*) from amigo.dates where poll_id=p)<2 then raise exception 'Kies minstens twee datums.'; end if;
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
        if not exists(select from amigo.dates where poll_id=p and day=target_day) then raise exception 'Deze datum is verwijderd.'; end if;
        update amigo.polls set final_date=target_day where id=p;
    end case;
  end if;
  perform realtime.send('{}'::jsonb,'changed','amigo:'||p::text,true);
end $$;

create or replace function public.amigo_submit_ballot(p uuid, operation uuid, body jsonb) returns void
language plpgsql security definer set search_path = '' as $$
declare
  participant uuid := (body->>'voter')::uuid;
  item record;
begin
  if auth.uid() is null then raise exception 'Sessie ontbreekt.'; end if;
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

create or replace function public.amigo_sign_in(p uuid, operation uuid, body jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  actor_id uuid := auth.uid();
  identity_name text := trim(body->>'name');
  poll amigo.polls;
  participant amigo.voters;
  is_organizer boolean;
  signed_voter uuid;
  result jsonb;
begin
  if actor_id is null then raise exception 'Sessie ontbreekt.'; end if;
  if nullif(identity_name,'') is null then raise exception 'Vul je naam in.'; end if;
  select r.result into result from amigo.login_receipts r
    where r.actor=actor_id and r.operation=amigo_sign_in.operation and r.poll_id=p;
  if found then return result; end if;
  select * into poll from amigo.polls where id=p for update;
  if not found then raise exception 'Prikker niet gevonden.'; end if;
  select r.result into result from amigo.login_receipts r
    where r.actor=actor_id and r.operation=amigo_sign_in.operation and r.poll_id=p;
  if found then return result; end if;
  if exists(select from amigo.receipts r where r.actor=actor_id and r.operation=amigo_sign_in.operation)
    then raise exception 'Deze aanmelding is niet geldig. Probeer opnieuw.'; end if;

  is_organizer := coalesce(poll.verifier=body->>'organizerProof'
    and lower(poll.organizer_name)=lower(identity_name),false);
  if is_organizer then
    identity_name := poll.organizer_name;
    select * into participant from amigo.voters where poll_id=p and id=poll.organizer_voter_id;
    if found then signed_voter := participant.id; end if;
  else
    if lower(poll.organizer_name)=lower(identity_name) then raise exception 'Wachtwoord klopt niet.'; end if;
    select * into participant from amigo.voters where poll_id=p and id=(body->>'voter')::uuid;
    if found then
      if lower(participant.name)<>lower(identity_name) or participant.verifier is distinct from body->>'proof'
        then raise exception 'Wachtwoord klopt niet.'; end if;
    else
      if poll.final_date is not null then raise exception 'De prikker is gesloten.'; end if;
      perform amigo.register_voter(p,(body->>'voter')::uuid,identity_name,body->>'proof');
      select * into participant from amigo.voters where poll_id=p and id=(body->>'voter')::uuid;
    end if;
    signed_voter := participant.id;
    identity_name := participant.name;
  end if;

  insert into amigo.receipts values(actor_id,operation);
  insert into amigo.members values(p,actor_id,is_organizer)
    on conflict (poll_id,actor) do update set organizer=excluded.organizer;
  result := jsonb_build_object('voter',signed_voter,'name',identity_name,'organizer',is_organizer);
  if is_organizer and signed_voter is not null then
    result := result || jsonb_build_object('proof',participant.verifier);
  end if;
  insert into amigo.login_receipts values(actor_id,operation,p,result);
  perform realtime.send('{}'::jsonb,'changed','amigo:'||p::text,true);
  return result;
end $$;

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
    'organizerVoter', (select id from amigo.voters where poll_id=p and id=organizer_voter_id),
    'dates', coalesce((select jsonb_object_agg(day,jsonb_build_object('date',day,'time',coalesce(to_char(clock,'HH24:MI'),''))) from amigo.dates where poll_id=p),'{}'),
    'votes', coalesce((select jsonb_object_agg(v.id,jsonb_build_object('name',v.name,'votesJson',
      coalesce((select jsonb_object_agg(day,value)::text from amigo.votes where poll_id=p and voter=v.id),'{}')))
      from amigo.voters v where v.poll_id=p),'{}')
  ) into result from amigo.polls where id=p;
  return result;
end $$;

create or replace function public.amigo_edit(p uuid, operation uuid, body jsonb) returns void
language plpgsql security definer set search_path = '' as $$
declare
  actor_id uuid := auth.uid();
  chosen date;
  owner_id uuid;
  owner_name text;
  participation jsonb := body->'organizerParticipation';
  requested_id uuid := (participation->>'voter')::uuid;
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
  if participation is not null then
    select organizer_voter_id,organizer_name into owner_id,owner_name from amigo.polls where id=p;
    if not exists(select from amigo.voters where poll_id=p and id=owner_id) then owner_id := null; end if;
    if (participation->>'enabled')::boolean then
      if owner_id is null then
        if chosen is not null then raise exception 'De prikker is gesloten.'; end if;
        perform amigo.register_voter(p,requested_id,owner_name,participation->>'proof');
        owner_id := requested_id;
      end if;
    else
      delete from amigo.voters where poll_id=p and id=owner_id;
      owner_id := null;
    end if;
    update amigo.polls set organizer_voter_id=owner_id where id=p;
  end if;
  perform realtime.send('{}'::jsonb,'changed','amigo:'||p::text,true);
end $$;

revoke all on function public.amigo_edit(uuid,uuid,jsonb) from public, anon;
grant execute on function public.amigo_edit(uuid,uuid,jsonb) to authenticated;


drop function public.amigo_unlock(uuid,text);
drop function public.amigo_voter_unlock(uuid,uuid,text,boolean);
drop index amigo.voters_legacy_actor;
alter table amigo.voters drop column actor;

commit;
