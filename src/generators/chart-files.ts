// @license
// Copyright (c) 2025 Rljson
//
// Use of this source code is governed by terms that can be
// found in the LICENSE file in the root of this package.

// Auto-registers one GeneratorEntry per JSON file dropped into either of two
// top-level, zero-code directories — no generators/<name>.ts file, no entry
// in the `generators` registry, nothing to import:
//
// - charts/    — already a DecomposeChart. Used as-is.
// - examples/  — a plain example record OR a JSON Schema, NOT a chart.
//   `chartFromJson` (see chart-from-json.ts) derives the DecomposeChart
//   automatically from the data's own shape — the lowest-ceremony way to
//   add a new entity type, at the cost of some inference limitations (see
//   that module's doc, e.g. field types are approximate when derived from
//   an example that happens to have a `null` in a given field).
//
// Either way, raw data is generated purely from the (derived or authored)
// chart's declared `type`s (see generic-raw-data.ts), so it looks like
// "fieldName-3" rather than realistic domain data. For that, write a
// code-based generator instead (chart-generator.ts + customers.ts is the
// reference example).

import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { DecomposeChart } from '@rljson/converter';
import { Json } from '@rljson/json';

import { chartFromJson } from './chart-from-json.ts';
import { createChartGenerator } from './chart-generator.ts';
import { genericRawDataFor } from './generic-raw-data.ts';
import { GeneratorEntry } from './generator-entry.ts';

const chartsDir = fileURLToPath(new URL('../../charts', import.meta.url));
const examplesDir = fileURLToPath(new URL('../../examples', import.meta.url));

/** Reads every `*.json` file in `dir`, parsed. Returns an empty list (not
 * an error) when the directory doesn't exist — both directories are
 * optional, only relevant once someone actually drops a file there. */
const readJsonFiles = (dir: string): Array<{ fileName: string; content: Json }> => {
  let fileNames: string[];
  try {
    fileNames = readdirSync(dir).filter((f) => f.endsWith('.json'));
  } catch {
    return [];
  }
  return fileNames.map((fileName) => ({
    fileName,
    content: JSON.parse(readFileSync(path.join(dir, fileName), 'utf-8')) as Json,
  }));
};

const registerChart = (
  entries: Record<string, GeneratorEntry>,
  chart: DecomposeChart,
  sourceDescription: string,
): void => {
  if (!chart._name) {
    throw new Error(
      `${sourceDescription}: chart._name is required (used to derive the route and the entry's registry key).`,
    );
  }
  const key = chart._name.charAt(0).toLowerCase() + chart._name.slice(1);
  entries[key] = createChartGenerator({
    label: chart._name,
    chart,
    generateRaw: genericRawDataFor(chart),
  });
};

/**
 * Reads every `*.json` DecomposeChart in charts/ and wraps each one into a
 * ready-to-register GeneratorEntry.
 */
export const chartFileGenerators = (): Record<string, GeneratorEntry> => {
  const entries: Record<string, GeneratorEntry> = {};
  for (const { fileName, content } of readJsonFiles(chartsDir)) {
    registerChart(entries, content as DecomposeChart, `charts/${fileName}`);
  }
  return entries;
};

/**
 * Reads every `*.json` example/schema in examples/, derives its
 * DecomposeChart via `chartFromJson` (the file's basename, without
 * extension, becomes the entity's `_name` — e.g. `examples/Product.json`
 * -> `_name: "Product"`), and wraps each into a ready-to-register
 * GeneratorEntry — the same way `chartFileGenerators` does for
 * already-authored charts.
 */
export const exampleFileGenerators = (): Record<string, GeneratorEntry> => {
  const entries: Record<string, GeneratorEntry> = {};
  for (const { fileName, content } of readJsonFiles(examplesDir)) {
    const name = path.basename(fileName, '.json');
    const chart = chartFromJson(name, content);
    registerChart(entries, chart, `examples/${fileName}`);
  }
  return entries;
};
