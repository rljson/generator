// @license
// Copyright (c) 2025 Rljson
//
// Use of this source code is governed by terms that can be
// found in the LICENSE file in the root of this package.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const query = vi.fn();
const input = vi.fn().mockReturnThis();
const requestObj = { input, query };
const request = vi.fn(() => requestObj);
const poolClose = vi.fn().mockResolvedValue(undefined);
const pool = { request, close: poolClose };
const connect = vi.fn().mockResolvedValue(pool);

vi.mock('mssql', () => ({
  default: {
    connect: (...args: unknown[]) => connect(...args),
    NVarChar: 'NVarChar',
  },
}));

const flushMicrotasks = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('clear-server-tables.ts', () => {
  let loadEnvFileSpy: ReturnType<typeof vi.spyOn>;
  let logSpy: ReturnType<typeof vi.spyOn>;
  let errorSpy: ReturnType<typeof vi.spyOn>;
  const originalSchema = process.env.MSSQL_SCHEMA;

  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    connect.mockResolvedValue(pool);
    poolClose.mockResolvedValue(undefined);
    query.mockReset();
    query.mockResolvedValueOnce({
      recordset: [
        { tableName: 'tableCfgs_tbl' },
        { tableName: 'revisions_tbl' },
        { tableName: 'customerCake_tbl' },
      ],
    });
    query.mockResolvedValue(undefined);
    loadEnvFileSpy = vi.spyOn(process, 'loadEnvFile').mockImplementation(() => undefined);
    logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    process.exitCode = undefined;
  });

  afterEach(() => {
    loadEnvFileSpy.mockRestore();
    logSpy.mockRestore();
    errorSpy.mockRestore();
    process.exitCode = undefined;
    if (originalSchema === undefined) delete process.env.MSSQL_SCHEMA;
    else process.env.MSSQL_SCHEMA = originalSchema;
  });

  it('truncates every table except the protected system tables', async () => {
    process.env.MSSQL_SCHEMA = 'PantrySchema';

    await import('../src/clear-server-tables.ts');
    await flushMicrotasks();

    // 1 SELECT + 1 TRUNCATE (only customerCake_tbl; the two system tables
    // are skipped via the `continue` branch).
    expect(query).toHaveBeenCalledTimes(2);
    expect(query).toHaveBeenLastCalledWith('TRUNCATE TABLE [PantrySchema].[customerCake_tbl]');
    expect(poolClose).toHaveBeenCalledTimes(1);
    expect(logSpy).toHaveBeenCalledWith('All table contents cleared.');
    expect(errorSpy).not.toHaveBeenCalled();
  });

  it('defaults the schema to PantrySchema when MSSQL_SCHEMA is unset', async () => {
    delete process.env.MSSQL_SCHEMA;

    await import('../src/clear-server-tables.ts');
    await flushMicrotasks();

    expect(query).toHaveBeenLastCalledWith('TRUNCATE TABLE [PantrySchema].[customerCake_tbl]');
  });

  it('falls back gracefully when loadEnvFile throws (no .env present)', async () => {
    loadEnvFileSpy.mockImplementation(() => {
      throw new Error('no .env');
    });

    await import('../src/clear-server-tables.ts');
    await flushMicrotasks();

    expect(errorSpy).not.toHaveBeenCalled();
  });

  it('logs the error and sets exitCode=1 when connect() fails', async () => {
    connect.mockRejectedValue(new Error('connection refused'));

    await import('../src/clear-server-tables.ts');
    await flushMicrotasks();

    expect(errorSpy).toHaveBeenCalledWith('connection refused');
    expect(process.exitCode).toBe(1);
  });

  it('logs String(err) when a step fails with a non-Error', async () => {
    connect.mockRejectedValue('plain string failure');

    await import('../src/clear-server-tables.ts');
    await flushMicrotasks();

    expect(errorSpy).toHaveBeenCalledWith('plain string failure');
    expect(process.exitCode).toBe(1);
  });
});
