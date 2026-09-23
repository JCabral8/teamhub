# V1 implementation decisions

The spec is explicit on most rules. Where it left a gap, these are the defaults the code uses. Each one is small to change.

| # | Topic | What the spec says | What V1 does |
|---|---|---|---|
| 1 | Where rules run | Backend must be authoritative (§18, §19) | Business processes run as TypeScript domain services inside the `api` Edge Function, one database transaction per command, with the Event row locked. Postgres enforces the invariants (enums, one Manager, one Goalie, hybrid composition, 75-character reasons) and RLS blocks direct client writes. |
| 2 | Roster capacity | "Check whether there is an available roster spot" (§37) | Default Roster quantities are the capacity. BASIC callup mode pools all skaters into one count with Goalie kept separate. ADVANCED counts each Position, and hybrids fill whichever underlying Position needs them. Players whose Position has no quantity fit any skater spot. A Team with no quantities set has no limit. |
| 3 | First answer when full | Only NO → YES is described | Any YES from a default-roster player that finds the roster full goes to Pending Approval, not just a change from NO. |
| 4 | When callups are invited | "Continue attempting to fill legitimate roster vacancies" (§50) | Automatically, once attendance is released, whenever a slot has no confirmed player, no player who has yet to answer, and no open callup invitation. Players who haven't answered still count, so callups only replace a definite NO. |
| 5 | Pending vs callups | Earliest pending player takes a freed spot (§37) | Pending players are placed before any new callup is invited. |
| 6 | Selection methods | Randomized rotation or predetermined sequence (§39) | Randomized rotation picks at random among the callups with the fewest accepted callups. Predetermined sequence always takes the highest-ranked eligible callup. A decline doesn't count against the player ("returned to the pool"). |
| 7 | Pool exhausted | Continue to other eligible pools (§42) | The needed Position's pool goes first (it includes hybrids), then the other skater pools in Position order. A Goalie need is never filled by a skater. |
| 8 | Callup changes mind | No pending process for callups (§48) | A callup who declined can still accept if the spot is open. If it's filled, they get "This spot has already been filled." They never go pending. |
| 9 | Unanswered callups | Managers close the window manually (§48) | Closing a callup's window removes them from the Event and invites the next callup. Nobody is invited twice for the same attendance round. |
| 10 | Date/time change | Needs a new attendance release (§30) | Everyone's answer resets to No Response. Callups who hadn't accepted drop off. Release is re-planned from the Team default, or the Manager is asked if that time has passed. |
| 11 | Unavailable players | Automatic NO at release (§57) | They get the automatic NO (flagged as system-generated) and no invitation notification. They can still change to YES. |
| 12 | New members and existing Events | Events are snapshots (§21) | A player approved after an Event was created isn't added to it automatically. Managers add them to that Event. |
| 13 | Deleting a Team | Team Manager can delete (§2) | Soft delete. The Team disappears for everyone, scheduled releases stop, history stays in the database. |
| 14 | Seed data | Default Positions (§7), example roster (§11, §34) | New Teams start with Goalie, Forward, Defence, Forward/Defence and quantities 1 / 6 / 4. |
| 15 | Team creator | Not specified | The creator is the Team Manager and isn't on the roster unless they choose to be. |
| 16 | Changing attendance settings | "Managers can change this" (§25) | Upcoming Events still on the Team's default release time move to the new settings. Events a Manager scheduled by hand keep their time. |
| 17 | Hybrids with Goalie | Hybrids combine base Positions (§9) | Goalie can't be part of a hybrid. |
| 18 | What players can see | Players don't see Positions or callup ranking (§44, §45, invariants 11–15) | Players can't read Positions, callup pools, ranks, targets or whether a roster entry is a callup. They see an alphabetical roster with each person's status and decline reason. |
| 19 | Manager invitation | Invitation, join link or request via link (§6) | A Manager invites by sharing the Team join link. There is no email invite or searchable directory. |
| 20 | Deleting Positions | Not specified | Allowed only when nothing uses the Position (players, hybrids, requirements, Event history). The Goalie can be disabled but not deleted. |
| 21 | Date and time pickers | Calendar for SCHEDULE LATER and bulk creation (§14, §27) | One month-grid calendar is used everywhere (schedule, SCHEDULE LATER, single and bulk creation, editing). Times are typed ("7:30 PM" or "19:30"), which works the same on iOS, Android and web without a native picker. |
| 22 | Player attendance counts | "1 Goalie · 9 Players", never lump the Goalie in (§33) | Managers see the Goalie/Players split. Players can't see Positions, so their roster header says "N attending" instead of "N Players". |
| 23 | Coverage before release | Red warnings when below requirement (§34) | Before attendance is sent the coverage chips are grey. They turn red or green once players are answering. |
| 24 | Team Settings sections | NOTIFICATIONS listed as an eventual section (§16) | V1 ships General, Attendance (mode, release timing, reminder), Default Roster, Positions, Callups and Members & Managers. Players turn push on or off in their phone settings. |
| 25 | Push delivery | Notifications for the §55 events | Every stored notification is pushed once to each of the recipient's registered devices through the Expo push service. Unregistered devices are forgotten. Notifications older than a day are never pushed late. |
