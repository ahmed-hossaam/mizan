process.env.NODE_ENV ??= "test";
process.env.PORT ??= "4000";
process.env.JWT_SECRET ??= "test-jwt-secret-value";
process.env.CLIENT_ORIGIN ??= "http://localhost:5173";
process.env.COOKIE_NAME ??= "et_session";
process.env.COOKIE_SAMESITE ??= "lax";
process.env.DATABASE_URL ??= "postgresql://postgres:postgres@localhost:5432/expense_tracker";
