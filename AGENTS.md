# AGENTS.md

## Dev Commands

```bash
npm run dev          # Start dev server (port 3000)
npm run build        # prisma generate && next build
npm run lint         # next lint (ESLint + TypeScript)
npm run test         # vitest run (unit/integration tests in tests/)
npm run test:watch   # vitest watch mode
npm run test:e2e     # playwright e2e (auto-starts dev server)
```

**Database:**
```bash
npx prisma db push           # Push schema (non-interactive, preferred over migrate dev)
npx prisma db push --accept-data-loss  # Required for breaking schema changes
npx prisma generate          # Regenerate Prisma client after schema changes
npx prisma db seed           # Seed default club + admin (admin@teammanager.com / admin123)
```

> `migrate dev` does NOT work in non-interactive terminals — use `db push` instead.

## Path Aliases

`@/` maps to `./src/`. Tests are in `tests/` (excluded from tsconfig).

- Unit/integration tests: `tests/**/*.test.ts`
- E2E tests: `tests/**/*.spec.ts`

## Key Gotchas

- **Never commit `.env` or `.env.local`** — contains `DATABASE_URL` and `NEXTAUTH_SECRET`
- **Test file location:** tests are in top-level `tests/` directory, NOT inside `src/`
- **Test mocking:** `tests/api/setup.ts` auto-mocks `getServerSession` and `prisma` for unit tests. Use `setTestSession(sessions.admin)` etc. to set the session context
- **E2E setup:** `global-setup.ts` creates QA users (`qa_superadmin@teammanager.com`, `qa_admin@teammanager.com`, `qa_tm@teammanager.com`) with password `test1234`, plus a QA test club/season/team. E2E tests need these seeded records.
- **Prisma client:** Uses `@prisma/adapter-neon` (HTTP driver). After schema changes, always run `npx prisma generate`.
- **TEAM_MANAGER JWT:** The `teamId` claim is NOT stored in the DB User record — it's looked up via `team.managerId === user.id` on login and injected into the JWT. Do not assume `teamId` exists in the User model.

## Multi-Tenancy

Session-based scoping. Every API route filters by `session.user.clubId`. SUPER_ADMIN has `clubId = null` and bypasses club filtering.

Club scoping pattern:
```ts
const clubId = (session.user as Record<string, unknown>)?.clubId as string;
```

## Role Hierarchy

- **SUPER_ADMIN** — no `clubId`, manages all clubs
- **ADMIN** — club-scoped, full admin access
- **TEAM_MANAGER** — club + team scoped, roster/availability access
- **FAMILY** — club-scoped, views duties, manages availability

## Data Model Summary

19 models. Key relationships:
- Club → Season → Team → Round (parent hierarchy)
- Player is club-level, linked to teams via TeamPlayer (many-to-many)
- DutyRole is club-level, configured per-team via TeamDutyRole
- RosterAssignment joins Round + TeamDutyRole + Family

## Important Files

| File | Purpose |
|------|---------|
| `src/lib/prisma.ts` | Prisma singleton with Neon HTTP adapter |
| `src/lib/auth.ts` | NextAuth config, JWT callbacks |
| `src/lib/roster-algorithm.ts` | Fair duty allocation (all 4 role types) |
| `prisma/schema.prisma` | Full data model (271 lines) |

## Verification Order

Before shipping: `npm run lint && npm run test && npm run build`

## Skill Routing

Invoke these skills for their specialized workflows:
- **Bugs/errors/500s** → `/investigate` (Iron Law: no fix without root cause)
- **Ship/deploy/PR** → `/ship` (branch → commit → PR → land)
- **QA/testing** → `/qa` or `/qa-only`
- **Architecture review** → `/plan-eng-review`
