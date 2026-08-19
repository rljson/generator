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

/** URL of the running @rljson/server instance to connect to. */
export const serverUrl = (): string =>
  process.env.SERVER_URL ?? 'http://localhost:3000';

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
 * Tables in the Server's MSSQL database are NOT created here — that's a
 * one-time step, see setup-server-tables.ts.
 */
export const run = async (): Promise<void> => {
  const count = parseCount(process.argv.slice(2));

  for (const { route, entries } of groupByRoute(Object.values(generators))) {
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
      // persists the full batch into MSSQL before acknowledging.
      { syncConfig: { requireAck: true, ackTimeoutMs: 60_000 } },
    );
    await client.init();
    await client.ready();

    try {
      for (const entry of entries) {
        const result = entry.generate(count);

        if (result.validationErrors.length > 0) {
          throw new Error(
            `${entry.label}: ${result.validationErrors.join('; ')}`,
          );
        }

        const tableCfgs =
          (result.rljson.tableCfgs as TablesCfgTable | undefined)?._data ??
          [];
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
        await client.connector!.sendWithAck(ref);
      }
    } finally {
      await client.tearDown();
      socket.disconnect();
    }
  }
};
