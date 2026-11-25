-- One verified identity for voting and organizer access. Retried logins do not
-- grant permissions again after a later logout.
create table amigo.login_receipts (
  actor uuid not null,
  operation uuid not null,
  poll_id uuid not null references amigo.polls on delete cascade,
  result jsonb not null,
  primary key (actor, operation)
);
revoke all on amigo.login_receipts from public, anon, authenticated;

create function public.amigo_sign_in(p uuid, operation uuid, body jsonb) returns jsonb
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
    update amigo.polls set organizer_name=coalesce(organizer_name,identity_name) where id=p;
    identity_name := coalesce(poll.organizer_name,identity_name);
  else
    identity_name := participant.name;
  end if;
  insert into amigo.members values(p,actor_id,is_organizer)
    on conflict (poll_id,actor) do update set organizer=excluded.organizer;
  result := jsonb_build_object('voter',signed_voter,'name',identity_name,'organizer',is_organizer);
  insert into amigo.login_receipts values(actor_id,operation,p,result);
  perform realtime.send('{}'::jsonb,'changed','amigo:'||p::text,true);
  return result;
end $$;
revoke all on function public.amigo_sign_in(uuid,uuid,jsonb) from public, anon;
grant execute on function public.amigo_sign_in(uuid,uuid,jsonb) to authenticated;
