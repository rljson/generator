// @license
// Copyright (c) 2025 Rljson
//
// Use of this source code is governed by terms that can be
// found in the LICENSE file in the root of this package.

// Empties every table in the Server's schema (TRUNCATE), keeping the schema
// itself intact — a "clean slate" without re-running setup-server-tables
// afterward. Neither @rljson/io nor @rljson/db expose a delete/clear
// operation (RLJSON is an append-only, content-addressed store by design),
// so this goes around that API directly via the mssql driver.
//
// Uses the SAME MSSQL_* env vars as the Server repo's .env — point this at
// that exact database/schema.
// Run via: npm run clear-server-tables

import sql from 'mssql';

import { mssqlConfigFromEnv } from './mssql-config.ts';

// IoMssql manages these itself (table-cfg bookkeeping, revision tracking) —
// they are infrastructure, not generated content. Truncating them breaks
// IoMssql's ability to resolve a table's content type (GetContentType
// looks up tableCfgs_tbl), even though the actual data tables still exist.
const SYSTEM_TABLES = new Set(['tableCfgs_tbl', 'revisions_tbl']);

const run = async (): Promise<void> => {
  const schema = process.env.MSSQL_SCHEMA ?? 'PantrySchema';
  const pool = await sql.connect(mssqlConfigFromEnv());

  const { recordset } = await pool
    .request()
    .input('schema', sql.NVarChar, schema)
    .query(
      `SELECT t.name AS tableName FROM sys.tables t
       JOIN sys.schemas s ON t.schema_id = s.schema_id
       WHERE s.name = @schema`,
    );

  for (const { tableName } of recordset as { tableName: string }[]) {
    if (SYSTEM_TABLES.has(tableName)) continue;
    await pool.request().query(`TRUNCATE TABLE [${schema}].[${tableName}]`);
  }

  await pool.close();
};

try {
  process.loadEnvFile();
} catch {
  // No .env file present — fall back to already-exported environment variables.
}

run()
  .then(() => console.log('All table contents cleared.'))
  .catch((err) => {
    console.error(err instanceof Error ? err.message : String(err));
    process.exitCode = 1;
  });
