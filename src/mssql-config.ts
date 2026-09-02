// @license
// Copyright (c) 2025 Rljson
//
// Use of this source code is governed by terms that can be
// found in the LICENSE file in the root of this package.

import type { config as MssqlConfig } from 'mssql';

/**
 * Builds the mssql connection config from environment variables. Shared by
 * every script that talks to MSSQL directly (setup-server-tables,
 * clear-server-tables) — all must point at the exact same database/schema
 * as the Server repo's own .env.
 */
export const mssqlConfigFromEnv = (): MssqlConfig => ({
  server: process.env.MSSQL_HOST ?? 'localhost',
  port: process.env.MSSQL_PORT ? Number(process.env.MSSQL_PORT) : undefined,
  database: process.env.MSSQL_DATABASE ?? 'rljson',
  user: process.env.MSSQL_USER,
  password: process.env.MSSQL_PASSWORD,
  options: {
    encrypt: process.env.MSSQL_ENCRYPT !== 'false',
    trustServerCertificate:
      process.env.MSSQL_TRUST_SERVER_CERTIFICATE === 'true',
  },
});
