-- Realtime (spec §58): managers see roster counts, pending approval, Position counts, warnings and
-- callup impact update live. Realtime honours RLS, so manager-only tables stream only to managers.
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table
      public.events,
      public.event_roster_players,
      public.event_roster_requirements,
      public.event_roster_positions,
      public.callup_invitations,
      public.team_memberships,
      public.notifications;
  end if;
end $$;

-- Scheduled work: attendance releases, "ready to send" notices and manager reminders run every minute
-- by calling the `jobs` Edge Function. Requires pg_cron and pg_net (enabled on Supabase) plus two
-- Vault secrets: `project_url` and `service_role_key`. Skipped where the extensions are unavailable.
do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron')
     and exists (select 1 from pg_available_extensions where name = 'pg_net') then
    create extension if not exists pg_cron;
    create extension if not exists pg_net;
    perform cron.schedule(
      'teamhub-scheduled-jobs',
      '* * * * *',
      $job$
        select net.http_post(
          url := (select decrypted_secret from vault.decrypted_secrets where name = 'project_url') || '/functions/v1/jobs',
          headers := jsonb_build_object(
            'Content-Type', 'application/json',
            'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'service_role_key')
          ),
          body := '{}'::jsonb
        )
      $job$
    );
  end if;
end $$;
