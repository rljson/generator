// @license
// Copyright (c) 2025 Rljson
//
// Use of this source code is governed by terms that can be
// found in the LICENSE file in the root of this package.

// One-time provisioning script — creates every registered generator's
// tables directly in the Server's MSSQL database. Run this ONCE per
// environment before the Server ever accepts data; the regular
// Generator/Server sync flow never creates tables against MSSQL itself.
// Rerunning is harmless (createOrExtendTable is idempotent) but never
// necessary after the schema is stable, since the source DecomposeCharts
// don't change per run. Adding a new generator to generators/index.ts picks
// up its tables here automatically — nothing to update in this file.
//
// Uses the SAME MSSQL_* env vars as the Server repo's .env — point this at
// that exact database/schema.
// Run via: pnpm setup-server-tables

import { DbBasics, IoMssql } from '@rljson/io-mssql';

import { mssqlConfigFromEnv } from './mssql-config.ts';
import { allTableCfgs } from './table-cfgs.ts';

const run = async (): Promise<void> => {
  // IoMssql's admin stored procedures (e.g. GetContentType) always live in
  // a fixed "main" schema, shared across every data schema in the database
  // — IoMssql calls them passing its own data schema as a plain SQL
  // parameter, so one shared install covers every IoMssql instance
  // regardless of which schema it was constructed with. Since our
  // login/database creation happened outside this library (no call to
  // DbBasics.initDb()), that "main" schema was never created and the
  // procedures were never installed — this is that one-time bootstrap step.
  // Idempotent (CREATE OR ALTER), so safe to rerun.
  const dbBasics = new DbBasics();
  const dbName = process.env.MSSQL_DATABASE ?? 'rljson';
  await dbBasics.createSchema(mssqlConfigFromEnv(), dbName, 'main');
  await dbBasics.installProcedures(mssqlConfigFromEnv(), dbName);

  const io = new IoMssql(mssqlConfigFromEnv(), process.env.MSSQL_SCHEMA);
  await io.init();

  for (const cfg of allTableCfgs()) {
    await io.createOrExtendTable({ tableCfg: cfg });
  }

  await io.close();
};

try {
  process.loadEnvFile();
} catch {
  // No .env file present — fall back to already-exported environment variables.
}

run()
  .then(() => console.log('Tables created/verified in the Server database.'))
  .catch((err) => {
    console.error(err instanceof Error ? err.message : String(err));
    process.exitCode = 1;
  });
