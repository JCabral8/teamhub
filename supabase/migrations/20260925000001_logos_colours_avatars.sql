-- Team logos and accent colours, and player profile pictures. Managers save Team branding through
-- the api function; image files are uploaded straight to Storage by whoever owns the folder.
alter table public.teams
  add column accent_color text check (accent_color ~ '^#[0-9A-F]{6}$'),
  add column logo_path text check (logo_path is null or (char_length(logo_path) <= 200 and split_part(logo_path, '/', 1) = id::text));

-- Logos are public images, so the app can show them with a plain address.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('team-logos', 'team-logos', true, 2097152, array['image/png', 'image/jpeg', 'image/webp', 'image/gif'])
on conflict (id) do nothing;

-- Files live under <team id>/, and only that Team's Managers can add, replace or remove them.
create function public.manages_logo_folder(p_name text) returns boolean
language sql stable security definer
set search_path = ''
as $$
  select case
    when (storage.foldername(p_name))[1] ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      then public.is_team_manager(((storage.foldername(p_name))[1])::uuid)
    else false
  end
$$;

create policy team_logos_select on storage.objects for select to authenticated
  using (bucket_id = 'team-logos' and public.manages_logo_folder(name));
create policy team_logos_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'team-logos' and public.manages_logo_folder(name));
create policy team_logos_update on storage.objects for update to authenticated
  using (bucket_id = 'team-logos' and public.manages_logo_folder(name))
  with check (bucket_id = 'team-logos' and public.manages_logo_folder(name));
create policy team_logos_delete on storage.objects for delete to authenticated
  using (bucket_id = 'team-logos' and public.manages_logo_folder(name));

-- The Slapsticks start in green. Any Manager can change it in Team Settings.
update public.teams set accent_color = '#15803D'
where name ilike 'slapstick%' and accent_color is null and deleted_at is null;

-- Profile pictures. Each person uploads to their own <user id>/ folder and saves the path on their
-- profile directly, like their name.
alter table public.profiles
  add column avatar_path text check (avatar_path is null or (char_length(avatar_path) <= 200 and split_part(avatar_path, '/', 1) = id::text));
grant update (avatar_path) on public.profiles to authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('avatars', 'avatars', true, 2097152, array['image/png', 'image/jpeg', 'image/webp', 'image/gif'])
on conflict (id) do nothing;

create policy avatars_select on storage.objects for select to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
create policy avatars_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
create policy avatars_update on storage.objects for update to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
create policy avatars_delete on storage.objects for delete to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
