# CLAUDE.md

## Project

Team Manager — Multi-tenant sport team management web app for managing multiple clubs, each with teams across age groups. Replaces spreadsheets with player management, best & fairest voting (QR codes), duty rostering, and family self-service.

## Tech Stack

- **Next.js 14** (App Router, TypeScript), **Prisma 6** ORM, **PostgreSQL** (Neon serverless, Sydney region)
- **NextAuth.js 4** (credentials provider, JWT sessions with clubId, role-based middleware)
- **Tailwind CSS 3** with hand-rolled shadcn-style UI components
- **Neon adapter:** `@prisma/adapter-neon` for HTTP-based queries (no TCP cold starts)
- **QR Codes:** `qrcode` library, **Toasts:** `sonner`

## Commands

- `npm run dev` — start dev server on port 3000
- `npm run build` — runs `prisma generate && next build` (production build)
- `npx prisma db push` — push schema to database (non-interactive, use instead of migrate dev)
- `npx prisma generate` — regenerate Prisma client after schema changes
- `npx prisma db seed` — seed default club + admin user (admin@teammanager.com / admin123)

## Database

- `.env` has `DATABASE_URL` (Neon pooler endpoint) — **never commit this file**
- `.env.local` has `NEXTAUTH_SECRET` and `NEXTAUTH_URL` — also gitignored
- Use `npx prisma db push --accept-data-loss` for schema changes (migrate dev doesn't work in non-interactive terminals)
- Neon DB in `aws-ap-southeast-2` (Sydney), Vercel functions in `syd1` — co-located for low latency

## Architecture

### Roles
- **SUPER_ADMIN** — manages all clubs, not assigned to any club (clubId is null). Can create clubs + provision club admins.
- **ADMIN** — club-scoped, manages their club's players, seasons, teams, voting, roster.
- **FAMILY** — club-scoped, views duties, manages availability (not yet built).

### Multi-Tenancy
Session-based club scoping. Every user belongs to a Club (except SUPER_ADMIN). JWT includes `clubId`. All API routes filter by `session.user.clubId` — no URL changes needed. Users only see their club's data.

### Data Model Hierarchy
Club → Season(s) → Team(s) → Round(s). Players are club-level, linked to teams via TeamPlayer (many-to-many). DutyRoles are club-level, configured per-team via TeamDutyRole. Voting scheme is per-team.

### Key Models (19 total)
Club, User, Player, Season, Team, TeamPlayer, Round, VotingSession, Vote, DutyRole, TeamDutyRole, TeamDutyRoleSpecialist, RosterAssignment, FamilyExclusion, FamilyUnavailability, PlayerUnavailability

### Duty Role Types (DutyRoleType enum)
- **FIXED** — same person every round (e.g. coach, team manager)
- **SPECIALIST** — rotates among listed eligible people only (e.g. field umpire)
- **ROTATING** — rotates among all families (e.g. canteen, oranges)
- **FREQUENCY** — like rotating but only fills every N weeks (e.g. photographer every 3 weeks)

### Route Structure
```
/login                          — credentials login
/admin/dashboard                — admin overview (placeholder)
/admin/clubs                    — club management (SUPER_ADMIN only)
/admin/players                  — player CRUD + team assignment
/admin/season                   — season > team > rounds management (lazy-loaded team details)
/admin/voting                   — open/close voting, QR codes, results + audit trail
/admin/roster                   — club duty roles + per-team role configuration
/admin/playhq                   — (not yet built)
/family/dashboard               — family overview (placeholder)
/family/availability            — (not yet built)
/family/roster                  — (not yet built)
/vote/[token]                   — public voting page (no auth, QR access)
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
```

### Key Lib Files
- `src/lib/prisma.ts` — Prisma singleton using `@prisma/adapter-neon` (HTTP driver, no TCP cold starts)
- `src/lib/auth.ts` — NextAuth config (JWT includes id, role, clubId)
- `src/lib/roster-algorithm.ts` — fair duty allocation algorithm (supports all 4 role types)
- `src/lib/playhq.ts` — PlayHQ API stub (read-only — no write endpoints exist)

## What's Built
- Multi-tenancy: Club model, session-based scoping, all routes filtered by clubId
- Auth: login, JWT sessions with clubId, role middleware (SUPER_ADMIN/ADMIN/FAMILY)
- Club management: SUPER_ADMIN can create/edit/delete clubs, provision club admin users
- Players: CRUD, search, multi-team assignment
- Seasons: CRUD with team hierarchy, lazy-loaded team details for performance
- Teams: CRUD with voting scheme config per team
- Rounds: CRUD scoped to teams, bye support
- Voting: admin open/close, QR generation, public vote page, results/leaderboard, vote audit trail
- Duty Roster: club-level role definitions, per-team configuration, roster generation, grid view, manual overrides, family unavailability
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

Decision depends on how family accounts work — tackle after rostering is built.

## Dev Workflow
- **Never push directly to `main`.** Always use feature branches and pull requests.
- Create a feature branch: `git checkout -b feat/my-feature`
- Run tests before committing: `npm test`
- Push branch and create PR: `git push -u origin feat/my-feature && gh pr create`
- Merge via PR only — Vercel deploys a preview per branch with its own Neon DB branch

## Conventions
- UI components in `src/components/ui/` — Tailwind v3 compatible, no radix dependencies
- All API routes check auth via `getServerSession(authOptions)`, extract `clubId` from session
- Admin routes require `role === "ADMIN"` or `"SUPER_ADMIN"`, family routes just require auth
- Clubs nav link only visible to SUPER_ADMIN in admin layout
- Club scoping: `(session.user as Record<string, unknown>)?.clubId as string`
- Anonymous voters get deterministic user IDs: `anon_{sessionId}_{name}`, assigned to club via voting session chain
- Dates stored as DateTime in Prisma, formatted with `en-AU` locale in UI
- Always update CLAUDE.md when making major architectural changes

## Skill routing

When the user's request matches an available skill, ALWAYS invoke it using the Skill
tool as your FIRST action. Do NOT answer directly, do NOT use other tools first.
The skill has specialized workflows that produce better results than ad-hoc answers.

Key routing rules:
- Product ideas, "is this worth building", brainstorming → invoke office-hours
- Bugs, errors, "why is this broken", 500 errors → invoke investigate
- Ship, deploy, push, create PR → invoke ship
- QA, test the site, find bugs → invoke qa
- Code review, check my diff → invoke review
- Update docs after shipping → invoke document-release
- Weekly retro → invoke retro
- Design system, brand → invoke design-consultation
- Visual audit, design polish → invoke design-review
- Architecture review → invoke plan-eng-review
