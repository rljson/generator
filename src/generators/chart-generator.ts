// @license
// Copyright (c) 2025 Rljson
//
// Use of this source code is governed by terms that can be
// found in the LICENSE file in the root of this package.

import { DecomposeChart, fromJson } from '@rljson/converter';
import { Json } from '@rljson/json';
import { Route } from '@rljson/rljson';

import { GenerateResult, GeneratorEntry } from './generator-entry.ts';

/**
 * Same-second reruns must still produce distinguishable data — RLJSON is
 * content-addressed, so byte-identical rows are silently deduplicated
 * rather than landing as new rows. Bounded (not a raw timestamp) so
 * generated ids/numbers stay human-scale.
 */
const timeBasedStartIndex = (): number => Math.floor(Date.now() / 1000) % 100_000;

export interface ChartGeneratorOptions {
  /** Human-readable label used in CLI output. */
  label: string;
  /**
   * The chart this generator produces data for. Its `_name` is required —
   * @rljson/converter's own cake-naming convention (`_name.toLowerCase() +
   * "Cake"`) is reused verbatim to derive this generator's route, so a
   * generated batch's root ref always resolves to a real, walkable Cake
   * row under that same name on the Server side.
   */
  chart: DecomposeChart;
  /**
   * Produces `count` raw rows matching the chart's expected input shape,
   * starting at `startIndex`. Must be deterministic for a given (count,
   * startIndex) pair — createChartGenerator supplies a fresh, time-based
   * startIndex on every generate() call, so callers don't need their own
   * anti-deduplication logic; they only need indices to actually vary the
   * generated content (e.g. by picking from a pool via `index % pool.length`).
   */
  generateRaw: (count: number, startIndex: number) => Json[];
}

/**
 * Builds a GeneratorEntry from just a DecomposeChart and a raw-row
 * generator function. Route derivation, run-uniqueness, and the
 * GenerateResult/stats wrapping are all generic — driven entirely by the
 * chart — so adding a new data type never needs to duplicate that
 * boilerplate; see generators/customers.ts for a full worked example.
 */
export const createChartGenerator = (
  options: ChartGeneratorOptions,
): GeneratorEntry => {
  const { chart } = options;
  if (!chart._name) {
    throw new Error(
      'createChartGenerator: chart._name is required to derive the route.',
    );
  }
  const route = Route.fromFlat(`${chart._name.toLowerCase()}Cake`);

  return {
    label: options.label,
    route,

    generate(count: number): GenerateResult {
      const startIndex = timeBasedStartIndex();
      const raw = options.generateRaw(count, startIndex);
      const rljson = fromJson(raw, chart);

      const tableNames = Object.keys(rljson).filter((k) => !k.startsWith('_'));
      const stats: Record<string, number> = {};
      for (const key of tableNames) {
        const table = rljson[key] as { _data?: unknown[] };
        // fromJson()'s fixed table taxonomy (Cake/Layer/Components/SliceIds/
        // InsertHistory/Edits/MultiEdits/EditHistory/TableCfgs) always gives
        // every non-underscore key a real `_data` array (possibly empty,
        // never absent) — this guard has no reachable false case today, but
        // stays as a defensive check against a future/malformed table shape.
        /* v8 ignore else -- @preserve */
        if (Array.isArray(table._data)) {
          stats[key] = table._data.length;
        }
      }

      return { rljson, tableCfgs: [], validationErrors: [], stats };
    },
  };
};
