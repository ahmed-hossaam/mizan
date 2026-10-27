import { spawnSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { requireIsolatedTestDatabaseUrl } from "./test-database-url.mjs";

const apiDirectory = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const dbDirectory = resolve(apiDirectory, "../../lib/db");
const testDatabaseUrl = requireIsolatedTestDatabaseUrl(
  process.env.TEST_DATABASE_URL,
  [process.env.DATABASE_URL, process.env.PRODUCTION_DATABASE_URL],
);

function runPnpm(args, cwd, env) {
  const result = spawnSync("pnpm", args, {
    cwd,
    env: { ...process.env, ...env },
    stdio: "inherit",
  });

  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

runPnpm(
  ["run", "push"],
  dbDirectory,
  { DATABASE_URL: testDatabaseUrl, NODE_ENV: "test" },
);
runPnpm(["run", "test:routes"], apiDirectory, {
  TEST_DATABASE_URL: testDatabaseUrl,
  NODE_ENV: "test",
});
