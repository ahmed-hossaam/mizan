---
name: Temporary local PostgreSQL tests
description: Starting disposable PostgreSQL clusters in this Replit runtime.
---

When starting a scratch PostgreSQL cluster, pass `-k <writable-temp-directory>` to the server options. Otherwise, `pg_ctl` may try to create its Unix socket under `/run/postgresql`, which is absent in this runtime.

**Why:** `initdb` succeeds, but the PostgreSQL server fails to start when its default socket directory does not exist.

**How to apply:** Keep the cluster data and socket under a temporary directory, bind only to loopback, and stop/remove the cluster after the test run.
