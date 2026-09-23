-- Row-level security. Clients read through these policies; every business write goes through the
-- `api` Edge Function (service connection), so most tables expose no insert/update/delete policies.
-- Manager-only tables (Positions of members, callup rankings and invitations, planning Positions)
-- are invisible to players (spec §41, §44, §45).

create function public.is_team_member(p_team_id uuid) returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.team_memberships m
    join public.teams t on t.id = m.team_id
    where m.team_id = p_team_id and m.user_id = auth.uid() and m.status = 'ACTIVE' and t.deleted_at is null
  )
$$;

create function public.is_team_manager(p_team_id uuid) returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.team_memberships m
    join public.teams t on t.id = m.team_id
    where m.team_id = p_team_id and m.user_id = auth.uid() and m.status = 'ACTIVE'
      and m.manager_role is not null and t.deleted_at is null
  )
$$;

create function public.event_team(p_event_id uuid) returns uuid
language sql stable security definer
set search_path = ''
as $$ select team_id from public.events where id = p_event_id $$;

alter table public.profiles enable row level security;
alter table public.teams enable row level security;
alter table public.team_memberships enable row level security;
alter table public.team_positions enable row level security;
alter table public.hybrid_position_components enable row level security;
alter table public.member_positions enable row level security;
alter table public.default_roster_requirements enable row level security;
alter table public.callup_pool_entries enable row level security;
alter table public.events enable row level security;
alter table public.event_roster_requirements enable row level security;
alter table public.event_roster_players enable row level security;
alter table public.event_roster_positions enable row level security;
alter table public.callup_invitations enable row level security;
alter table public.availability_blocks enable row level security;
alter table public.notifications enable row level security;
alter table public.push_tokens enable row level security;
alter table public.audit_log enable row level security;

-- Profiles: yourself, people on your Teams, and people asking to join a Team you manage.
create policy profiles_select on public.profiles for select to authenticated using (
  id = auth.uid()
  or exists (
    select 1 from public.team_memberships them
    where them.user_id = profiles.id
      and (
        (them.status = 'ACTIVE' and public.is_team_member(them.team_id))
        or public.is_team_manager(them.team_id)
      )
  )
);
create policy profiles_update_own on public.profiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());

-- Teams: members, plus players with a pending request (so they can see what they asked to join).
create policy teams_select on public.teams for select to authenticated using (
  deleted_at is null and exists (
    select 1 from public.team_memberships m
    where m.team_id = teams.id and m.user_id = auth.uid() and m.status in ('ACTIVE', 'PENDING')
  )
);

-- Memberships: your own rows; active members see the active roster; managers also see requests.
create policy memberships_select on public.team_memberships for select to authenticated using (
  user_id = auth.uid()
  or (status = 'ACTIVE' and public.is_team_member(team_id))
  or public.is_team_manager(team_id)
);

create policy team_positions_select on public.team_positions for select to authenticated
  using (public.is_team_member(team_id));
create policy hybrid_components_select on public.hybrid_position_components for select to authenticated
  using (exists (select 1 from public.team_positions p where p.id = hybrid_id and public.is_team_member(p.team_id)));
create policy default_requirements_select on public.default_roster_requirements for select to authenticated
  using (public.is_team_member(team_id));

create policy member_positions_select on public.member_positions for select to authenticated using (
  exists (select 1 from public.team_memberships m where m.id = membership_id and public.is_team_manager(m.team_id))
);
create policy callup_pool_select on public.callup_pool_entries for select to authenticated
  using (public.is_team_manager(team_id));

create policy events_select on public.events for select to authenticated
  using (public.is_team_member(team_id));
create policy event_requirements_select on public.event_roster_requirements for select to authenticated
  using (public.is_team_member(public.event_team(event_id)));
create policy event_roster_players_select on public.event_roster_players for select to authenticated
  using (public.is_team_member(public.event_team(event_id)));
create policy event_roster_positions_select on public.event_roster_positions for select to authenticated using (
  exists (
    select 1 from public.event_roster_players rp
    where rp.id = roster_player_id and public.is_team_manager(public.event_team(rp.event_id))
  )
);
create policy callup_invitations_select on public.callup_invitations for select to authenticated
  using (public.is_team_manager(team_id));

-- Availability: players manage their own future unavailable dates (spec §15, §57).
create policy availability_select_own on public.availability_blocks for select to authenticated
  using (user_id = auth.uid());
create policy availability_insert_own on public.availability_blocks for insert to authenticated
  with check (user_id = auth.uid() and start_date >= current_date);
create policy availability_update_own on public.availability_blocks for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid() and start_date >= current_date);
create policy availability_delete_own on public.availability_blocks for delete to authenticated
  using (user_id = auth.uid());

-- Notifications: read your own and mark them read.
create policy notifications_select_own on public.notifications for select to authenticated
  using (user_id = auth.uid());
create policy notifications_update_own on public.notifications for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
revoke update on public.notifications from authenticated;
grant update (read_at) on public.notifications to authenticated;

create policy push_tokens_own on public.push_tokens for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Profiles: only the name and preference are client-editable.
revoke update on public.profiles from authenticated;
grant update (display_name, preferred_position) on public.profiles to authenticated;

-- audit_log: no client access at all.
revoke all on public.audit_log from anon, authenticated;

-- Nothing is readable anonymously.
revoke all on all tables in schema public from anon;

-- Players must not be able to tell callups apart from regular players (invariants 14, 15), so the
-- roster source is not readable by clients. Managers see callups through callup_invitations.
-- Clients must name the columns they select from event_roster_players.
revoke select on public.event_roster_players from authenticated;
grant select (id, event_id, user_id, membership_id, response, response_origin, reason, pending_since, responded_at, added_at, removed_at)
  on public.event_roster_players to authenticated;
