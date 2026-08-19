// @license
// Copyright (c) 2025 Rljson
//
// Use of this source code is governed by terms that can be
// found in the LICENSE file in the root of this package.

// Produces placeholder raw data purely from a DecomposeChart's declared
// structure — no code, no domain knowledge, just the field's `type`. This
// is what makes a chart-only (zero-code) generator possible: given nothing
// but the chart, every `origin` path gets a value derived mechanically
// from its `type` (string/number/boolean) and its index, and every nested
// `_types` entry gets exactly one generated child, recursively.

import { DecomposeChart } from '@rljson/converter';
import { Json } from '@rljson/json';

type PropertyDef = { origin: string; destination: string; type?: string };

const isPropertyDefArray = (value: unknown): value is PropertyDef[] =>
  Array.isArray(value) &&
  value.every(
    (v) => v && typeof v === 'object' && 'origin' in v && 'destination' in v,
  );

const blockKeysOf = (chart: DecomposeChart): string[] =>
  Object.keys(chart).filter(
    (key) => !key.startsWith('_') && isPropertyDefArray(chart[key]),
  );

const setNestedPath = (
  target: Record<string, unknown>,
  path: string,
  value: unknown,
): void => {
  const keys = path.split('/');
  let node: Record<string, unknown> = target;
  for (let i = 0; i < keys.length - 1; i++) {
    const existing = node[keys[i]];
    const child =
      existing && typeof existing === 'object'
        ? (existing as Record<string, unknown>)
        : {};
    node[keys[i]] = child;
    node = child;
  }
  node[keys[keys.length - 1]] = value;
};

/** A field's `type` is the only signal available — no field-name heuristics. */
const genericValue = (
  destination: string,
  type: string | undefined,
  index: number,
): unknown => {
  switch (type) {
    case 'number':
      return index;
    case 'boolean':
      return index % 2 === 0;
    default:
      return `${destination}-${index}`;
  }
};

const buildEntity = (
  chart: DecomposeChart,
  index: number,
  sliceId: string,
): Json => {
  const entity: Record<string, unknown> = { [chart._sliceId]: sliceId };

  for (const blockKey of blockKeysOf(chart)) {
    for (const def of chart[blockKey] as PropertyDef[]) {
      setNestedPath(
        entity,
        def.origin,
        genericValue(def.destination, def.type, index),
      );
    }
  }

  for (const subChart of chart._types ?? []) {
    if (!subChart._path || !subChart._sliceId) continue;
    // Exactly one generated child per nested type — enough to prove the
    // relationship is populated without needing a "how many" input.
    entity[subChart._path] = [buildEntity(subChart, index, `${sliceId}-0`)];
  }

  return entity as Json;
};

/**
 * Builds a `generateRaw(count, startIndex)` function for `chart` with no
 * information beyond the chart itself.
 */
export const genericRawDataFor =
  (chart: DecomposeChart) =>
  (count: number, startIndex: number): Json[] =>
    Array.from({ length: count }, (_, idx) => {
      const i = startIndex + idx;
      return buildEntity(chart, i, String(i + 1));
    });
