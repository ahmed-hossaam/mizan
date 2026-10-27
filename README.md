# Mizan Expense Tracker

A private expense tracker for income, spending, monthly budgets, category analysis, and CSV export in Egyptian pounds (EGP). The web app uses the existing workspace API server and PostgreSQL database; each record is scoped to the authenticated Clerk account.

## Workspace setup

Install the monorepo dependencies:

```sh
pnpm install
```

Configure the environment variables listed in `.env.example` through Replit Secrets or another secret manager. Do not commit real credentials. Sign-up, sign-in, and session management are handled by Clerk; this app does not store user passwords.

Apply the Drizzle schema to the configured development database:

```sh
pnpm --filter @workspace/db run push
```

Run the configured Replit workflows, or use separate terminals to start the services:

```sh
# Terminal 1
cd artifacts/api-server
pnpm run dev
```

```sh
# Terminal 2
cd artifacts/expense-tracker
pnpm run dev
```

The API server requires `DATABASE_URL`, `CLERK_SECRET_KEY`, and `CLERK_PUBLISHABLE_KEY`. The frontend uses `VITE_CLERK_PUBLISHABLE_KEY` and, when configured, `VITE_CLERK_PROXY_URL`. `APP_ORIGIN` controls the API's allowed browser origin.

## Tests and builds

The API route tests use two synthetic identities and clean up their fixtures after each test. They require a dedicated PostgreSQL database on loopback whose database name includes a `test` segment. `TEST_DATABASE_URL` is mandatory; the runner refuses the application database URL and never falls back to it. The test command applies the schema only to this isolated database.

```sh
# Start a temporary local PostgreSQL test instance (the commands assume the
# PostgreSQL tools available in the Replit environment).
initdb -D /tmp/expense-tracker-test-pg -U runner -A trust
pg_ctl -D /tmp/expense-tracker-test-pg -o "-h 127.0.0.1 -p 55439 -k /tmp/expense-tracker-test-pg" -w start
createdb -h 127.0.0.1 -p 55439 -U runner expense_tracker_test

# In another terminal:
cd artifacts/api-server
TEST_DATABASE_URL=postgresql://runner@127.0.0.1:55439/expense_tracker_test pnpm run test
```

Stop the temporary PostgreSQL instance when finished with `pg_ctl -D /tmp/expense-tracker-test-pg -m fast -w stop`.

Run the API and frontend typechecks and production builds from their package directories:

```sh
cd artifacts/api-server
pnpm run typecheck
pnpm run test
pnpm run build
```

```sh
cd artifacts/expense-tracker
pnpm run typecheck
PORT=4173 BASE_PATH=/ pnpm run build
```

## Deployment notes

The API uses the workspace's Drizzle schema (`pnpm --filter @workspace/db run push`), not Prisma migrations. Apply schema changes against the intended database environment only. The route test harness uses synthetic identities to test ownership rules without live Clerk accounts; it does not replace production authentication. Configure a production database and production Clerk keys in the deployment environment; development Clerk keys are for preview use and must not be used for production authentication.
