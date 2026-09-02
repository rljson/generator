// @license
// Copyright (c) 2025 Rljson
//
// Use of this source code is governed by terms that can be
// found in the LICENSE file in the root of this package.

// Shared types only — kept separate from index.ts so that files needing
// just these types (e.g. chart-generator.ts, or any future code-based
// generator) don't transitively pull in index.ts's registry, which
// aggregates chart-files.ts's Node "fs"-based discovery. That distinction
// matters beyond tidiness: the generator-ui repo imports chart-from-json.ts
// across a browser bundle boundary, where Node built-ins aren't
// resolvable at all.

import { Rljson, Route, TableCfg } from '@rljson/rljson';

export interface GenerateResult {
  rljson: Rljson;
  /** TableCfg rows — pass to db.core.createTable() before importing. */
  tableCfgs: TableCfg[];
  /** Empty when all tables are valid. */
  validationErrors: string[];
  /** Summary of row counts per table, for display. */
  stats: Record<string, number>;
}

export interface GeneratorEntry {
  /** Human-readable label used in CLI output. */
  label: string;
  /**
   * The route this generator's root Cake syncs under. A Client/Server pair
   * is single-route (see @rljson/server), so generators with different
   * routes are sent through separate connections — see generate.ts. Several
   * generators MAY share the same route (they must then produce rows for
   * the SAME root table, since only one ref per route gets announced per
   * generate() call); a new, independent entity type needs its own route.
   */
  route: Route;
  /**
   * Generates and converts `count` records, returns a ready-to-import
   * result. `startIndex`, when given, is used verbatim instead of the
   * implementation's own default (usually time-based) — generate.ts uses
   * this to chunk a large `--count` into several smaller batches, each
   * needing its own distinct index range so two batches don't generate
   * byte-identical (and therefore silently deduplicated) content.
   */
  generate(count: number, startIndex?: number): GenerateResult;
}
