// @license
// Copyright (c) 2025 Rljson
//
// Use of this source code is governed by terms that can be
// found in the LICENSE file in the root of this package.

import { BsMem } from '@rljson/bs';
import { IoMem } from '@rljson/io';
import { Route, TableCfg, TablesCfgTable } from '@rljson/rljson';
import { Client, SocketIoBridge } from '@rljson/server';

import { io as socketIoClient } from 'socket.io-client';

import { GeneratorEntry, generators } from './generators/index.ts';
import { timeBasedStartIndex } from './generators/chart-generator.ts';

/** URL of the running @rljson/server instance to connect to. */
export const serverUrl = (): string =>
  process.env.SERVER_URL ?? 'http://localhost:3000';

/** Reads a positive integer from `envVar`, falling back to `fallback` when
 * unset or not a positive number. Read lazily (called at point of use, not
 * cached in a module-level const) for the same reason `serverUrl()` above
 * is a function: `cli.ts` imports this module before calling
 * `process.loadEnvFile()`, so a top-level `const` would freeze in the
 * default before `.env` ever gets a chance to override it. Exported for
 * direct testing, same reasoning as `withConcurrency`. */
export const positiveIntFromEnv = (envVar: string, fallback: number): number => {
  const raw = process.env[envVar];
  if (raw === undefined) return fallback;
  const value = Number(raw);
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : fallback;
};

/**
 * Max records per `sendWithAck` batch. A single batch's whole subtree
 * (e.g. one Customer's addresses and their component tables, times
 * however many customers are in that batch) has to be walked and
 * persisted server-side before the ack — a `--count` far above this,
 * sent as one batch, risks exceeding the Server's ACK timeout on its own
 * regardless of any server-side optimization. Chunking keeps each
 * individual round trip's cost roughly constant no matter how large
 * `--count` gets; see `runGroup` for how the chunks themselves are sent.
 *
 * The default (10) was tuned against one specific local machine and MSSQL
 * instance (see `GENERATE_BATCH_CONCURRENCY`'s own doc for how) — treat it
 * as a starting point, not a universal constant. Override via
 * `GENERATE_BATCH_SIZE` per environment instead of editing this file.
 */
export const batchSize = (): number => positiveIntFromEnv('GENERATE_BATCH_SIZE', 10);

/** Max batches in flight at once per route/connection. `sendWithAck` calls
 * for different refs on the same connection are independent (the
 * Connector matches each ack by ref, see `Connector.sendWithAck`), so
 * running several concurrently is safe in principle and lets a large
 * `--count` finish faster than strictly one-batch-at-a-time chunking
 * would.
 *
 * The default (2) is deliberately conservative: higher concurrency
 * contends with itself on the Server's single Node event loop and MSSQL
 * connection pool, which can make individual batches' own completion
 * time unpredictable rather than actually finishing the whole run
 * faster — worse for ACK-timeout robustness than the throughput a lower
 * value gives up. A different environment (more CPU, a remote/pooled
 * MSSQL instance) may tolerate a higher value — override via
 * `GENERATE_BATCH_CONCURRENCY` and confirm empirically rather than
 * assuming this default transfers.
 */
export const batchConcurrency = (): number =>
  positiveIntFromEnv('GENERATE_BATCH_CONCURRENCY', 2);

/** `sendWithAck` timeout in ms, per batch. See `runGroup`'s own comment
 * for why 120s of margin exists on top of `batchSize()`/`batchConcurrency()`
 * already being tuned to keep the common case well below this. Override
 * via `GENERATE_ACK_TIMEOUT_MS`. */
export const ackTimeoutMs = (): number =>
  positiveIntFromEnv('GENERATE_ACK_TIMEOUT_MS', 120_000);

/** Runs `worker` once per index in `[0, total)`, at most `concurrency`
 * invocations in flight at any moment. Order of completion is not
 * guaranteed; order of dispatch (which index each of the `concurrency`
 * "lanes" picks up next) is, since each lane simply claims the next
 * not-yet-claimed index as soon as it's free. Exported for direct,
 * precise unit testing of the concurrency bound itself — the alternative
 * (asserting it indirectly through the full run()/runEntry() stack) would
 * mean choreographing exact promise-resolution timing through several
 * more async layers for no real gain in confidence. */
export const withConcurrency = async (
  total: number,
  concurrency: number,
  worker: (index: number) => Promise<void>,
): Promise<void> => {
  let next = 0;
  const lanes = Array.from({ length: Math.min(concurrency, total) }, async () => {
    while (next < total) {
      const index = next++;
      await worker(index);
    }
  });
  await Promise.all(lanes);
};

/**
 * Groups registered generators by their route. Each group gets its own
 * Client connection (see run()) — a Client/Server pair is single-route, so
 * generators with different routes can never share one connection.
 */
export const groupByRoute = (
  entries: GeneratorEntry[],
): { route: Route; entries: GeneratorEntry[] }[] => {
  const byRoute = new Map<string, { route: Route; entries: GeneratorEntry[] }>();
  for (const entry of entries) {
    const key = entry.route.flat;
    const group = byRoute.get(key) ?? { route: entry.route, entries: [] };
    group.entries.push(entry);
    byRoute.set(key, group);
  }
  return [...byRoute.values()];
};

/** Reads --count=<n> (or --count <n>) from argv, falling back to 30. */
export const parseCount = (argv: string[]): number => {
  const eqArg = argv.find((a) => a.startsWith('--count='));
  const flagIndex = argv.indexOf('--count');
  const raw =
    eqArg?.split('=')[1] ??
    (flagIndex >= 0 ? argv[flagIndex + 1] : undefined);
  const value = raw !== undefined ? Number(raw) : 30;
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : 30;
};

/**
 * Connects to the Server as an @rljson/server Client — one connection per
 * distinct route among the registered generators, since a Client/Server
 * pair is inherently single-route (each connects to
 * `${serverUrl()}${route.flat}`, a distinct Socket.IO namespace; see the
 * Server repo's RLJSON_ROUTES) — generates data for every generator in that
 * route's group, and writes it into the client's own local Io (in-memory —
 * it only needs to survive until the sync round-trip below completes). No
 * direct database connection, no UI, no output on success.
 *
 * `@rljson/db`'s Core.import() is a raw bulk write and does not trigger the
 * Connector's automatic ref broadcast (that only fires for Db.insert(), which
 * expects data pre-shaped into Cake/Layer refs rather than the raw nested
 * customer objects this Generator's DecomposeChart produces — not a good fit
 * here). So after each import, the batch's actual Cake row hash is announced
 * explicitly via connector.sendWithAck() and awaited. The Server's
 * onRefArrived hook (see src/server-bootstrap.ts in the Server repo) walks
 * that Cake's official child references (Db.getController()/getChildRefs(),
 * the same mechanism Db uses internally — no raw dump of local storage) and
 * persists everything it finds into the Server's own database BEFORE
 * acknowledging. By the time sendWithAck() resolves, the data is guaranteed
 * durable server-side even though this process disconnects immediately
 * afterwards.
 *
 * A large `--count` is NOT sent as one giant batch: each entry's records
 * are chunked into batches of at most `batchSize()`, each with its own
 * `generate()`/import/sendWithAck cycle, so an individual round trip's
 * cost (and thus its risk of hitting the Server's ACK timeout) stays
 * roughly constant regardless of how large `--count` gets. Batches run
 * with bounded concurrency (`batchConcurrency()`) rather than one at a
 * time, so this scales without a large `--count` simply taking N times as
 * long as a small one would. Both, plus the ACK timeout itself, are
 * environment-tunable — see their own doc comments and
 * GENERATE_BATCH_SIZE/GENERATE_BATCH_CONCURRENCY/GENERATE_ACK_TIMEOUT_MS.
 *
 * Tables in the Server's MSSQL database are NOT created here — that's a
 * one-time step, see setup-server-tables.ts.
 */
export const run = async (): Promise<void> => {
  const count = parseCount(process.argv.slice(2));

  // Route groups run concurrently, not one after another: each opens its
  // own independent Socket.IO connection (a Client/Server pair is
  // single-route, see groupByRoute's own doc comment), so there is no
  // shared state between them to serialize on. With N registered entity
  // types, running them one at a time means paying for N sequential
  // sendWithAck round trips (each already covering a whole batch of
  // `count` records plus the Server's persist walk) even though nothing
  // about them depends on one another -- wall-clock time used to grow
  // with the number of entity types, not stay flat. Entries *within* one
  // route group still run sequentially, since they share that one
  // connection.
  await Promise.all(
    groupByRoute(Object.values(generators)).map((group) =>
      runGroup(group, count),
    ),
  );
};

const runGroup = async (
  { route, entries }: { route: Route; entries: GeneratorEntry[] },
  count: number,
): Promise<void> => {
  const rootTableKey = route.top.tableKey;

  const localIo = new IoMem();
  await localIo.init();

  const socket = socketIoClient(`${serverUrl()}${route.flat}`);
  const client = new Client(
    new SocketIoBridge(socket),
    localIo,
    new BsMem(),
    route,
    // ackTimeoutMs generous: the Server's onRefArrived hook walks and
    // persists a whole batch into MSSQL before acknowledging, and under
    // real concurrent load (several batches in flight at once, see
    // batchConcurrency()) an individual batch's own completion time can
    // vary well beyond its cost in isolation, purely from contention —
    // not a sign anything is actually stuck. The default gives real
    // margin on top of batchSize()/batchConcurrency() already being tuned
    // to keep the common case far below this; see GENERATE_ACK_TIMEOUT_MS
    // to raise it further for a slower environment.
    { syncConfig: { requireAck: true, ackTimeoutMs: ackTimeoutMs() } },
  );
  await client.init();
  await client.ready();

  try {
    for (const entry of entries) {
      await runEntry(client, rootTableKey, entry, count);
    }
  } finally {
    await client.tearDown();
    socket.disconnect();
  }
};

/**
 * Generates and syncs one entry's `count` records, chunked into batches of
 * at most `batchSize()` (see its own doc comment for why). Every batch
 * shares one common base index (a single `timeBasedStartIndex()` call for
 * the whole entry, not one per batch — batches offset from it by their own
 * position instead), so a rerun a moment later still lands on a disjoint
 * index range as a whole, exactly like the unchunked path used to.
 *
 * The generate/import step for each batch runs strictly in sequence
 * first, since it's cheap, local, in-memory work with no reason to
 * parallelize; only the network-bound sendWithAck step (one per batch)
 * then runs with bounded concurrency (`batchConcurrency()`) via
 * `withConcurrency`.
 */
const runEntry = async (
  client: Client,
  rootTableKey: string,
  entry: GeneratorEntry,
  count: number,
): Promise<void> => {
  const maxBatchSize = batchSize();
  const baseIndex = timeBasedStartIndex();
  const batchCount = Math.ceil(count / maxBatchSize);
  const refs: string[] = new Array(batchCount);

  for (let batch = 0; batch < batchCount; batch++) {
    const offset = batch * maxBatchSize;
    const thisBatchSize = Math.min(maxBatchSize, count - offset);
    const result = entry.generate(thisBatchSize, baseIndex + offset);

    if (result.validationErrors.length > 0) {
      throw new Error(
        `${entry.label}: ${result.validationErrors.join('; ')}`,
      );
    }

    const tableCfgs =
      (result.rljson.tableCfgs as TablesCfgTable | undefined)?._data ?? [];
    for (const cfg of tableCfgs as TableCfg[]) {
      await client.db!.core.createTable(cfg);
    }
    await client.db!.core.import(result.rljson);

    const rootRows = (result.rljson[rootTableKey] as { _data?: any[] })
      ?._data;
    const ref = rootRows?.[0]?._hash as string | undefined;
    if (!ref) {
      throw new Error(
        `${entry.label}: no row found in root table "${rootTableKey}" to announce.`,
      );
    }
    refs[batch] = ref;
  }

  await withConcurrency(refs.length, batchConcurrency(), async (i) => {
    await client.connector!.sendWithAck(refs[i]);
  });
};
