-- ONE-TIME ROLLOUT: all existing planner records are disposable test data.
-- Close old test tabs before running this, and publish the live-v1 client.
-- Keep schema, RPCs, permissions, Auth configuration and the cleanup schedule.
begin;

truncate table amigo.login_receipts, amigo.receipts, amigo.votes,
  amigo.voters, amigo.members, amigo.dates, amigo.polls;

-- New registrations have one identity per normalized name within a poll.
-- Do not use IF NOT EXISTS: rerunning this migration must fail and roll back
-- the truncate rather than clear subsequently created production polls.
create unique index voters_poll_normalized_name on amigo.voters(poll_id, lower(trim(name)));

select (select count(*) from amigo.polls) as polls,
       (select count(*) from amigo.voters) as participants,
       (select count(*) from amigo.votes) as votes;

commit;
