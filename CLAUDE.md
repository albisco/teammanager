# CLAUDE.md

## Project

Team Manager — Multi-tenant sport team management web app. Manage multiple clubs, teams across age groups. Replace spreadsheets: player management, best & fairest voting (QR codes), duty rostering, family self-service.

## Tech Stack

- **Next.js 14** (App Router, TypeScript), **Prisma 6** ORM, **PostgreSQL** (Neon serverless, Sydney region)
- **NextAuth.js 4** (credentials provider, JWT sessions with clubId, role-based middleware)
- **Tailwind CSS 3** + hand-rolled shadcn-style UI components
- **Neon adapter:** `@prisma/adapter-neon` for HTTP queries (no TCP cold starts)
- **QR Codes:** `qrcode` library, **Toasts:** `sonner`

## Commands

- `npm run dev` — start dev server on port 3000
- `npm run build` — runs `prisma generate && next build` (production build)
- `npx prisma db push` — push schema to DB (non-interactive, use instead of migrate dev)
- `npx prisma generate` — regen Prisma client after schema changes
- `npx prisma db seed` — seed default club + admin user (admin@teammanager.com / admin123)

## Database

- `.env` has `DATABASE_URL` (Neon pooler endpoint) — **never commit this file**
- `.env.local` has `NEXTAUTH_SECRET` and `NEXTAUTH_URL` — also gitignored
- `ANTHROPIC_API_KEY` — required for in-app AI chat (`/admin/ask`, `/manager/ask`). Set in Vercel env vars or `.env.local`. Without it chat returns 503. Optional override: `CHAT_MODEL` (defaults to `claude-haiku-4-5-20251001`)
- Use `npx prisma db push --accept-data-loss` for schema changes (migrate dev fails in non-interactive terminals)
- Neon DB in `aws-ap-southeast-2` (Sydney), Vercel functions in `syd1` — co-located for low latency

## Architecture

### Roles
- **SUPER_ADMIN** — manage all clubs, not assigned to club (clubId null). Create clubs + provision club admins.
- **ADMIN** — club-scoped, manage club's players, seasons, teams, voting, roster.
- **FAMILY** — club-scoped, view duties, manage availability (not yet built).

### Multi-Tenancy
Session-based club scoping. Every user belongs to Club (except SUPER_ADMIN). JWT includes `clubId`. All API routes filter by `session.user.clubId` — no URL changes needed. Users see only their club's data.

### Data Model Hierarchy
Club → Season(s) → Team(s) → Round(s). Players club-level, linked to teams via TeamPlayer (many-to-many). DutyRoles club-level, configured per-team via TeamDutyRole. Voting scheme per-team.

### Key Models (21 total)
Club, User, Player, Season, Team, TeamPlayer, Round, VotingSession, Vote, DutyRole, TeamDutyRole, TeamDutyRoleSpecialist, RosterAssignment, FamilyExclusion, FamilyUnavailability, PlayerUnavailability, PlayerAvailability

- **Club.isAdultClub** (Boolean, default false) — gates adult-team features: player availability polling + PLAYER voter type. Set by SUPER_ADMIN in club management.
- **AvailabilityStatus enum** — AVAILABLE | MAYBE | UNAVAILABLE (used by PlayerAvailability)
- **VoterType enum** — PARENT | COACH | PLAYER (PLAYER shown on vote page only when club.isAdultClub)
- **JWT/session** includes `isAdultClub` alongside `clubId` and `role` for client-side feature gating

### Duty Role Types (DutyRoleType enum)
- **FIXED** — same person every round (e.g. coach, team manager)
- **SPECIALIST** — rotates among listed eligible people only (e.g. field umpire)
- **ROTATING** — rotates among all families (e.g. canteen, oranges)
- **FREQUENCY** — like rotating but fills every N weeks (e.g. photographer every 3 weeks)

### Route Structure
```
/login                          — credentials login
/admin/dashboard                — admin overview (placeholder)
/admin/clubs                    — club management (SUPER_ADMIN only)
/admin/players                  — player CRUD + team assignment
/admin/season                   — season > team > rounds management (lazy-loaded team details)
/admin/voting                   — open/close voting, QR codes, results + audit trail
/admin/availability             — player availability summary + link sharing (adult clubs only)
/admin/roster                   — club duty roles + per-team role configuration
/admin/playhq                   — (not yet built)
/family/dashboard               — family overview (placeholder)
/family/availability            — (not yet built)
/family/roster                  — (not yet built)
/vote/[token]                   — public voting page (no auth, QR access)
/player-availability/[token]    — public player availability page (no auth, adult clubs only)
```

### API Routes
```
/api/auth/[...nextauth]                  — NextAuth
/api/players, /api/players/[id]          — player CRUD (scoped by clubId)
/api/season, /api/season/[id]            — season CRUD (scoped by clubId)
/api/teams, /api/teams/[id]              — team CRUD
/api/teams/[id]/players                  — team player membership
/api/teams/[id]/duty-roles               — team duty role config (GET returns all club roles merged with team config)
/api/teams/[id]/duty-roles/[roleId]      — single team duty role CRUD
/api/rounds, /api/rounds/[id]            — round CRUD (scoped to team)
/api/clubs                               — club CRUD (SUPER_ADMIN only, POST optionally creates admin user)
/api/teams/[id]/roster                   — GET roster grid data (rounds, roles, assignments, families)
/api/teams/[id]/roster/generate          — POST run algorithm, save assignments
/api/teams/[id]/roster/assign            — PUT manual override of single cell
/api/teams/[id]/unavailability           — GET/POST/DELETE family unavailability per round
/api/duty-roles                          — club-level duty role CRUD (scoped by clubId)
/api/users                               — user list (scoped by clubId, admin only)
/api/voting                              — open/close/toggle voting sessions
/api/voting/[token]                      — public: get voting session info
/api/voting/[token]/submit               — public: submit vote
/api/voting/results                      — admin: vote tallies/leaderboard + audit
/api/player-availability/[token]         — public: get team players, rounds, existing availabilities
/api/player-availability/[token]/respond — public: upsert player availability status
/api/player-availability/token           — admin: lazy-generate playerAvailabilityToken for a team
/api/admin/availability                  — admin: availability summary per round for a team
/api/manager/roster                      — GET all roster page data in one call (TEAM_MANAGER only)
/api/manager/next-round-duties           — GET next upcoming round + grouped duty assignments (TEAM_MANAGER only)
/api/manager/team                        — GET team info for dashboard (TEAM_MANAGER only)
```

### Key Lib Files
- `src/lib/prisma.ts` — Prisma singleton using `@prisma/adapter-neon` (HTTP driver, no TCP cold starts)
- `src/lib/auth.ts` — NextAuth config (JWT includes id, role, clubId)
- `src/lib/roster-algorithm.ts` — fair duty allocation algorithm (supports all 4 role types)
- `src/lib/playhq.ts` — PlayHQ API stub (read-only — no write endpoints exist)

## What's Built
- Multi-tenancy: Club model, session-based scoping, all routes filtered by clubId
- Auth: login, JWT sessions with clubId, role middleware (SUPER_ADMIN/ADMIN/FAMILY)
- Club management: SUPER_ADMIN create/edit/delete clubs, provision club admin users
- Players: CRUD, search, multi-team assignment
- Seasons: CRUD with team hierarchy, lazy-loaded team details for performance
- Teams: CRUD with voting scheme config per team
- Rounds: CRUD scoped to teams, bye support
- Voting: admin open/close, QR generation, public vote page, results/leaderboard, vote audit trail
- Duty Roster: club-level role definitions, per-team configuration, roster generation, grid view, manual overrides, family unavailability
- Share Round Duties: manager roster page + dashboard have ShareDutiesPanel — copy formatted duty message or open WhatsApp one tap; auto-selects next upcoming round
- UI components: Button, Input, Label, Card, Badge, Table, Select, Textarea, Dialog, Sonner

## What's NOT Built Yet
- Duty roster: family exclusions UI (model exists, no UI yet)
- Family portal (availability management, view duties)
- Admin dashboard with live counts
- PlayHQ integration (read-only pull of fixtures/players)
- User management (admin creating family accounts, club onboarding)
- Vote duplicate prevention (see below)

## Vote Duplicate Prevention (TODO — decide after rostering)
Current system uses free-text voter name with deterministic ID (`anon_{sessionId}_{name}`). Options:

1. **Single-use QR per voter** — most secure, adds admin overhead
2. **Device cookie** — simple but bypassable
3. **PIN-based** — voters select name + enter PIN
4. **Pre-registered voter list + cookie** (recommended) — fits existing `parentVoterCount`/`coachVoterCount` fields

Decision depends on how family accounts work — tackle after rostering built.

## Dev Workflow
- **Never push directly to `main`.** Use feature branches + pull requests.
- Create feature branch: `git checkout -b feat/my-feature`
- Run tests before commit: `npm test`
- Push branch + create PR: `git push -u origin feat/my-feature && gh pr create`
- Merge via PR only — Vercel deploys preview per branch with own Neon DB branch

## Conventions
- UI components in `src/components/ui/` — Tailwind v3 compatible, no radix dependencies
- All API routes check auth via `getServerSession(authOptions)`, extract `clubId` from session
- Admin routes require `role === "ADMIN"` or `"SUPER_ADMIN"`, family routes require auth only
- Clubs nav link visible to SUPER_ADMIN only in admin layout
- All portal layouts (admin/manager/family) have mobile-responsive sidebar: hamburger on `<md`, slide-in with overlay, `inert`+`aria-hidden` when closed, auto-close on resize to desktop
- Club scoping: `(session.user as Record<string, unknown>)?.clubId as string`
- Anonymous voters get deterministic user IDs: `anon_{sessionId}_{name}`, assigned to club via voting session chain
- Dates stored as DateTime in Prisma, formatted with `en-AU` locale in UI
- Update CLAUDE.md on major architectural changes

## Skill routing

On user request matching available skill, ALWAYS invoke via Skill tool as FIRST action. Do NOT answer directly, do NOT use other tools first. Skill has specialized workflows producing better results than ad-hoc answers.

Key routing rules:
- Product ideas, "is this worth building", brainstorming → invoke office-hours
- Bugs, errors, "why is this broken", 500 errors → invoke investigate
- Ship, deploy, push, create PR → invoke ship
- QA, test site, find bugs → invoke qa
- Code review, check my diff → invoke review
- Update docs after shipping → invoke document-release
- Weekly retro → invoke retro
- Design system, brand → invoke design-consultation
- Visual audit, design polish → invoke design-review
- Architecture review → invoke plan-eng-review
