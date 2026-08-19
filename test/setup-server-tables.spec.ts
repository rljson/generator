// @license
// Copyright (c) 2025 Rljson
//
// Use of this source code is governed by terms that can be
// found in the LICENSE file in the root of this package.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const createSchema = vi.fn().mockResolvedValue(undefined);
const installProcedures = vi.fn().mockResolvedValue(undefined);
const ioInit = vi.fn().mockResolvedValue(undefined);
const createOrExtendTable = vi.fn().mockResolvedValue(undefined);
const ioClose = vi.fn().mockResolvedValue(undefined);
const IoMssqlCtor = vi.fn();

vi.mock('@rljson/io-mssql', () => ({
  DbBasics: class {
    createSchema = createSchema;
    installProcedures = installProcedures;
  },
  IoMssql: class {
    constructor(...args: unknown[]) {
      IoMssqlCtor(...args);
    }
    init = ioInit;
    createOrExtendTable = createOrExtendTable;
    close = ioClose;
  },
}));

const flushMicrotasks = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('setup-server-tables.ts', () => {
  let loadEnvFileSpy: ReturnType<typeof vi.spyOn>;
  let logSpy: ReturnType<typeof vi.spyOn>;
  let errorSpy: ReturnType<typeof vi.spyOn>;
  const originalDb = process.env.MSSQL_DATABASE;
  const originalSchema = process.env.MSSQL_SCHEMA;

  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    createSchema.mockResolvedValue(undefined);
    installProcedures.mockResolvedValue(undefined);
    ioInit.mockResolvedValue(undefined);
    createOrExtendTable.mockResolvedValue(undefined);
    ioClose.mockResolvedValue(undefined);
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
    if (originalDb === undefined) delete process.env.MSSQL_DATABASE;
    else process.env.MSSQL_DATABASE = originalDb;
    if (originalSchema === undefined) delete process.env.MSSQL_SCHEMA;
    else process.env.MSSQL_SCHEMA = originalSchema;
  });

  it('bootstraps the main schema, installs procedures, and creates every registered table', async () => {
    delete process.env.MSSQL_DATABASE;
    process.env.MSSQL_SCHEMA = 'PantrySchema';

    await import('../src/setup-server-tables.ts');
    await flushMicrotasks();

    expect(createSchema).toHaveBeenCalledWith(expect.any(Object), 'rljson', 'main');
    expect(installProcedures).toHaveBeenCalledWith(expect.any(Object), 'rljson');
    expect(IoMssqlCtor).toHaveBeenCalledWith(expect.any(Object), 'PantrySchema');
    expect(ioInit).toHaveBeenCalledTimes(1);
    // At least the real customers generator's tables get provisioned.
    expect(createOrExtendTable.mock.calls.length).toBeGreaterThan(0);
    expect(ioClose).toHaveBeenCalledTimes(1);
    expect(logSpy).toHaveBeenCalledWith('Tables created/verified in the Server database.');
    expect(errorSpy).not.toHaveBeenCalled();
  });

  it('uses MSSQL_DATABASE from the environment when set', async () => {
    process.env.MSSQL_DATABASE = 'rljson_dev';

    await import('../src/setup-server-tables.ts');
    await flushMicrotasks();

    expect(createSchema).toHaveBeenCalledWith(expect.any(Object), 'rljson_dev', 'main');
  });

  it('falls back gracefully when loadEnvFile throws (no .env present)', async () => {
    loadEnvFileSpy.mockImplementation(() => {
      throw new Error('no .env');
    });

    await import('../src/setup-server-tables.ts');
    await flushMicrotasks();

    expect(errorSpy).not.toHaveBeenCalled();
  });

  it('logs the error and sets exitCode=1 when a step fails', async () => {
    createSchema.mockRejectedValue(new Error('connection refused'));

    await import('../src/setup-server-tables.ts');
    await flushMicrotasks();

    expect(errorSpy).toHaveBeenCalledWith('connection refused');
    expect(process.exitCode).toBe(1);
  });

  it('logs String(err) when a step fails with a non-Error', async () => {
    createSchema.mockRejectedValue('plain string failure');

    await import('../src/setup-server-tables.ts');
    await flushMicrotasks();

    expect(errorSpy).toHaveBeenCalledWith('plain string failure');
    expect(process.exitCode).toBe(1);
  });
});
