-- Calendar subscriptions: one secret feed token per person. Only the api and calendar functions
-- (service connection) read or write it; clients get their token through the getCalendarFeed command.
create table public.calendar_feeds (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  token text not null unique check (token ~ '^[0-9a-f]{64}$'),
  created_at timestamptz not null default now()
);
alter table public.calendar_feeds enable row level security;
revoke all on public.calendar_feeds from anon, authenticated;
