# Zenith Asset Group - Back Office & API

Staff back office (Next.js 15, TypeScript, Tailwind 4) plus the API the public website calls.
Database: PostgreSQL (Supabase or any Postgres) through Drizzle. Payments: Paystack. Files: Cloudflare R2 / any S3.

The public website (https://zenithassetsproperties.netlify.app) is a separate app. It talks to this one through `/api/v1`
(see [docs/API.md](docs/API.md)); both share the same database through this app only.

## What is inside

| Area | Where |
|---|---|
| Staff screens | `/admin/*` (properties, documents, customers, enquiries, leads, inspections, reservations, transactions, payments, agents, analytics, audit log, staff) |
| Staff API | `/api/admin/*` (cookie session, role based) |
| Website + customer API | `/api/v1/*` (CORS, rate limited, customer Bearer token) |
| Paystack webhook | `POST /api/webhooks/paystack` |
| Scheduled jobs | `/api/cron/expire-reservations`, `/api/cron/payment-reminders` |

Roles: `super_admin`, `admin`, `sales_agent` (own leads/customers only), `finance`, `content`. See `src/lib/rbac.ts`.

## Run it locally

### 1. Start the PostgreSQL Database (Docker)
```bash
npm run docker:up
# Or using pnpm:
# pnpm docker:up
```

### 2. Setup Environment & Seed Database
```bash
cp .env.example .env.local        # verify DATABASE_URL and SESSION_SECRET
npm run db:migrate
npm run db:seed                   # seeds the super admin from SEED_ADMIN_EMAIL / SEED_ADMIN_PASSWORD
npm run db:demo                   # (optional) seeds rich mock portfolio & customer activity
```

### 3. Start Development Server
```bash
npm run dev                       # http://localhost:3000
```

Sign in at `/login` with the seeded email and password.

## Deploy

1. Create the Supabase project (database only) and put its connection string in `DATABASE_URL`. Run `pnpm db:migrate` and `pnpm db:seed` once.
2. Set every variable from `.env.example` on the host. Do not leave `SESSION_SECRET` or `CRON_SECRET` empty. Set `CLIENT_IP_HEADER`
   to the header your host sets with the real client IP (Netlify: `x-nf-client-connection-ip`, Vercel: `x-vercel-forwarded-for`).
3. Point Paystack's webhook at `https://<this app>/api/webhooks/paystack`.
4. Schedule both cron endpoints (hourly is fine) with the header `Authorization: Bearer <CRON_SECRET>`.
5. Add the main site's address to `ALLOWED_ORIGINS`.
6. Large file uploads go through the server, so keep photos/documents under the host's request-size limit (4.5 MB on Vercel).
   Videos and 360 tours are stored as links (YouTube, Vimeo, Matterport).

## Scripts

`pnpm dev` · `pnpm build` · `pnpm lint` · `pnpm typecheck` · `pnpm db:generate` (after editing `src/db/schema.ts`) · `pnpm db:migrate` · `pnpm db:seed` · `pnpm test`

Tests are integration tests: they need the app running (`pnpm exec next dev -p 3100`) and the database from `DATABASE_URL`.

## Security notes

- Passwords hashed with bcrypt (cost 12); staff lock out after 5 wrong passwords; every sign-in failure looks identical.
- Session cookies are HttpOnly + SameSite=Lax with a 30 minute idle timeout; state-changing staff requests also check the Origin header.
- Money is stored as whole kobo. Online payment amounts always come from the server's records, the Paystack webhook is signature checked and safe to repeat, and a payment that arrives for a property someone else holds is recorded but flagged for staff review instead of changing the property.
- Uploads are checked by their real file bytes; documents are served only through short-lived signed links, and every staff download is audited.
- Card details never touch this app (Paystack handles them).
