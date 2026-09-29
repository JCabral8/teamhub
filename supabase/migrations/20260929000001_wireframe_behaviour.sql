-- Behaviour from the wireframes in design/ (decision 30): a Maybe answer, callup notifications,
-- callup spots, Event end time and Home/Away, a phone number on profiles and a reason on
-- unavailable dates. Pending players and callups are now decided by Managers in the app code.

-- Wireframes 6 and 7: "Maybe – Not sure yet". Holds no roster spot.
alter type public.attendance_response add value if not exists 'MAYBE';

-- Wireframe 7 and 4 notification examples.
alter type public.notification_type add value if not exists 'CALLUP_INVITATION';
alter type public.notification_type add value if not exists 'CALLUP_CONFIRMED';
alter type public.notification_type add value if not exists 'CALLUP_NO_LONGER_NEEDED';
alter type public.notification_type add value if not exists 'NOT_SELECTED';
alter type public.notification_type add value if not exists 'NEW_EVENT';

-- Wireframe 5B "End Time (optional)", 5b/9 "Home" tag, and 2D "Callup Spots (This Event)".
alter table public.events
  add column ends_at timestamptz,
  add column home_away text check (home_away in ('HOME', 'AWAY')),
  add column callup_spots integer not null default 0 check (callup_spots between 0 and 20),
  add constraint ends_after_start check (ends_at is null or ends_at > starts_at);

-- Wireframe 2C "Callup Settings": always include callups, and how many callup spots.
-- Wireframe 6b "Notification Settings": tell players when an Event is created.
alter table public.teams
  add column include_callups boolean not null default false,
  add column callup_spots integer not null default 0 check (callup_spots between 0 and 20),
  add column notify_new_events boolean not null default true;

-- Wireframe 13 "My Profile": phone.
alter table public.profiles add column phone text check (phone is null or char_length(phone) <= 30);
grant update (phone) on public.profiles to authenticated;

-- Wireframe 4a "Mark Unavailable": reason (optional), 75 characters.
alter table public.availability_blocks add column reason text check (reason is null or char_length(reason) <= 75);

-- Wireframe 7: a callup sees that they were invited as a callup and the Position needed. Players still
-- can't read callup_invitations (ranks, pools, other people), so this returns only their own
-- invitations, latest per Event, without rank or pool.
create function public.my_callup_invitations()
returns table (event_id uuid, position_name text, response public.attendance_response, closed boolean, invited_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select distinct on (ci.event_id)
    ci.event_id,
    coalesce(tp.name, mtp.name) as position_name,
    ci.response,
    ci.closed_at is not null as closed,
    ci.invited_at
  from public.callup_invitations ci
  left join public.team_positions tp on tp.id = ci.target_position_id
  left join public.team_memberships m on m.team_id = ci.team_id and m.user_id = ci.user_id
  left join public.member_positions mp on mp.membership_id = m.id
  left join public.team_positions mtp on mtp.id = mp.team_position_id
  where ci.user_id = auth.uid()
  order by ci.event_id, ci.invited_at desc
$$;
revoke execute on function public.my_callup_invitations() from public, anon;
grant execute on function public.my_callup_invitations() to authenticated;
