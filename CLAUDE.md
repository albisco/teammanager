# CLAUDE.md

## Project

Team Manager — AFL Footy web app for managing multiple teams across age groups. Replaces spreadsheets with player management, best & fairest voting (QR codes), duty rostering, and family self-service.

## Tech Stack

- **Next.js 14** (App Router, TypeScript), **Prisma 6** ORM, **PostgreSQL** (Neon serverless)
- **NextAuth.js 4** (credentials provider, JWT sessions, role-based middleware)
- **Tailwind CSS 3** with hand-rolled shadcn-style UI components
- **QR Codes:** `qrcode` library, **Toasts:** `sonner`

## Commands

- `npm run dev` — start dev server on port 3000
- `npx prisma db push` — push schema to database (non-interactive, use instead of migrate dev)
- `npx prisma generate` — regenerate Prisma client after schema changes
- `npx prisma db seed` — seed admin user (admin@teammanager.com / admin123)
- `npx next build` — production build (use to verify before committing)

## Database

- `.env` has `DATABASE_URL` (Neon pooler endpoint) — **never commit this file**
- `.env.local` has `NEXTAUTH_SECRET` and `NEXTAUTH_URL` — also gitignored
- Use `npx prisma db push --accept-data-loss` for schema changes (migrate dev doesn't work in non-interactive terminals)

## Architecture

### Data Model Hierarchy
Season → Team(s) → Round(s). Players are global, linked to teams via TeamPlayer (many-to-many). Voting scheme is per-team.

### Key Models (14 total)
User, Player, Season, Team, TeamPlayer, Round, VotingSession, Vote, DutyRoleFixed, DutyRoleParent, RosterAssignment, FamilyExclusion, FamilyUnavailability, PlayerUnavailability

### Route Structure
```
/login                          — credentials login
/admin/dashboard                — admin overview (placeholder)
/admin/players                  — player CRUD + team assignment
/admin/season                   — season > team > rounds management
/admin/voting                   — open/close voting, QR codes, results
/admin/roster                   — (not yet built)
/admin/playhq                   — (not yet built)
/family/dashboard               — family overview (placeholder)
/family/availability            — (not yet built)
/family/roster                  — (not yet built)
/vote/[token]                   — public voting page (no auth, QR access)
```

### API Routes
```
/api/auth/[...nextauth]         — NextAuth
/api/players, /api/players/[id] — player CRUD
/api/season, /api/season/[id]   — season CRUD
/api/teams, /api/teams/[id]     — team CRUD
/api/teams/[id]/players         — team player membership
/api/rounds, /api/rounds/[id]   — round CRUD (scoped to team)
/api/voting                     — open/close/toggle voting sessions
/api/voting/[token]             — public: get voting session info
/api/voting/[token]/submit      — public: submit vote
/api/voting/results             — admin: vote tallies/leaderboard
```

### Key Lib Files
- `src/lib/prisma.ts` — Prisma singleton (cached globally, including production)
- `src/lib/auth.ts` — NextAuth config (lazy-loads Prisma in authorize to avoid cold-start blocks)
- `src/lib/roster-algorithm.ts` — fair duty allocation algorithm
- `src/lib/playhq.ts` — PlayHQ API stub

## What's Built
- Auth: login, JWT sessions, role middleware (ADMIN/FAMILY)
- Players: CRUD, search, multi-team assignment
- Seasons: CRUD with team hierarchy
- Teams: CRUD with voting scheme config per team
- Rounds: CRUD scoped to teams, bye support
- Voting: admin open/close, QR generation, public vote page, results/leaderboard
- UI components: Button, Input, Label, Card, Badge, Table, Select, Textarea, Dialog, Sonner

## What's NOT Built Yet
- Duty roster system (generation algorithm exists in lib, needs UI + API wiring)
- Family portal (availability management, view duties)
- Admin dashboard with live counts
- PlayHQ integration (stub exists)
- 2FA (removed for now, may add later)
- User management (admin creating family accounts)

## Conventions
- UI components in `src/components/ui/` — Tailwind v3 compatible, no radix dependencies
- All API routes check auth via `getServerSession(authOptions)`
- Admin routes require `role === "ADMIN"`, family routes just require auth
- Anonymous voters get deterministic user IDs: `anon_{sessionId}_{name}`
- Dates stored as DateTime in Prisma, formatted with `en-AU` locale in UI
