create schema amigo;
revoke all on schema amigo from public, anon, authenticated;

create table amigo.polls (
  id uuid primary key,
  title text not null check (length(trim(title)) > 0),
  description text not null default '',
  verifier text not null check (verifier ~ '^[0-9a-f]{64}$'),
  final_date date
);
create table amigo.dates (
  poll_id uuid references amigo.polls on delete cascade,
  day date,
  clock time,
  primary key (poll_id, day)
);
create table amigo.members (
  poll_id uuid references amigo.polls on delete cascade,
  actor uuid not null,
  organizer boolean not null default false,
  primary key (poll_id, actor)
);
create table amigo.voters (
  poll_id uuid references amigo.polls on delete cascade,
  id uuid,
  actor uuid not null,
  name text not null check (length(trim(name)) > 0),
  primary key (poll_id, id),
  unique (poll_id, actor)
);
create table amigo.votes (
  poll_id uuid,
  voter uuid,
  day date,
  value text not null check (value in ('yes','maybe','no','none')),
  primary key (poll_id, voter, day),
  foreign key (poll_id, voter) references amigo.voters on delete cascade,
  foreign key (poll_id, day) references amigo.dates on delete cascade
);
create table amigo.receipts (
  actor uuid,
  operation uuid,
  primary key (actor, operation)
);

-- Knowing the random link grants read access to this poll and its live channel.
create function public.amigo_read(p uuid) returns jsonb
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
    'ownVoter', (select id from amigo.voters where poll_id=p and actor=auth.uid()),
    'dates', coalesce((select jsonb_object_agg(day,jsonb_build_object('date',day,'time',coalesce(to_char(clock,'HH24:MI'),''))) from amigo.dates where poll_id=p),'{}'),
    'votes', coalesce((select jsonb_object_agg(v.id,jsonb_build_object('name',v.name,'votesJson',
      coalesce((select jsonb_object_agg(day,value)::text from amigo.votes where poll_id=p and voter=v.id),'{}')))
      from amigo.voters v where v.poll_id=p),'{}')
  ) into result from amigo.polls where id=p;
  return result;
end $$;

create function public.amigo_unlock(p uuid, proof text) returns boolean
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null or not exists(select from amigo.polls where id=p and verifier=proof) then return false; end if;
  insert into amigo.members values(p,auth.uid(),true)
  on conflict (poll_id,actor) do update set organizer=true;
  return true;
end $$;

create function public.amigo_apply(p uuid, operation uuid, kind text, body jsonb) returns void
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

  if kind='create' then
    insert into amigo.polls(id,title,description,verifier)
      values(p,body->>'title',body->>'description',body->>'proof');
    insert into amigo.dates select p,key::date,nullif(value->>'time','')::time from jsonb_each(body->'dates');
    if (select count(*) from amigo.dates where poll_id=p)<2 then raise exception 'Kies minstens twee datums.'; end if;
    insert into amigo.members values(p,actor_id,true);
  else
    select final_date into chosen from amigo.polls where id=p for update;
    if not found then raise exception 'Prikker niet gevonden.'; end if;
    if kind='vote' then
      if chosen is not null then raise exception 'De prikker is gesloten.'; end if;
      if not exists(select from amigo.dates where poll_id=p and day=target_day) then raise exception 'Deze datum is verwijderd.'; end if;
      if coalesce((body->>'existing')::boolean,false) and not exists
        (select from amigo.voters where poll_id=p and id=target_voter and actor=actor_id)
        then raise exception 'Deze deelnemer is verwijderd.'; end if;
      insert into amigo.voters values(p,target_voter,actor_id,body->>'name')
        on conflict (poll_id,id) do update set name=excluded.name where amigo.voters.actor=actor_id;
      if not found then raise exception 'Deze stem hoort bij een andere deelnemer.'; end if;
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

create function public.amigo_can_listen(topic text) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists(select from amigo.members where actor=auth.uid() and 'amigo:'||poll_id::text=topic);
$$;
create policy amigo_receive on realtime.messages for select to authenticated
  using (extension='broadcast' and public.amigo_can_listen(realtime.topic()));

revoke all on function public.amigo_read(uuid), public.amigo_unlock(uuid,text),
  public.amigo_apply(uuid,uuid,text,jsonb), public.amigo_can_listen(text) from public, anon;
grant execute on function public.amigo_read(uuid), public.amigo_unlock(uuid,text),
  public.amigo_apply(uuid,uuid,text,jsonb), public.amigo_can_listen(text) to authenticated;
