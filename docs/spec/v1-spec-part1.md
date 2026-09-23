TEAM MANAGEMENT APP — V1 IMPLEMENTATION SPECIFICATION
PART 1 OF 2

(Copied verbatim from Justin's project-chat message of 2026-09-23. Part 2 covers attendance, roster, callup, notification and business-rule details.)

Build a cross-platform iOS/Android mobile application for amateur sports team management.

IMPORTANT:
This is V1. Focus on Team Management only. Do not implement future features unless specifically identified as architectural extension points.

==================================================
1. V1 OBJECTIVE
==================================================

V1 includes:

- User accounts
- Player profiles
- Team creation
- Team membership
- Manager and Assistant Manager roles
- Team join links
- Player join requests
- Manager approval
- Team roster
- Position management
- Default roster
- Custom Positions
- Hybrid Positions
- Goalie configuration
- Event/game creation
- Team schedule
- Calendar
- Team-specific settings
- Attendance
- Callups
- Attendance statistics
- Notifications

Future features must be architecturally possible but should NOT appear in V1:

- League management
- League standings
- League schedules
- Game sheets
- Live game statistics
- Goals/assists/penalties
- Timekeeping
- Offline game-sheet synchronization
- Coach role
- Coach-assigned positions
- Position preferences/ranking
- Rent-a-goalie
- Linked/tied callups
- Advanced rotating-roster callup allocation
- Spotify/music integration

==================================================
2. USER ROLES
==================================================

There is exactly ONE Manager per team.

There may be multiple Assistant Managers.

Unless explicitly stated otherwise, "Manager" means either:

- Team Manager
- Assistant Manager

The Team Manager has the additional ability to:

- Delete the team
- Assign another person as Manager
- Manage succession

When the Manager assigns another Manager:

The previous Manager immediately becomes an Assistant Manager.

A Manager cannot simply remove themselves as Manager without succession.

Assistant Managers:

- Can perform normal team-management operations
- Can modify team settings
- Can manage attendance
- Can manage callups
- Can remove themselves
- Cannot remove other Assistant Managers
- Cannot delete the team

If a Manager account is inactive for more than six months while the team remains active, the team may eventually be flagged for administrative review. This is a future administrative process and does not need to be automated in V1.

==================================================
3. APPLICATION NAVIGATION
==================================================

Player and Manager applications use the same primary navigation:

HOME
SCHEDULE
TEAM
OTHER

Do NOT create a separate Attendance tab.

Attendance belongs to the individual Event/Game Detail screen.

Statistics can be accessed under OTHER.

Managers also access Team Settings through the Team/Other structure.

==================================================
4. TEAM SCREEN
==================================================

The top of the Team screen must always show:

NEXT TEAM EVENT

This means the next chronological event regardless of type:

- Game
- Practice
- Tournament
- Social
- Meeting
- Custom Event

The Team screen also provides:

- Roster
- Games
- Events
- Team information

All team members can see the complete team schedule regardless of their Position.

==================================================
5. PLAYER ACCOUNTS
==================================================

Every player on a team is an application user.

Players can belong to multiple teams.

A player creates a personal profile and selects a preferred/default Position.

This is only the player's personal preference.

The player does NOT control their official team Position.

When joining a team:

1. Player's selected Position is shown to the Manager.
2. Manager is prompted to confirm it.
3. Manager can accept the player's Position.
4. Manager can change it.
5. Manager can change it at any time later.

Players do not need to see the team-assigned Position setting.

==================================================
6. TEAM JOINING
==================================================

V1 has NO searchable team database.

Players join only through:

- Manager invitation
- Team join link
- Player request using the join link

Manager approval is ALWAYS required.

A player is not an active team member until approved.

==================================================
7. POSITION SYSTEM
==================================================

Use the word:

POSITION

Never use "Classification" in the software.

Default Positions:

- Forward
- Defence
- Forward/Defence
- Goalie

Do NOT add "Striker" or any other example Position.

==================================================
8. GOALIE POSITION
==================================================

Goalie is a unique special Position.

A team may:

- Enable Goalie
- Disable Goalie
- Rename Goalie

Example:

Goalie → Keeper

Only one special Goalie Position can exist.

When disabled:

- Goalie-specific warnings disappear
- Goalie-specific roster logic disappears
- Goalie-specific functionality disappears

The Manager can re-enable it later.

==================================================
9. CUSTOM POSITIONS
==================================================

Managers can create custom Positions.

Example:

- Forward
- Defence
- Goalie
- Striker

Hybrid Positions must be composed from existing base Positions.

If the team only has:

Forward
Defence

Then it may create:

Forward/Defence

It cannot create:

Striker/Defence

until Striker exists as a base Position.

==================================================
10. HYBRID POSITIONS
==================================================

A hybrid player belongs to every applicable underlying Position.

Example:

Player X = Forward/Defence

Player X appears in:

- Forward pool
- Defence pool

There is NEVER a separate "Flexible F/D" pool.

The same architecture should support future hybrids containing more than two Positions.

==================================================
11. DEFAULT ROSTER
==================================================

Each team has a Default Roster configuration.

Example:

1 Goalie
6 Forwards
4 Defence

The quantities must be configurable.

The Default Roster is a template.

When an Event is created:

Team Default Roster
        ↓
Event Roster Snapshot

The Event gets its own copy.

Later changes to the Team Default Roster must NOT modify existing Events.

==================================================
12. EVENT TYPES
==================================================

Supported V1 event types:

- Game
- Practice
- Tournament
- Social
- Meeting
- Custom Event

Custom Event allows the Manager to enter a name.

The custom name does NOT become a permanent reusable event type.

All events use the same underlying Event and Attendance architecture.

==================================================
13. EVENT CREATION
==================================================

Managers can manually create Events.

Fields include:

- Event type
- Event name where applicable
- Date
- Time
- Opponent where applicable
- Location
- Notes where applicable

The Team's default arena/location automatically populates.

Manager can override this with:

Custom Location

==================================================
14. BULK EVENT CREATION
==================================================

The application must support large-scale event creation.

V1 should include calendar-based creation where Managers can select dates.

Architecture should also permit future spreadsheet/CSV/XLSX import.

Potential future import fields:

- Date
- Time
- Event type
- Opponent
- Location
- Notes

Spreadsheet import does not need to be implemented if it would delay V1.

==================================================
15. SCHEDULE
==================================================

Schedule supports:

- List view
- Calendar view

Both Players and Managers can use calendar view.

Players can mark future dates as:

UNAVAILABLE

When an Event falls on an unavailable date:

The system automatically records the player's attendance as NO when attendance is released.

This should be distinguishable internally as system-generated due to availability.

==================================================
16. TEAM SETTINGS
==================================================

Settings are TEAM-SPECIFIC.

If a Manager belongs to multiple teams:

Team Settings first asks:

Which Team?

Then presents settings for that team.

Settings should eventually include:

GENERAL
- Team name
- Arena
- Default location

ATTENDANCE
- Automatic/manual mode
- Default release timing
- Reminder configuration

DEFAULT ROSTER
- Position requirements
- Roster quantities

POSITIONS
- Base Positions
- Hybrid Positions
- Goalie configuration

CALLUPS
- Basic/Advanced
- Selection method

NOTIFICATIONS

MANAGERS

==================================================
17. PROFILE
==================================================

OTHER → MY PROFILE

Players and Managers can view/edit:

- Name
- Profile information
- Personal Position preference
- Account information
- Notification preferences

The personal Position preference is NOT authoritative for the team.

==================================================
18. DATA MODEL
==================================================

Build the backend around relational entities such as:

User
Team
TeamMembership
ManagerRole
PlayerProfile
Position
TeamPosition
HybridPosition
DefaultRoster
DefaultRosterPosition
Event
EventRoster
EventRosterPlayer
Attendance
AttendanceReason
AttendanceSchedule
CallupConfiguration
CallupPool
CallupInvitation
CallupResponse
PendingRosterRequest
AvailabilityBlock
Notification
AttendanceStatistics

Do not encode critical business rules only in the UI.

The backend/database must be authoritative.

==================================================
19. RECOMMENDED ARCHITECTURE
==================================================

Use a shared cross-platform codebase.

Recommended:

React Native
Expo
TypeScript

Backend:

PostgreSQL
Supabase

Use:

- Authentication
- Database
- Row-level security
- Realtime subscriptions
- Server-side functions where appropriate
- Push notifications

The exact stack may change if necessary, but preserve:

Type-safe client
+
Relational database
+
Server-authoritative business rules
+
Realtime updates

==================================================
20. DOMAIN SERVICES
==================================================

Do not put complex business logic directly into UI components.

Create domain/service modules such as:

AttendanceService
RosterService
CallupService
PositionService
EventService
MembershipService
NotificationService
StatisticsService

Important functions should include concepts such as:

calculateRosterStatus()
calculatePositionCoverage()
processAttendanceChange()
processCallupSelection()
processCallupResponse()
processPendingRoster()
releaseAttendance()

This architecture must allow future Coach, League and Game Management functionality without rewriting the existing system.

==================================================
21. EVENT ROSTER SNAPSHOT
==================================================

This is a critical architectural requirement.

When an Event is created:

Team Default Roster
        ↓
Event Roster Snapshot

The Event's roster is then independently editable.

Changing Team Defaults later must NOT change historical Events.

==================================================
22. AUDITABILITY
==================================================

Important operations should be internally timestamped/audited.

Examples:

- Attendance sent
- Attendance scheduled
- Attendance changed
- Player joined
- Player removed
- Callup invited
- Callup accepted
- Callup declined
- Manager changed
- Roster changed

These timestamps do not necessarily need to be displayed to users.

==================================================
23. TIME ZONES
==================================================

Every Team has a local timezone.

Attendance scheduling uses:

TEAM LOCAL TIME

not the user's device timezone.

Store timestamps consistently in UTC and convert to Team local time for scheduling/display.

==================================================
24. FUTURE GAME MANAGEMENT
==================================================

Do not implement Game Sheets yet.

However, the architecture should eventually permit:

- Offline game sheets
- Local game-sheet storage
- Sync queue
- Conflict resolution
- Event versioning
- Live game statistics

Do not build these systems in V1 unless required by the architecture.

END PART 1

Part 2 contains the detailed Attendance, Roster, Callup, notification and business-rule implementation requirements.
