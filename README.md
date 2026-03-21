# Team Manager

Multi-tenant sport team management app for clubs — player management, best & fairest voting (QR codes), duty rostering, and team awards.

## Tech Stack

- **Next.js 14** (App Router, TypeScript)
- **Prisma 6** + **PostgreSQL** (Neon serverless, Sydney region)
- **NextAuth.js 4** (credentials, JWT sessions)
- **Tailwind CSS 3**
- **Vercel** (syd1 region)

## Getting Started

```bash
# Install dependencies
npm install

# Set up environment variables
cp .env.example .env        # DATABASE_URL (Neon pooler endpoint)
cp .env.local.example .env.local  # NEXTAUTH_SECRET, NEXTAUTH_URL

# Push schema to database
npx prisma db push

# Seed default admin user
npx prisma db seed

# Start dev server
npm run dev
```

Default login: `admin@teammanager.com` / `admin123`

## Scripts

| Command | Description |
|---|---|
| `npm run dev` | Start dev server (port 3000) |
| `npm run build` | Production build (runs prisma generate first) |
| `npm test` | Run API tests via Vitest (~1s) |
| `npm run test:e2e` | Run browser tests via Playwright (~50s) |
| `npx prisma db push` | Push schema changes to database |
| `npx prisma generate` | Regenerate Prisma client |

## Development Workflow

### Branching Strategy

**Never push directly to `main`.** Use feature branches and pull requests.

```
main (protected) ← PR ← feat/your-feature
```

### Step-by-step

1. **Create a feature branch**
   ```bash
   git checkout -b feat/my-feature
   ```

2. **Neon creates a DB branch automatically** via the Neon-Vercel integration.
   Each Vercel preview deployment gets its own isolated database branch.
   You can safely run `npx prisma db push` without affecting production.

3. **Develop and test**
   ```bash
   # Make changes...
   npm test              # Fast API tests (~1s) — run before every commit
   npx prisma db push    # If schema changed — pushes to your Neon branch only
   ```

4. **Push and create PR**
   ```bash
   git push -u origin feat/my-feature
   gh pr create
   ```
   Vercel deploys a preview at `teammanager-<branch>.vercel.app` with its own DB.

5. **Review and merge**
   - Review schema changes in `prisma/schema.prisma` diff
   - Check the Vercel preview deployment
   - Merge PR → Vercel deploys to production
   - After merge, run `npx prisma db push` against production if schema changed

### Schema Changes

Schema changes are the highest-risk area. Follow these rules:

- **Always run `npm test` before committing** — catches auth regressions instantly
- **Review `prisma/schema.prisma` in every PR** — it's the source of truth
- **Communicate before changing schema** — let the other dev know
- **Never run `prisma db push` against production** from a feature branch
- **After merging schema changes**, verify the Vercel production build succeeds

### Neon-Vercel Integration Setup

1. Go to [Neon Console](https://console.neon.tech) → your project → Integrations
2. Install the **Vercel** integration
3. Link your Vercel project — Neon will automatically:
   - Create a DB branch for each Vercel preview deployment
   - Set `DATABASE_URL` as a preview environment variable
   - Clean up branches when preview deployments are deleted

## Roles

| Role | Access | Scope |
|---|---|---|
| SUPER_ADMIN | All clubs, club management | Global |
| ADMIN | Players, seasons, teams, voting, roster | Club-scoped |
| TEAM_MANAGER | Fixture, voting, roster, awards for their team | Team-scoped |
| FAMILY | View duties, manage availability (planned) | Club-scoped |

## Project Structure

```
src/
  app/
    admin/       — Admin portal (ADMIN, SUPER_ADMIN)
    manager/     — Team manager portal (TEAM_MANAGER)
    family/      — Family portal (planned)
    api/         — API routes
    login/       — Auth
    vote/[token] — Public voting page (QR access)
  components/ui/ — Shared UI components
  lib/           — Auth, Prisma, roster algorithm, helpers
tests/
  api/           — Vitest API role tests (fast)
  auth.spec.ts   — Playwright E2E auth tests
prisma/
  schema.prisma  — Database schema (source of truth)
  seed.ts        — Seed script
```
