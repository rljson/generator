// @license
// Copyright (c) 2025 Rljson
//
// Use of this source code is governed by terms that can be
// found in the LICENSE file in the root of this package.

import { TableCfg, TablesCfgTable } from '@rljson/rljson';

import { generators } from './generators/index.ts';

/**
 * Every registered generator's TableCfgs, deduplicated by key. TableCfgs
 * never depend on row content — only on each generator's fixed
 * DecomposeChart — so deriving them from one throwaway generate(1) call per
 * generator keeps this in sync with the charts automatically instead of
 * hand-duplicating the schema.
 *
 * Used by setup-server-tables.ts, a one-time provisioning script — this is
 * NOT part of the regular generate flow, which creates its own (ephemeral,
 * per-run) local tables as it always has.
 */
export const allTableCfgs = (): TableCfg[] => {
  const byKey = new Map<string, TableCfg>();
  for (const entry of Object.values(generators)) {
    const { rljson } = entry.generate(1);
    const cfgs = (rljson.tableCfgs as TablesCfgTable)._data as TableCfg[];
    for (const cfg of cfgs) byKey.set(cfg.key, cfg);
  }
  return [...byKey.values()];
};
