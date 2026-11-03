# Mizan Expense Tracker

A private expense tracker for income, spending, monthly budgets, category analysis, and CSV export in Egyptian pounds (EGP). The React app uses the Express API and PostgreSQL database; Clerk sessions scope records to the authenticated account.

## Local setup (Windows or macOS/Linux)

Use Node.js 22.12 or newer and pnpm 11.9. Install dependencies from the lockfile:

```sh
pnpm install --frozen-lockfile
```

Copy `.env.example` to `.env` once, then set the local PostgreSQL connection and matching Clerk development keys. Keep `.env` private. Start both services from the repository root:

```sh
pnpm dev
```

Open <http://localhost:5173/>. The Vite server proxies `/api` to the backend port. `PORT` (or `API_PORT`) selects the API port and defaults to `4173`; `VITE_PORT` selects the frontend port and defaults to `5173`. `BASE_PATH` defaults to `/`.

### Environment variables

Required for local app use:

- `DATABASE_URL` — PostgreSQL URL for the local application database.
- `CLERK_PUBLISHABLE_KEY` and `CLERK_SECRET_KEY` — matching Clerk development instance keys; the secret is server only.
- `VITE_CLERK_PUBLISHABLE_KEY` — the matching publishable key exposed to the browser.

Optional:

- `PORT` / `API_PORT`, `VITE_PORT`, and `BASE_PATH` — local ports and app base path.
- `APP_ORIGIN` — CORS origin when the API is accessed from a separate browser origin. Leave empty for the local Vite proxy and same-origin Vercel deployment.
- `VITE_CLERK_PROXY_URL` — only if a Clerk proxy has been configured for that domain. It is normally unnecessary for local development.
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

The tests insert and clean up records only in the validated test database and exercise ownership isolation using synthetic identities; they do not replace live Clerk sign-in testing.

## Vercel deployment

The Vercel project serves the Vite build as static assets and routes `/api/*` to the Express function at `api/index.ts`. Configure these variables in the Vercel project's Production and Preview environments:

- `DATABASE_URL`
- `CLERK_PUBLISHABLE_KEY`
- `CLERK_SECRET_KEY`
- `VITE_CLERK_PUBLISHABLE_KEY`

Use production Clerk keys and the intended production database only in Production. The Vite publishable key is public by design; the Clerk secret and database URL must remain encrypted server environment variables. `VITE_CLERK_PROXY_URL` is optional and should only be set after the Clerk domain's proxy configuration is in place.

Schema changes should be reviewed and applied to the intended database before deploying code that depends on them. No automatic schema push runs during a Vercel build.
