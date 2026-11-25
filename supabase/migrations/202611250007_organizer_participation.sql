-- Link the organizer to their optional participant independently of the device actor.
alter table amigo.polls add column organizer_voter_id uuid;

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
          if chosen is not null then raise exception 'De prikker is al gesloten.'; end if;
          if not exists(select from amigo.dates where poll_id=p and day=target_day) then raise exception 'Deze datum is verwijderd.'; end if;
          update amigo.polls set final_date=target_day where id=p;
        else raise exception 'Onbekende wijziging.';
      end case;
    end if;
  end if;
  perform realtime.send('{}'::jsonb,'changed','amigo:'||p::text,true);
end $$;


-- Apply a saved organizer draft and publish one notification for the whole edit.
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
    -- Old polls can link a participant only with that participant's credentials.
    if owner_id is null and exists(select from amigo.voters where poll_id=p and id=requested_id
        and lower(name)=lower(owner_name) and verifier=participation->>'proof') then
      owner_id := requested_id;
    end if;
    if (participation->>'enabled')::boolean then
      if owner_id is null then
        if chosen is not null then raise exception 'De prikker is gesloten.'; end if;
        if owner_name is null then raise exception 'Meld je opnieuw aan als organisator.'; end if;
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

create or replace function public.amigo_sign_in(p uuid, operation uuid, body jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  actor_id uuid := auth.uid();
  identity_name text := trim(body->>'name');
  poll amigo.polls;
  participant amigo.voters;
  valid_voter boolean;
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
    and (poll.organizer_name is null or lower(poll.organizer_name)=lower(identity_name)),false);
  select * into participant from amigo.voters where poll_id=p
    and id=(body->>'voter')::uuid and lower(name)=lower(identity_name);
  valid_voter := participant.id is not null and coalesce(
    participant.verifier=body->>'proof' or (participant.verifier is null
      and participant.actor=actor_id and coalesce((body->>'claim')::boolean,false)
      and body->>'proof' ~ '^[0-9a-f]{64}$'),false);

  if is_organizer and poll.organizer_voter_id is not null then
    select * into participant from amigo.voters where poll_id=p and id=poll.organizer_voter_id and verifier is not null;
    if found then
      valid_voter := true;
      body := body || jsonb_build_object('voter',participant.id,'proof',participant.verifier,'name',participant.name,'register',false);
    else
      valid_voter := false;
    end if;
  end if;

  if is_organizer and (not valid_voter or (poll.final_date is not null and participant.verifier is null)) then
    -- Organizers who did not opt into voting get no participant row.
    insert into amigo.receipts values(actor_id,operation);
  elsif poll.final_date is not null and valid_voter and participant.verifier is not null then
    insert into amigo.receipts values(actor_id,operation);
    signed_voter := participant.id;
  else
    if not is_organizer and lower(poll.organizer_name)=lower(identity_name) and participant.id is null
      then raise exception 'Wachtwoord klopt niet.'; end if;
    if participant.id is not null and not valid_voter then raise exception 'Wachtwoord klopt niet.'; end if;
    perform public.amigo_submit_ballot(p,operation,body);
    select * into participant from amigo.voters where poll_id=p and id=(body->>'voter')::uuid;
    if not found then raise exception 'Aanmelden mislukt.'; end if;
    signed_voter := participant.id;
  end if;

  if is_organizer then
    update amigo.polls set organizer_name=coalesce(organizer_name,identity_name), organizer_voter_id=signed_voter where id=p;
    identity_name := coalesce(poll.organizer_name,identity_name);
  else
    identity_name := participant.name;
  end if;
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
revoke all on function public.amigo_sign_in(uuid,uuid,jsonb) from public, anon;
grant execute on function public.amigo_sign_in(uuid,uuid,jsonb) to authenticated;
