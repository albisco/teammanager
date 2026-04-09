# Things to consider


### Duty Roster Page
- ~~Currently slow to load~~ — fixed (single consolidated API request)
- ~~Family allocation / duty tally~~ — built (shows per-family counts on roster page)
- ~~Multi-slot roles~~ — built (e.g. B&F Voting needs 3 people, Timekeeper × 2)
- ~~Draggable swap interface~~ — built (drag name to another round in same role row to swap)


### Team awards
- ~~Add team awards functionality at a team level~~ — built (award types with quantity, weekly assignment, season summary with never-won highlighting)


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
- ~~Team awards~~ — built

## LM Notes
- I addded players using the admin login, logged out then went to the team manager login and the players I added weren't showing, I also added players with the same name again, accidently and it allowed me to have two players with the same name.  Players that are added and assigned to a team, U10 Lions, are still not showing up when I log in as the TM for U10 Lions.
- Did 4 lots of voting and closed them, used the QR code for three and the link for one, all good so far.  Closed the voting, might be good to remove the QRCode when closed.  I did try to add more votes after closing and it wouldn't let me, so it is not a major issue
- Add scores for each round.  As the team manager we have to load scores into 
- Voting rule, every family should be included in this and spread through all families.  The coach and assistant coach should also be included, separate to their coaching role.  I tried to use the specialist type, add all people (not families) to see if that would work.  It said the role was already confiugured when I added more than 14 people and wouldn't save.  Idea would be select all families to be included,  have 2 families (it has people) to be included each week, then generate. Voting has changed this year to be both coaches put votes in each and 2 familes
