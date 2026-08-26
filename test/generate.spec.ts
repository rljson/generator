// @license
// Copyright (c) 2025 Rljson
//
// Use of this source code is governed by terms that can be
// found in the LICENSE file in the root of this package.

import { Route } from '@rljson/rljson';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const init = vi.fn().mockResolvedValue(undefined);
const ready = vi.fn().mockResolvedValue(undefined);
const tearDown = vi.fn().mockResolvedValue(undefined);
const createTable = vi.fn().mockResolvedValue(undefined);
const importFn = vi.fn().mockResolvedValue(undefined);
const sendWithAck = vi.fn().mockResolvedValue(undefined);
const disconnect = vi.fn();
const ClientCtor = vi.fn();

vi.mock('@rljson/server', () => ({
  Client: class {
    db = { core: { createTable, import: importFn } };
    connector = { sendWithAck };
    constructor(...args: unknown[]) {
      ClientCtor(...args);
    }
    init = init;
    ready = ready;
    tearDown = tearDown;
  },
  SocketIoBridge: class {
    constructor(public socket: unknown) {}
  },
}));

const ioClient = vi.fn((..._args: unknown[]) => ({ disconnect }));
vi.mock('socket.io-client', () => ({ io: (...args: unknown[]) => ioClient(...args) }));

const fakeGenerators: Record<string, unknown> = {};
vi.mock('../src/generators/index.ts', () => ({
  get generators() {
    return fakeGenerators;
  },
}));

const { serverUrl, groupByRoute, parseCount, run, withConcurrency } =
  await import('../src/generate.ts');

const fakeEntry = (
  label: string,
  route: Route,
  opts: {
    validationErrors?: string[];
    rootHash?: string | null;
    tableCfgs?: unknown[];
    omitTableCfgsTable?: boolean;
  } = {},
) => ({
  label,
  route,
  generate: vi.fn().mockReturnValue({
    rljson: {
      ...(opts.omitTableCfgsTable ? {} : { tableCfgs: { _data: opts.tableCfgs ?? [{ key: 'x' }] } }),
      [route.top.tableKey]: {
        _data: opts.rootHash === null ? [] : [{ _hash: opts.rootHash ?? 'hash-1' }],
      },
    },
    tableCfgs: [],
    validationErrors: opts.validationErrors ?? [],
    stats: {},
  }),
});

describe('serverUrl', () => {
  const original = process.env.SERVER_URL;
  afterEach(() => {
    if (original === undefined) delete process.env.SERVER_URL;
    else process.env.SERVER_URL = original;
  });

  it('defaults to localhost:3000', () => {
    delete process.env.SERVER_URL;
    expect(serverUrl()).toBe('http://localhost:3000');
  });

  it('reads SERVER_URL from the environment', () => {
    process.env.SERVER_URL = 'https://example.com';
    expect(serverUrl()).toBe('https://example.com');
  });
});

describe('groupByRoute', () => {
  it('groups entries sharing the same route together', () => {
    const routeA = Route.fromFlat('/aCake');
    const routeB = Route.fromFlat('/bCake');
    const a1 = fakeEntry('a1', routeA);
    const a2 = fakeEntry('a2', routeA);
    const b1 = fakeEntry('b1', routeB);

    const groups = groupByRoute([a1, a2, b1] as any);
    expect(groups).toHaveLength(2);
    const groupA = groups.find((g) => g.route.flat === '/aCake')!;
    expect(groupA.entries).toEqual([a1, a2]);
    const groupB = groups.find((g) => g.route.flat === '/bCake')!;
    expect(groupB.entries).toEqual([b1]);
  });

  it('returns an empty array for an empty input', () => {
    expect(groupByRoute([])).toEqual([]);
  });
});

describe('parseCount', () => {
  it('defaults to 30 when --count is absent', () => {
    expect(parseCount([])).toBe(30);
  });

  it('reads "--count=5"', () => {
    expect(parseCount(['--count=5'])).toBe(5);
  });

  it('reads "--count 5"', () => {
    expect(parseCount(['--count', '5'])).toBe(5);
  });

  it('floors a non-integer value', () => {
    expect(parseCount(['--count=5.7'])).toBe(5);
  });

  it('falls back to 30 for a non-finite/invalid value', () => {
    expect(parseCount(['--count=abc'])).toBe(30);
  });

  it('falls back to 30 for a non-positive value', () => {
    expect(parseCount(['--count=0'])).toBe(30);
    expect(parseCount(['--count=-5'])).toBe(30);
  });

  it('prefers "--count=" over a following bare "--count" flag value', () => {
    expect(parseCount(['--count', '7', '--count=9'])).toBe(9);
  });
});

describe('run', () => {
  const originalArgv = process.argv;

  beforeEach(() => {
    vi.clearAllMocks();
    process.argv = ['node', 'cli.ts'];
    for (const key of Object.keys(fakeGenerators)) delete fakeGenerators[key];
  });

  afterEach(() => {
    process.argv = originalArgv;
  });

  it('connects once per distinct route, creates tables, imports, and acks the root ref', async () => {
    // count=1 keeps this to a single batch -- batching itself has its own
    // dedicated tests below.
    process.argv = ['node', 'cli.ts', '--count=1'];
    const routeA = Route.fromFlat('/aCake');
    fakeGenerators.a = fakeEntry('A', routeA, { tableCfgs: [{ key: 'aCake' }] });

    await run();

    expect(ClientCtor).toHaveBeenCalledTimes(1);
    expect(ioClient).toHaveBeenCalledWith('http://localhost:3000/aCake');
    expect(init).toHaveBeenCalledTimes(1);
    expect(ready).toHaveBeenCalledTimes(1);
    expect(createTable).toHaveBeenCalledWith({ key: 'aCake' });
    expect(importFn).toHaveBeenCalledTimes(1);
    expect(sendWithAck).toHaveBeenCalledWith('hash-1');
    expect(tearDown).toHaveBeenCalledTimes(1);
    expect(disconnect).toHaveBeenCalledTimes(1);
  });

  it('opens one connection per distinct route, and reuses one connection for entries sharing a route', async () => {
    process.argv = ['node', 'cli.ts', '--count=1'];
    const routeA = Route.fromFlat('/aCake');
    const routeB = Route.fromFlat('/bCake');
    fakeGenerators.a1 = fakeEntry('A1', routeA);
    fakeGenerators.a2 = fakeEntry('A2', routeA);
    fakeGenerators.b = fakeEntry('B', routeB);

    await run();

    expect(ClientCtor).toHaveBeenCalledTimes(2);
    expect(importFn).toHaveBeenCalledTimes(3);
  });

  it('rejects and still tears down when a generator reports validation errors', async () => {
    const routeA = Route.fromFlat('/aCake');
    fakeGenerators.a = fakeEntry('A', routeA, { validationErrors: ['bad field'] });

    await expect(run()).rejects.toThrow(/bad field/);
    expect(tearDown).toHaveBeenCalledTimes(1);
    expect(disconnect).toHaveBeenCalledTimes(1);
  });

  it('rejects and still tears down when the root table has no row to announce', async () => {
    const routeA = Route.fromFlat('/aCake');
    fakeGenerators.a = fakeEntry('A', routeA, { rootHash: null });

    await expect(run()).rejects.toThrow(/no row found in root table/);
    expect(tearDown).toHaveBeenCalledTimes(1);
    expect(disconnect).toHaveBeenCalledTimes(1);
  });

  it('creates no tables when the result carries no tableCfgs table at all', async () => {
    process.argv = ['node', 'cli.ts', '--count=1'];
    const routeA = Route.fromFlat('/aCake');
    fakeGenerators.a = fakeEntry('A', routeA, { omitTableCfgsTable: true });

    await run();
    expect(createTable).not.toHaveBeenCalled();
    expect(importFn).toHaveBeenCalledTimes(1);
  });

  it('passes the parsed --count through to every generator as a single batch when it fits in one', async () => {
    process.argv = ['node', 'cli.ts', '--count=7'];
    const routeA = Route.fromFlat('/aCake');
    const entry = fakeEntry('A', routeA);
    fakeGenerators.a = entry;

    await run();
    // 7 is below BATCH_SIZE, so this is one batch -- called once, with the
    // full count and *some* numeric start index (the index itself is
    // time-based, not asserted exactly here).
    expect(entry.generate).toHaveBeenCalledTimes(1);
    expect(entry.generate).toHaveBeenCalledWith(7, expect.any(Number));
  });

  it('chunks a count larger than BATCH_SIZE into multiple batches, each generated, imported, and acked separately', async () => {
    // BATCH_SIZE is 20 -- 45 means batches of 20, 20, 5.
    process.argv = ['node', 'cli.ts', '--count=45'];
    const routeA = Route.fromFlat('/aCake');
    const entry = fakeEntry('A', routeA);
    fakeGenerators.a = entry;

    await run();

    expect(entry.generate).toHaveBeenCalledTimes(3);
    const [[size1, start1], [size2, start2], [size3, start3]] = (
      entry.generate as any
    ).mock.calls;
    expect([size1, size2, size3]).toEqual([20, 20, 5]);
    // Every batch offsets from the SAME base index by its own position --
    // proven via the differences, since the base index itself is
    // time-based and not asserted exactly.
    expect(start2 - start1).toBe(20);
    expect(start3 - start1).toBe(40);

    expect(importFn).toHaveBeenCalledTimes(3);
    expect(sendWithAck).toHaveBeenCalledTimes(3);
  });
});

describe('withConcurrency', () => {
  it('runs every index from 0 to total, even when concurrency exceeds total', async () => {
    const seen: number[] = [];
    await withConcurrency(3, 10, async (i) => {
      seen.push(i);
    });
    expect(seen.slice().sort((a, b) => a - b)).toEqual([0, 1, 2]);
  });

  it('does nothing for total=0', async () => {
    const worker = vi.fn().mockResolvedValue(undefined);
    await withConcurrency(0, 4, worker);
    expect(worker).not.toHaveBeenCalled();
  });

  it('never runs more than `concurrency` workers at once', async () => {
    const total = 5;
    const concurrency = 2;
    let current = 0;
    let maxConcurrent = 0;
    const deferreds = Array.from({ length: total }, () => {
      let resolve!: () => void;
      const promise = new Promise<void>((r) => {
        resolve = r;
      });
      return { promise, resolve };
    });

    const donePromise = withConcurrency(total, concurrency, async (i) => {
      current++;
      maxConcurrent = Math.max(maxConcurrent, current);
      await deferreds[i].promise;
      current--;
    });

    // Let the first `concurrency` lanes dispatch their initial calls.
    await Promise.resolve();
    await Promise.resolve();
    expect(current).toBe(concurrency);

    // Release every batch one at a time; each release frees exactly one
    // lane, which immediately claims the next not-yet-started index.
    for (const d of deferreds) {
      d.resolve();
      await Promise.resolve();
      await Promise.resolve();
    }

    await donePromise;
    expect(maxConcurrent).toBe(concurrency);
  });
});
