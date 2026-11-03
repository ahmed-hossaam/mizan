# Mizan Expense Tracker

A private expense tracker for income, spending, monthly budgets, category analysis, and CSV export in Egyptian pounds (EGP). The React app uses the Express API and PostgreSQL database; Supabase Auth sessions scope records to the authenticated account.

## Local setup (Windows or macOS/Linux)

Use Node.js 22.12 or newer and pnpm 11.9. Install dependencies from the lockfile:

```sh
pnpm install --frozen-lockfile
```

Copy `.env.example` to `.env` once, then set the local PostgreSQL connection and Supabase project URL and Publishable key. Keep `.env` private. Start both services from the repository root:

```sh
pnpm dev
```

Open <http://localhost:5173/>. The Vite server proxies `/api` to the backend port. `PORT` (or `API_PORT`) selects the API port and defaults to `4173`; `VITE_PORT` selects the frontend port and defaults to `5173`. `BASE_PATH` defaults to `/`.

### Environment variables

Required for local app use:

- `DATABASE_URL` — PostgreSQL URL for the local application database.
- `SUPABASE_URL` and `SUPABASE_PUBLISHABLE_KEY` — the project URL and public key used by the Express API to verify access tokens.
- `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` — the same project URL and publishable key used by the browser client. The publishable key is public and can be shared with the client; do not use a secret or service-role key.

Optional:

- `PORT` / `API_PORT`, `VITE_PORT`, and `BASE_PATH` — local ports and app base path. They default to API `4173`, frontend `5173`, and `/`. `BASE_PATH` is a Vite build setting, not a required Vercel variable; leave it unset for the root domain.
- `APP_ORIGIN` — CORS origin when the API is accessed from a separate browser origin. Leave empty for the local Vite proxy and same-origin Vercel deployment.
- `LOG_LEVEL` — optional server log level; defaults to `info`. `NODE_ENV` is supplied by the runtime and should not be configured manually in Vercel.
- `TEST_DATABASE_URL` — dedicated loopback PostgreSQL database for route tests. Its database name must include `test`; test code rejects the application and production database URLs.

## Database schema

The schema is defined in `lib/db/src/schema`. For a new or existing **local development database**, review Drizzle's proposed changes before accepting them:

```sh
pnpm --filter @workspace/db run push
```

Do not use `push-force` for routine setup. Never point this command at production without reviewing the diff and taking the appropriate database backup. The application does not reset or seed real user data.

## Checks

```sh
pnpm run typecheck
pnpm --filter @workspace/api-server run build
pnpm --filter @workspace/expense-tracker run build
```

Route tests require a separate local PostgreSQL test database and `TEST_DATABASE_URL`:

```sh
cd artifacts/api-server
node --env-file=../../.env --import tsx --test tests/finance-routes.test.ts
```

The tests insert and clean up records only in the validated test database and exercise ownership isolation using synthetic identities; they do not replace live Supabase Auth sign-in testing.

## Vercel deployment

The Vercel project serves the Vite build as static assets and routes `/api/*` to the Express function at `api/index.ts`. Configure these variables in Vercel Production:

- `DATABASE_URL`
- `SUPABASE_URL`
- `SUPABASE_PUBLISHABLE_KEY`
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_PUBLISHABLE_KEY`

`DATABASE_URL` is required at API runtime. Use the intended Neon/PostgreSQL URL, not localhost. For Neon, use its TLS-enabled connection string (`sslmode=require`); the pooled hostname is appropriate for serverless request traffic. The actual URL must be checked in Vercel because its secret value is not available for inspection here.

Set each pair to the same Supabase Project URL and Publishable key. Supabase Auth owns user credentials and sessions; Neon and Drizzle continue to store Mizan's finance records. No Supabase service-role or secret key is required by this app. The Vite values are public and embedded in the frontend build, so changes require a new deployment.

`APP_ORIGIN` is not needed for the current same-origin frontend/API deployment; set it only when allowing a separate browser origin. `BASE_PATH`, `PORT`, `API_PORT`, and `VITE_PORT` are local development settings and should normally be absent from Vercel. `TEST_DATABASE_URL` is only for isolated route tests and must never point at production. `LOG_LEVEL` is optional; `NODE_ENV` is supplied by the runtime.

For Preview deployments, use a safe non-production Neon database if authenticated data access is needed. Do not reuse production data for Preview.

For Supabase Auth, set the Site URL to the application URL in Supabase Auth URL Configuration. Add `http://localhost:5173/**` and the appropriate Vercel preview URL pattern to Redirect URLs; keep production redirects restricted to the exact production URL. No SQL migration is required for the provider switch: existing `user_id` columns remain text and existing rows are untouched. New Supabase accounts use Supabase user IDs; linking any existing Clerk-owned rows to those accounts requires a deliberate identity mapping and is not done automatically.

The Vercel integration currently denies access to this team's environment-variable metadata and runtime logs (403). The current deployment configuration runs workspace typechecks, builds the Express API and Vite app, outputs `artifacts/expense-tracker/dist/public`, and rewrites `/api/*` to `api/index.ts`.

Schema changes should be reviewed and applied to the intended database before deploying code that depends on them. No automatic schema push runs during a Vercel build.
