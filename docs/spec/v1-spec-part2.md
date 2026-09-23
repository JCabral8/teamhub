TEAM MANAGEMENT APP — V1 IMPLEMENTATION SPECIFICATION
PART 2 OF 2

(Copied verbatim from Justin's project-chat message of 2026-09-23.)

This document continues Part 1.

The following rules are authoritative for V1.

==================================================
25. ATTENDANCE SETTINGS
==================================================

Attendance belongs to the Event/Game Detail screen.

It is NOT a separate application tab.

Attendance configuration is located under:

Team
→ Team Settings
→ Attendance

Default behavior:

AUTOMATIC

Default release:

2 calendar days before the Event
at 6:00 PM
using the Team's local timezone.

Managers can change this.

==================================================
26. AUTOMATIC VS MANUAL ATTENDANCE
==================================================

Two modes exist.

AUTOMATIC

The system automatically releases attendance at the configured date/time.

MANUAL

The system does NOT automatically send attendance.

Instead, the Manager receives a notification at the configured time:

"Attendance is ready to send."

The notification must clearly communicate that attendance has NOT yet been sent.

Manager then chooses:

- Send Now
- Schedule Later

==================================================
27. SEND ATTENDANCE
==================================================

Event Detail contains:

SEND ATTENDANCE

Selecting it opens:

SEND NOW
SCHEDULE LATER

SEND NOW:

Immediately releases attendance.

SCHEDULE LATER:

Open a calendar.

Rules:

- Event date is visible
- Dates after the Event are greyed out/disabled
- Past dates are greyed out/disabled
- Manager chooses a valid date
- Then chooses a time

Time picker contains:

One hour before default
Team default
One hour after default
Custom Time

Example:

5:00 PM

6:00 PM
Team Default

7:00 PM

Custom Time

Team default should be selected initially.

==================================================
28. SENT STATE
==================================================

After sending:

Attendance Sent
Players have been notified

Do NOT display a timestamp saying when it was sent.

==================================================
29. EVENTS CREATED AFTER NORMAL NOTIFICATION TIME
==================================================

If an Event is created after the normal attendance release time has already passed:

Ask the Manager specifically whether they want:

SEND NOW

or

HOLD OFF

Do not silently send attendance.

==================================================
30. EVENT CHANGES AFTER ATTENDANCE
==================================================

If attendance has already been released:

Changing DATE requires a new attendance release.

Changing TIME requires a new attendance release.

When saving the Event change, warn the Manager:

"The Event date/time has changed. A new attendance request will need to be sent."

Changes to other fields do NOT require a new attendance request.

Examples:

- Opponent
- Location
- Notes
- Other non-date/time fields

==================================================
31. ATTENDANCE RESPONSE STATES
==================================================

There are ONLY:

YES
NO
NO RESPONSE

There is NEVER a:

MAYBE

Do not use "Maybe" anywhere in:

- Database enums
- UI
- Notifications
- Reports
- Statistics
- Documentation
- Wireframes
- Validation

==================================================
32. DECLINING
==================================================

If Player selects:

NO

They may enter a reason.

Maximum:

75 characters.

The reason is visible to the appropriate team/event viewers according to the current team visibility model.

No long explanations are permitted.

==================================================
33. ATTENDANCE SUMMARY
==================================================

Always separate Goalie.

Example:

1 Goalie
9 Players

Never show:

10 Players

when one is a Goalie.

==================================================
34. POSITION COVERAGE
==================================================

Managers should see Position coverage warnings.

Example default hockey rules:

Goalie missing:
RED

Defence below 4:
RED

Forward below 6:
RED

These numbers must come from configurable roster requirements rather than hardcoded logic.

==================================================
35. POSITION COUNTS
==================================================

This rule is critical.

When a Position has a number beside it, the number means:

NUMBER OF ATTENDING PLAYERS

It does NOT mean:

- Number invited
- Number rostered
- Number originally selected

Example:

Forward (6)

means:

6 Forward players are currently attending.

If 8 Forwards were invited but 2 declined:

Forward (6)

NOT:

Forward (8)

==================================================
36. NOT ATTENDING DISPLAY
==================================================

Players who are not attending remain in their normal Position section.

Do NOT create a separate:

NOT ATTENDING

category.

Within each Position:

Attending players appear first.

Not Attending players appear at the bottom.

Example:

FORWARD (6)

Player A — Attending
Player B — Attending
Player C — Attending
Player D — Attending
Player E — Attending
Player F — Attending
Player G — Not Attending
Player H — Not Attending

The Position count remains:

6

==================================================
37. PLAYER ATTENDANCE CHANGES
==================================================

Attendance can be changed at any time.

YES → NO

Allowed.

Normal roster/callup logic continues.

NO → YES

For a default roster player:

Check whether there is an available roster spot.

If there is space:

Immediately restore the player to the attending roster.

If there is no space:

Place them into:

PENDING APPROVAL

Notify Managers that there is a roster discrepancy.

Pending players are processed first-come-first-served.

If another player subsequently leaves:

The earliest eligible Pending Approval player immediately takes the available spot.

==================================================
38. CALLUPS
==================================================

Team setting:

CALLUP SYSTEM

Default:

BASIC

Two modes:

BASIC
ADVANCED

==================================================
39. BASIC CALLUPS
==================================================

Basic Callups use a single list.

Position classifications are ignored.

The exception is Goalie if Goalie functionality is enabled.

The Manager chooses the selection method:

RANDOMIZED ROTATION

or

PREDETERMINED SEQUENCE

The system should track selection history.

==================================================
40. ADVANCED CALLUPS
==================================================

Advanced Callups use Position-aware pools.

Example:

FORWARD CALLUPS

1. Player A
2. Player B
3. Player C

DEFENCE CALLUPS

1. Player D
2. Player E
3. Player F

A Hybrid Player appears in every applicable Position pool.

There is NEVER a separate:

Flexible F/D

pool.

==================================================
41. HYBRID CALLUPS
==================================================

Example:

Player X = Forward/Defence

Player X exists in:

Forward Callup Pool
AND
Defence Callup Pool

The same player may therefore be selected for either need.

Their position-specific ranking can differ between pools.

Example:

Forward:
3rd

Defence:
1st

Players must never see this ranking.

==================================================
42. CALLUP POSITION EXHAUSTION
==================================================

If a Position's callup list is exhausted while a requirement remains:

Automatically continue to the other eligible Position pool.

Example:

Need Defence.

Defence Callup Pool exhausted.

System searches eligible alternate Position pools.

Hybrid players may satisfy the missing Position.

Do NOT create a new Flexible Position pool.

==================================================
43. ATTENDING HYBRID PLAYERS
==================================================

If a player attending an Event has multiple Positions and one Position is deficient:

The system may internally assign the player to the deficient Position for Manager planning.

This is NOT a player-facing assignment.

Players do not see the planning Position.

==================================================
44. PLAYER POSITION VISIBILITY
==================================================

V1:

Managers see Position information.

Players do NOT see the Position they are being used for in Event planning.

Players are not asked:

"What position are you attending as?"

If they decline:

Do not ask them to choose another Position.

Future Coach functionality will eventually allow coaches to assign actual Event Positions.

==================================================
45. CALLUP VISIBILITY
==================================================

Players may see:

- Default roster
- Callups
- Accepted callups
- Declined callups

Players may NOT see:

- Callup ranking
- Callup priority
- Selection order
- Position-specific callup ranking
- Why another player was selected before them

Displayed roster/callup lists should be alphabetical to avoid exposing ranking.

The system may internally retain ranking/order.

==================================================
46. CALLUP NOTIFICATIONS
==================================================

Callup notifications should visually look like normal Event/player notifications.

Do NOT use:

"Callup Opportunity"

as a notification label.

Do NOT visually distinguish callups with a special notification style.

The player should simply receive the Event invitation.

==================================================
47. ACCEPTED CALLUP DISPLAY
==================================================

When a Callup accepts:

They become an attending Event participant.

Their Event should look exactly like a regular accepted Event.

Do NOT display:

- Callup badge
- Callup indicator
- Callup label

on the player's Schedule.

==================================================
48. CALLUP RESPONSE
==================================================

Callups respond:

YES
NO

There is no Maybe.

There is no automatic response expiry.

Managers decide manually when the response window is closed.

If Callup declines:

Return them to the Callup pool.

Callups do NOT receive the special NO → YES pending approval process.

==================================================
49. POST-ATTENDANCE PLAYER ADDITION
==================================================

If a Manager adds a player after attendance has already been released:

Manager chooses:

SEND ATTENDANCE REQUEST

or

ADD WITHOUT ATTENDANCE REQUEST

The second option immediately adds the player.

This can bypass Callup rules but must still respect roster quantity rules.

==================================================
50. CALLUP EXHAUSTION AND ROSTER LOGIC
==================================================

The Callup system should continue attempting to fill legitimate roster vacancies.

However:

Do not automatically assume a fixed number of Callups per Event.

There is NO default:

"3 Callups"

Callups exist only when roster requirements create a need.

==================================================
51. ATTENDANCE STATISTICS
==================================================

Track regular roster attendance:

- Invitations
- Yes
- No
- No Response

Track Callup attendance:

- Callup invitations
- Accepted
- Declined
- No Response

Statistics should be available to:

Managers
AND
Players

==================================================
52. HISTORICAL PLAYERS
==================================================

When a player is removed from a Team:

Keep their historical records.

Historical records can remain accessible.

However:

They do NOT count toward:

- Current roster
- Current Position counts
- Current attendance statistics
- Current callup calculations

==================================================
53. PLAYER REMOVAL
==================================================

Manager removing a player should NOT be shown their attendance statistics during the removal process.

The system simply performs the appropriate roster/event operations.

==================================================
54. MANAGER REMINDERS
==================================================

There is no automatic Callup expiry.

Approximately 12 hours before an Event, the Manager may receive:

"X number of people have not completed their attendance."

This should be configurable.

==================================================
55. NOTIFICATIONS
==================================================

Potential notifications:

- Attendance ready
- Attendance sent
- Attendance discrepancy
- Pending approval
- Callup invitation
- Callup accepted
- Callup declined
- Event date changed
- Event time changed
- Team membership request
- Manager succession
- Attendance reminder

Notifications must never expose callup ranking.

==================================================
56. TEAM MANAGER GOVERNANCE
==================================================

Exactly one Manager exists per Team.

Manager can:

- Assign another Manager
- Become Assistant Manager immediately
- Remove Assistant Managers
- Delete Team

Assistant Managers:

- Can remove themselves
- Cannot remove other Assistant Managers
- Cannot delete Team

==================================================
57. ATTENDANCE AVAILABILITY
==================================================

Players can mark future unavailable dates through Schedule.

Example:

September 20:
Unavailable

September 27:
Unavailable

When an Event falls within an unavailable period:

Attendance automatically becomes:

NO

when attendance is released.

==================================================
58. REALTIME UPDATES
==================================================

Use realtime updates where useful.

Examples:

When a Player changes:

NO → YES

Managers should immediately see:

- Roster count
- Pending approval
- Position count
- Position warning
- Callup impact

updated appropriately.

==================================================
59. IMPORTANT DOMAIN FUNCTIONS
==================================================

Implement and test domain functions such as:

calculateRosterStatus()

calculatePositionCoverage()

calculateAttendanceCounts()

processAttendanceChange()

processPendingRoster()

processCallupSelection()

processCallupResponse()

releaseAttendance()

scheduleAttendance()

handleEventChange()

calculateCallupEligibility()

calculateHybridEligibility()

==================================================
60. CRITICAL INVARIANTS
==================================================

The following must always be true:

1. Attendance states are:
YES / NO / NO_RESPONSE

2. MAYBE does not exist.

3. Position counts represent ATTENDING players.

4. Not-attending players remain inside their Position group.

5. Not-attending players appear at the bottom of that group.

6. Goalie is a unique special Position.

7. At most one special Goalie Position exists.

8. Hybrid players belong to each applicable underlying Position.

9. There is no Flexible F/D pool.

10. Callups are not automatically fixed at three per Event.

11. Players cannot see Callup ranking.

12. Players cannot see the Position for which they are being considered as a Callup.

13. Callup notifications look like normal Event notifications.

14. Accepted Callups look like normal accepted Players.

15. No Callup indicator appears on the Player's Schedule.

16. Event rosters are snapshots of Team defaults.

17. Changing Team defaults does not alter existing Events.

18. Date/time changes after attendance release require a new attendance release.

19. Opponent/location/notes changes do not require attendance to be resent.

20. Attendance reasons have a maximum of 75 characters.

==================================================
61. REQUIRED TEST SCENARIOS
==================================================

Automated tests should cover at minimum:

1. Player selects Yes.
2. Player selects No.
3. Player leaves No Response.
4. Player changes Yes → No.
5. Player changes No → Yes with space.
6. Player changes No → Yes without space.
7. Pending player gets a space.
8. Multiple pending players compete for one spot.
9. Callup accepts.
10. Callup declines.
11. Callup pool is exhausted.
12. Hybrid player satisfies another Position.
13. Goalie missing.
14. Goalie disabled.
15. Custom Position created.
16. Hybrid Position created.
17. Invalid Hybrid Position rejected.
18. Player removed.
19. Player added after attendance release.
20. Automatic attendance.
21. Manual attendance.
22. Scheduled attendance.
23. Send Now.
24. Event created after normal release time.
25. Event date changed after attendance.
26. Event time changed after attendance.
27. Opponent changed after attendance.
28. Location changed after attendance.
29. Player unavailable on Event date.
30. Multiple teams.
31. Manager transfer.
32. Assistant Manager removal.
33. Position counts include attending only.
34. Not-attending players remain in same Position group.
35. Not-attending players sort to bottom.
36. Confirm no Maybe state exists anywhere.
37. Confirm players cannot see Callup rankings.
38. Confirm players cannot see Callup target Position.
39. Confirm Callup notification looks like normal Event notification.
40. Confirm accepted Callup looks identical to normal accepted Player.

==================================================
62. DEVELOPMENT ORDER
==================================================

Implement in this sequence:

PHASE 1
Authentication
Users
Profiles
Navigation

PHASE 2
Teams
Membership
Join links
Manager/Assistant Manager permissions

PHASE 3
Positions
Hybrid Positions
Goalie
Default Roster

PHASE 4
Events
Event Roster Snapshots
Calendar
Locations

PHASE 5
Attendance
Automatic/manual modes
Scheduling
Availability
Attendance changes
Pending approval

PHASE 6
Callups
Basic mode
Randomized rotation
Sequence mode
Advanced Position pools
Hybrid logic

PHASE 7
Statistics

PHASE 8
Notifications

PHASE 9
Edge-case testing
Security testing
Permission testing
Realtime testing

==================================================
63. DEFINITION OF DONE
==================================================

A Manager must be able to complete this entire workflow:

Create Team
↓
Configure Positions
↓
Configure Default Roster
↓
Invite Players
↓
Approve Players
↓
Create Event
↓
Event receives roster snapshot
↓
Modify Event roster if necessary
↓
Send/Schedule Attendance
↓
Players respond Yes/No
↓
Roster updates
↓
Position shortages are identified
↓
Callups are selected when required
↓
Callups respond
↓
Accepted Callups fill vacancies
↓
Pending returning Players are processed
↓
Final roster is established
↓
Attendance statistics are recorded

The application should be production-oriented rather than a throwaway prototype.

Use:

- Strong relational data modeling
- Server-side authorization
- Database constraints
- Automated tests
- Migrations
- Error handling
- Logging
- Realtime synchronization
- Clean separation between UI and domain logic

Most importantly:

DO NOT invent behavior where the specification is explicit.

Where requirements conflict, use the most recent requirement in this specification.

Future features should have clean architectural extension points but must not leak into V1.

END PART 2
