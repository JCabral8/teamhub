-- People who sign up with Google have no display_name of their own; Google sends their name as
-- full_name (and name). Use it before falling back to the start of their email address.
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, display_name)
  values (
    new.id,
    left(
      coalesce(
        nullif(btrim(new.raw_user_meta_data ->> 'display_name'), ''),
        nullif(btrim(new.raw_user_meta_data ->> 'full_name'), ''),
        nullif(btrim(new.raw_user_meta_data ->> 'name'), ''),
        split_part(new.email, '@', 1),
        'Player'
      ),
      80
    )
  );
  return new;
end $$;
