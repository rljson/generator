// @license
// Copyright (c) 2025 Rljson
//
// Use of this source code is governed by terms that can be
// found in the LICENSE file in the root of this package.

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { mssqlConfigFromEnv } from '../src/mssql-config.ts';

const ENV_KEYS = [
  'MSSQL_HOST',
  'MSSQL_PORT',
  'MSSQL_DATABASE',
  'MSSQL_USER',
  'MSSQL_PASSWORD',
  'MSSQL_ENCRYPT',
  'MSSQL_TRUST_SERVER_CERTIFICATE',
] as const;

describe('mssqlConfigFromEnv', () => {
  const original: Record<string, string | undefined> = {};

  beforeEach(() => {
    for (const key of ENV_KEYS) {
      original[key] = process.env[key];
      delete process.env[key];
    }
  });

  afterEach(() => {
    for (const key of ENV_KEYS) {
      if (original[key] === undefined) delete process.env[key];
      else process.env[key] = original[key];
    }
  });

  it('falls back to sensible defaults when nothing is set', () => {
    expect(mssqlConfigFromEnv()).toEqual({
      server: 'localhost',
      port: undefined,
      database: 'rljson',
      user: undefined,
      password: undefined,
      options: { encrypt: true, trustServerCertificate: false },
    });
  });

  it('reads every value from the environment when set', () => {
    process.env.MSSQL_HOST = 'db.example.com';
    process.env.MSSQL_PORT = '1433';
    process.env.MSSQL_DATABASE = 'rljson_dev';
    process.env.MSSQL_USER = 'rljson_dev';
    process.env.MSSQL_PASSWORD = 'secret';
    process.env.MSSQL_ENCRYPT = 'false';
    process.env.MSSQL_TRUST_SERVER_CERTIFICATE = 'true';

    expect(mssqlConfigFromEnv()).toEqual({
      server: 'db.example.com',
      port: 1433,
      database: 'rljson_dev',
      user: 'rljson_dev',
      password: 'secret',
      options: { encrypt: false, trustServerCertificate: true },
    });
  });
});
