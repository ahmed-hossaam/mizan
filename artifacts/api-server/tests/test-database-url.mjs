export function requireIsolatedTestDatabaseUrl(value, protectedUrls = []) {
  if (!value) {
    throw new Error(
      "TEST_DATABASE_URL is required. Tests never fall back to DATABASE_URL.",
    );
  }

  let testUrl;
  try {
    testUrl = new URL(value);
  } catch {
    throw new Error("TEST_DATABASE_URL must be a valid PostgreSQL URL.");
  }

  if (!["postgres:", "postgresql:"].includes(testUrl.protocol)) {
    throw new Error("TEST_DATABASE_URL must use the PostgreSQL protocol.");
  }

  const host = testUrl.hostname.replace(/^\[|\]$/g, "").toLowerCase();
  if (!["localhost", "127.0.0.1", "::1"].includes(host)) {
    throw new Error(
      "TEST_DATABASE_URL must point to a loopback PostgreSQL server.",
    );
  }

  const databaseName = decodeURIComponent(testUrl.pathname.slice(1));
  if (!/(^|[_-])test($|[_-])/i.test(databaseName)) {
    throw new Error(
      "The TEST_DATABASE_URL database name must include a separate test segment.",
    );
  }

  const identity = (url) => {
    const parsed = new URL(url);
    return [
      parsed.protocol.toLowerCase(),
      parsed.hostname.toLowerCase(),
      parsed.port,
      decodeURIComponent(parsed.pathname),
    ].join("|");
  };

  for (const protectedUrl of protectedUrls.filter(Boolean)) {
    try {
      if (identity(value) === identity(protectedUrl)) {
        throw new Error(
          "TEST_DATABASE_URL must not point to the configured application database.",
        );
      }
    } catch (error) {
      if (
        error instanceof Error &&
        error.message.startsWith("TEST_DATABASE_URL")
      ) {
        throw error;
      }
      throw new Error("A configured database URL is invalid.");
    }
  }

  return value;
}
