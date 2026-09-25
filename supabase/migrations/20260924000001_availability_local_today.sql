-- Availability dates are the player's local dates, but current_date is UTC. West of UTC in the
-- evening, the local "today" is already UTC "yesterday", so marking today unavailable was rejected.
-- Allow one day of slack: no time zone is more than a day behind UTC.
drop policy availability_insert_own on public.availability_blocks;
drop policy availability_update_own on public.availability_blocks;

create policy availability_insert_own on public.availability_blocks for insert to authenticated
  with check (user_id = auth.uid() and start_date >= current_date - 1);
create policy availability_update_own on public.availability_blocks for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid() and start_date >= current_date - 1);
