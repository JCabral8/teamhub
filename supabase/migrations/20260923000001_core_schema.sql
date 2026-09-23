-- TeamHub V1 core schema.
-- The database is authoritative: enums, constraints and triggers enforce the invariants that must hold
-- no matter which client or service writes. Multi-step business processes run in the `api` Edge
-- Function inside a single transaction (see src/server).

-- ---------------------------------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------------------------------

-- Spec §31: exactly three states: YES, NO and NO_RESPONSE.
create type public.attendance_response as enum ('YES', 'NO', 'NO_RESPONSE');
create type public.response_origin as enum ('PLAYER', 'SYSTEM_AVAILABILITY', 'MANAGER');
create type public.manager_role as enum ('MANAGER', 'ASSISTANT_MANAGER');
create type public.membership_status as enum ('PENDING', 'ACTIVE', 'DECLINED', 'REMOVED');
create type public.roster_role as enum ('ROSTER', 'CALLUP', 'NONE');
create type public.position_kind as enum ('BASE', 'GOALIE', 'HYBRID');
create type public.event_type as enum ('GAME', 'PRACTICE', 'TOURNAMENT', 'SOCIAL', 'MEETING', 'CUSTOM');
create type public.attendance_mode as enum ('AUTOMATIC', 'MANUAL');
create type public.callup_mode as enum ('BASIC', 'ADVANCED');
create type public.callup_selection_method as enum ('RANDOMIZED_ROTATION', 'PREDETERMINED_SEQUENCE');
create type public.roster_source as enum ('ROSTER', 'CALLUP', 'MANAGER_ADDED');
create type public.release_state as enum ('UNSENT', 'SCHEDULED', 'RELEASED');
create type public.release_action as enum ('RELEASE', 'NOTIFY_MANAGER');
create type public.notification_type as enum (
  'EVENT_INVITATION',
  'ATTENDANCE_READY',
  'ATTENDANCE_SENT',
  'ATTENDANCE_DISCREPANCY',
  'PENDING_APPROVAL',
  'ROSTER_SPOT_CONFIRMED',
  'CALLUP_ACCEPTED',
  'CALLUP_DECLINED',
  'EVENT_DATE_CHANGED',
  'EVENT_TIME_CHANGED',
  'MEMBERSHIP_REQUEST',
  'MANAGER_SUCCESSION',
  'ATTENDANCE_REMINDER'
);

create function public.is_valid_timezone(tz text) returns boolean
language sql stable
set search_path = ''
as $$ select exists (select 1 from pg_catalog.pg_timezone_names where name = tz) $$;

create function public.touch_updated_at() returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end $$;

-- ---------------------------------------------------------------------------------------------------
-- Users and profiles (Phase 1)
-- ---------------------------------------------------------------------------------------------------

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null check (char_length(btrim(display_name)) between 1 and 80),
  -- Personal preference only; never authoritative for a Team (spec §5, §17).
  preferred_position text check (preferred_position is null or char_length(preferred_position) <= 40),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger profiles_updated_at before update on public.profiles
  for each row execute function public.touch_updated_at();

create function public.handle_new_user() returns trigger
language plpgsql security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, display_name)
  values (
    new.id,
    coalesce(nullif(btrim(new.raw_user_meta_data ->> 'display_name'), ''), split_part(new.email, '@', 1), 'Player')
  );
  return new;
end $$;

create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------------------------------
-- Teams and membership (Phase 2)
-- ---------------------------------------------------------------------------------------------------

create table public.teams (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(btrim(name)) between 1 and 80),
  timezone text not null check (public.is_valid_timezone(timezone)),
  arena text check (arena is null or char_length(arena) <= 120),
  default_location text check (default_location is null or char_length(default_location) <= 200),
  -- Attendance settings (spec §25, §54)
  attendance_mode public.attendance_mode not null default 'AUTOMATIC',
  release_days_before integer not null default 2 check (release_days_before between 0 and 30),
  release_time time not null default '18:00',
  reminder_enabled boolean not null default true,
  reminder_hours_before integer not null default 12 check (reminder_hours_before between 1 and 168),
  -- Callup settings (spec §38)
  callup_mode public.callup_mode not null default 'BASIC',
  callup_selection_method public.callup_selection_method not null default 'RANDOMIZED_ROTATION',
  -- Goalie configuration (spec §8)
  goalie_enabled boolean not null default true,
  join_code text not null unique default replace(gen_random_uuid()::text, '-', ''),
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create trigger teams_updated_at before update on public.teams
  for each row execute function public.touch_updated_at();

create table public.team_memberships (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  status public.membership_status not null default 'PENDING',
  manager_role public.manager_role,
  roster_role public.roster_role not null default 'ROSTER',
  -- The Position the player asked for when requesting to join (their profile preference at the time).
  requested_position text,
  requested_at timestamptz not null default now(),
  approved_at timestamptz,
  approved_by uuid references public.profiles (id) on delete set null,
  removed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (team_id, user_id),
  constraint manager_role_requires_active check (manager_role is null or status = 'ACTIVE')
);
create trigger team_memberships_updated_at before update on public.team_memberships
  for each row execute function public.touch_updated_at();

-- Exactly one Team Manager per Team (spec §2, §56).
create unique index team_memberships_one_manager
  on public.team_memberships (team_id)
  where manager_role = 'MANAGER';
create index team_memberships_user on public.team_memberships (user_id);

-- ---------------------------------------------------------------------------------------------------
-- Positions and default roster (Phase 3)
-- ---------------------------------------------------------------------------------------------------

create table public.team_positions (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams (id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 200),
  kind public.position_kind not null,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  -- Only hybrids combine Positions with the separator.
  constraint base_name_has_no_separator check (kind = 'HYBRID' or (position('/' in name) = 0 and char_length(name) <= 40)),
  unique (team_id, id)
);
create unique index team_positions_unique_name on public.team_positions (team_id, lower(name));
-- At most one special Goalie Position per Team (spec §8, invariant 7).
create unique index team_positions_one_goalie on public.team_positions (team_id) where kind = 'GOALIE';

create table public.hybrid_position_components (
  hybrid_id uuid not null references public.team_positions (id) on delete cascade,
  component_id uuid not null references public.team_positions (id) on delete restrict,
  primary key (hybrid_id, component_id)
);

-- A hybrid is composed only of existing base Positions of the same Team (spec §9).
create function public.check_hybrid_component() returns trigger
language plpgsql
set search_path = ''
as $$
declare
  h public.team_positions;
  c public.team_positions;
begin
  select * into h from public.team_positions where id = new.hybrid_id;
  select * into c from public.team_positions where id = new.component_id;
  if h.kind <> 'HYBRID' then
    raise exception 'Position % is not a hybrid', h.id using errcode = '23514';
  end if;
  if c.kind <> 'BASE' or c.team_id <> h.team_id then
    raise exception 'Hybrid Positions can only combine base Positions of the same Team' using errcode = '23514';
  end if;
  return new;
end $$;
create trigger hybrid_component_valid before insert or update on public.hybrid_position_components
  for each row execute function public.check_hybrid_component();

-- Official team Position per member. Manager-only information (spec §5, §44).
create table public.member_positions (
  membership_id uuid primary key references public.team_memberships (id) on delete cascade,
  team_position_id uuid not null references public.team_positions (id) on delete restrict,
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles (id) on delete set null
);
create trigger member_positions_updated_at before update on public.member_positions
  for each row execute function public.touch_updated_at();

create function public.check_member_position() returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if not exists (
    select 1
    from public.team_memberships m
    join public.team_positions p on p.team_id = m.team_id
    where m.id = new.membership_id and p.id = new.team_position_id
  ) then
    raise exception 'Position belongs to another Team' using errcode = '23514';
  end if;
  return new;
end $$;
create trigger member_position_same_team before insert or update on public.member_positions
  for each row execute function public.check_member_position();

-- Team Default Roster template (spec §11): quantities per base or Goalie Position.
create table public.default_roster_requirements (
  team_id uuid not null references public.teams (id) on delete cascade,
  team_position_id uuid not null,
  quantity integer not null check (quantity between 0 and 99),
  primary key (team_id, team_position_id),
  foreign key (team_id, team_position_id) references public.team_positions (team_id, id) on delete cascade
);

create function public.check_requirement_position() returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if (select kind from public.team_positions where id = new.team_position_id) = 'HYBRID' then
    raise exception 'Requirements apply to base Positions and Goalie, not hybrids' using errcode = '23514';
  end if;
  return new;
end $$;
create trigger default_requirement_position before insert or update on public.default_roster_requirements
  for each row execute function public.check_requirement_position();

-- Manager-only callup ranking per pool (spec §40, §41). pool_key is 'SKATERS' or a Position id.
create table public.callup_pool_entries (
  team_id uuid not null references public.teams (id) on delete cascade,
  pool_key text not null,
  user_id uuid not null references public.profiles (id) on delete cascade,
  rank integer not null check (rank >= 1),
  primary key (team_id, pool_key, user_id)
);

-- ---------------------------------------------------------------------------------------------------
-- Events and roster snapshots (Phase 4)
-- ---------------------------------------------------------------------------------------------------

create table public.events (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams (id) on delete cascade,
  type public.event_type not null,
  -- Custom Event name. Not a reusable type (spec §12).
  name text check (name is null or char_length(btrim(name)) between 1 and 80),
  opponent text check (opponent is null or char_length(opponent) <= 80),
  location text check (location is null or char_length(location) <= 200),
  notes text check (notes is null or char_length(notes) <= 1000),
  starts_at timestamptz not null,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- Attendance release state (spec §25–§29). Timestamps stay internal (spec §28).
  release_state public.release_state not null default 'UNSENT',
  release_at timestamptz,
  release_action public.release_action,
  released_at timestamptz,
  ready_notified_at timestamptz,
  reminder_sent_at timestamptz,
  attendance_round integer not null default 0,
  constraint custom_event_has_name check (type <> 'CUSTOM' or name is not null),
  constraint scheduled_release_has_time check (release_state <> 'SCHEDULED' or (release_at is not null and release_action is not null)),
  unique (team_id, id)
);
create trigger events_updated_at before update on public.events
  for each row execute function public.touch_updated_at();
create index events_team_starts on public.events (team_id, starts_at);
create index events_due_release on public.events (release_at) where release_state = 'SCHEDULED';

-- Event Roster Snapshot of the requirement quantities (spec §11, §21). Independently editable.
create table public.event_roster_requirements (
  event_id uuid not null references public.events (id) on delete cascade,
  team_position_id uuid not null references public.team_positions (id) on delete restrict,
  quantity integer not null check (quantity between 0 and 99),
  primary key (event_id, team_position_id)
);

create table public.event_roster_players (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  membership_id uuid not null references public.team_memberships (id) on delete cascade,
  source public.roster_source not null,
  response public.attendance_response not null default 'NO_RESPONSE',
  response_origin public.response_origin,
  -- Spec §32: optional, 75 characters maximum, only with NO.
  reason text check (reason is null or char_length(reason) <= 75),
  -- Set while a YES waits for a roster spot (PENDING APPROVAL), first-come-first-served.
  pending_since timestamptz,
  responded_at timestamptz,
  added_at timestamptz not null default now(),
  removed_at timestamptz,
  unique (event_id, user_id),
  constraint reason_only_with_no check (reason is null or response = 'NO'),
  constraint pending_only_with_yes check (pending_since is null or response = 'YES')
);
create index event_roster_players_user on public.event_roster_players (user_id);

-- Official Position snapshot per Event roster entry. Manager-only (spec §44).
create table public.event_roster_positions (
  roster_player_id uuid primary key references public.event_roster_players (id) on delete cascade,
  team_position_id uuid not null references public.team_positions (id) on delete restrict
);

-- Manager-only record of each callup invitation: target Position, pool and rank (spec §41, §45).
create table public.callup_invitations (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events (id) on delete cascade,
  team_id uuid not null references public.teams (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  attendance_round integer not null,
  target_position_id uuid references public.team_positions (id) on delete set null,
  pool_key text not null,
  rank integer not null,
  invited_at timestamptz not null default now(),
  response public.attendance_response not null default 'NO_RESPONSE',
  responded_at timestamptz,
  closed_at timestamptz,
  closed_by uuid references public.profiles (id) on delete set null
);
create index callup_invitations_event on public.callup_invitations (event_id);
create index callup_invitations_team_user on public.callup_invitations (team_id, user_id);
create unique index callup_invitations_one_open on public.callup_invitations (event_id, user_id)
  where closed_at is null and response = 'NO_RESPONSE';

-- ---------------------------------------------------------------------------------------------------
-- Availability (Phase 5)
-- ---------------------------------------------------------------------------------------------------

create table public.availability_blocks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade default auth.uid(),
  start_date date not null,
  end_date date not null,
  created_at timestamptz not null default now(),
  constraint availability_range check (end_date >= start_date)
);
create index availability_blocks_user on public.availability_blocks (user_id, start_date);

-- ---------------------------------------------------------------------------------------------------
-- Notifications (Phase 8) and audit (spec §22)
-- ---------------------------------------------------------------------------------------------------

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  team_id uuid references public.teams (id) on delete cascade,
  event_id uuid references public.events (id) on delete cascade,
  type public.notification_type not null,
  title text not null,
  body text not null,
  created_at timestamptz not null default now(),
  read_at timestamptz,
  push_sent_at timestamptz
);
create index notifications_user on public.notifications (user_id, created_at desc);
create index notifications_unsent_push on public.notifications (created_at) where push_sent_at is null;

create table public.push_tokens (
  user_id uuid not null references public.profiles (id) on delete cascade default auth.uid(),
  token text not null,
  platform text not null check (platform in ('ios', 'android')),
  created_at timestamptz not null default now(),
  primary key (user_id, token)
);

create table public.audit_log (
  id bigint generated always as identity primary key,
  team_id uuid,
  event_id uuid,
  actor_id uuid,
  action text not null,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index audit_log_team on public.audit_log (team_id, created_at);
