// @license
// Copyright (c) 2025 Rljson
//
// Use of this source code is governed by terms that can be
// found in the LICENSE file in the root of this package.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const run = vi.fn();
vi.mock('../src/generate.ts', () => ({ run }));

const flushMicrotasks = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('cli.ts', () => {
  let loadEnvFileSpy: ReturnType<typeof vi.spyOn>;
  let errorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.resetModules();
    run.mockReset();
    loadEnvFileSpy = vi.spyOn(process, 'loadEnvFile').mockImplementation(() => undefined);
    errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    process.exitCode = undefined;
  });

  afterEach(() => {
    loadEnvFileSpy.mockRestore();
    errorSpy.mockRestore();
    process.exitCode = undefined;
  });

  it('loads .env and runs without logging or setting exitCode on success', async () => {
    run.mockResolvedValue(undefined);
    await import('../src/cli.ts');
    await flushMicrotasks();

    expect(loadEnvFileSpy).toHaveBeenCalled();
    expect(errorSpy).not.toHaveBeenCalled();
    expect(process.exitCode).toBeUndefined();
  });

  it('falls back gracefully when loadEnvFile throws (no .env present)', async () => {
    loadEnvFileSpy.mockImplementation(() => {
      throw new Error('no .env');
    });
    run.mockResolvedValue(undefined);

    await import('../src/cli.ts');
    await flushMicrotasks();

    expect(errorSpy).not.toHaveBeenCalled();
    expect(process.exitCode).toBeUndefined();
  });

  it('logs the Error message and sets exitCode=1 when run() rejects with an Error', async () => {
    run.mockRejectedValue(new Error('boom'));

    await import('../src/cli.ts');
    await flushMicrotasks();

    expect(errorSpy).toHaveBeenCalledWith('boom');
    expect(process.exitCode).toBe(1);
  });

  it('logs String(err) and sets exitCode=1 when run() rejects with a non-Error', async () => {
    run.mockRejectedValue('boom-string');

    await import('../src/cli.ts');
    await flushMicrotasks();

    expect(errorSpy).toHaveBeenCalledWith('boom-string');
    expect(process.exitCode).toBe(1);
  });
});
