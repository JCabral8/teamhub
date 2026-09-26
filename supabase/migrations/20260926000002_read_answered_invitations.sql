-- Answering an attendance request now marks its notification read, and sending attendance marks
-- the "ready to send" notice read. Catch up on ones already acted on, so they stop showing as new.
update public.notifications n set read_at = now()
where n.type = 'EVENT_INVITATION' and n.read_at is null
  and exists (
    select 1 from public.event_roster_players r
    where r.event_id = n.event_id and r.user_id = n.user_id and r.removed_at is null and r.response <> 'NO_RESPONSE'
  );

-- Likewise, "ready to send" notices for Events whose attendance is already out.
update public.notifications n set read_at = now()
where n.type = 'ATTENDANCE_READY' and n.read_at is null
  and exists (select 1 from public.events e where e.id = n.event_id and e.release_state = 'RELEASED');
