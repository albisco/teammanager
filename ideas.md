# Things to consider


### Duty Roster Page
- ~~Currently slow to load~~ — fixed (single consolidated API request)
- ~~Family allocation / duty tally~~ — built (shows per-family counts on roster page)
- ~~Multi-slot roles~~ — built (e.g. B&F Voting needs 3 people, Timekeeper × 2)
- ~~Draggable swap interface~~ — built (drag name to another round in same role row to swap)


### Team awards
- Add team awards functionality at a team level


### Family Portal
- What do we show families associated with the team
- View upcoming roster and what they are allocated to
- Availability management (mark unavailable for a round — model exists, no UI yet)
- Family exclusions UI (model exists, no UI yet)


## Players/Families
- We may link 1 family account to more than 1 player
- LATER: Populate with more player details


### WhatsApp / Messaging
- Link or share a snippet of the upcoming roster for the week
- How would a parent mark themselves unavailable — in-app or TM manually overrides?


### PlayHQ Integration
- Pull round, season and player information via API
- Once-off import vs ongoing sync — TBD


## Voting
- ~~QR code per team approach~~ — built
- Vote duplicate prevention — decide after family portal is built. Options:
  1. Single-use QR per voter — most secure, adds admin overhead
  2. Device cookie — simple but bypassable
  3. PIN-based — voters select name + enter PIN
  4. Pre-registered voter list + cookie (recommended) — fits existing `parentVoterCount`/`coachVoterCount` fields


## What's NOT Built Yet
- Family portal (availability management, view duties)
- Family exclusions UI (model exists, no UI)
- Admin dashboard with live counts
- PlayHQ integration
- User management (admin creating family/TM accounts, club onboarding)
- Vote duplicate prevention
- Team awards
