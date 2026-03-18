# Things to consider

### Team only specific dashboard.
- We introduce  the team manager of the Griffens view. A specific ID. 
- So a Griffens U10 only view of the world.
-- Players for their team
-- Fixture for their team
-- Voting and roster for their team
- User Id linked to the manager role. That manager had access to a team only view. Not a family user.
- Game day checklist (future) 
- Voting at a club level. The team then follow the pattern for voting, they don't get a choice
- Team season page. 
-- Link to the ground 


### Duty Roster Page
-- Currently slow to load
-- Family allocation of roles for the season. 
    -- How many times have the "Savio's done duty" 
-- Do we want a "trello style" dragable interface (nice to have)



### Team awards 
- Add team awards functionality at a team level


### Parent-Team only view. 
-- What do we show families associated with the Team
-- Do they get access to a family portal where they can show upcoming roster for the team and what they are allocated

## Players/Families 
-- We may link 1 family member to more than 2 family members
-- LATER: Populate with more details

### Do we link up with a team whatsapp chat ? 
-- Have a link or snippet of the upcoming roster for the week ?
-- How would a parent say they are unavailble. In the app or managed by the team manager manually changing ? 


### Duty Roster Page
-- Currently slow to load
-- Family allocation of roles for the season. 
    -- How many times have the "Savio's done duty" 
-- Do we want a "trello style" dragable interface (or nice to have)



### Team HQ Integration
-- API Access
-- Pull the round, season and player information
-- Do we just need this as a once off or on-going integration

## Voting discussion
-- Are we happy with the current approach or want a QR code per family specifically ? 


## Vote Duplicate Prevention (TODO — decide after rostering)
Current system uses free-text voter name with deterministic ID (`anon_{sessionId}_{name}`). Options:

1. **Single-use QR per voter** — most secure, adds admin overhead
2. **Device cookie** — simple but bypassable
3. **PIN-based** — voters select name + enter PIN
4. **Pre-registered voter list + cookie** (recommended) — fits existing `parentVoterCount`/`coachVoterCount` fields

Decision depends on how family accounts work — tackle after rostering is built.



## What's NOT Built Yet
- Duty roster: family exclusions UI (model exists, no UI yet)
- Family portal (availability management, view duties)
- Admin dashboard with live counts
- PlayHQ integration (read-only pull of fixtures/players)
- User management (admin creating family accounts, club onboarding)
- Vote duplicate prevention (see below)



