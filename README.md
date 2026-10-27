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

The API route integration tests use unique synthetic account IDs and clean up their database rows after running:

```sh
cd artifacts/api-server
pnpm run test
```

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
