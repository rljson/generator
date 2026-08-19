// @license
// Copyright (c) 2025 Rljson
//
// Use of this source code is governed by terms that can be
// found in the LICENSE file in the root of this package.

import { DecomposeChart } from '@rljson/converter';
import { describe, expect, it, vi } from 'vitest';

import { createChartGenerator } from '../../src/generators/chart-generator.ts';

describe('createChartGenerator', () => {
  it('throws when the chart has no _name', () => {
    expect(() =>
      createChartGenerator({
        label: 'X',
        chart: {} as DecomposeChart,
        generateRaw: () => [],
      }),
    ).toThrow(/chart._name is required/);
  });

  it('derives the route from the chart name (lowercased + "Cake")', () => {
    const entry = createChartGenerator({
      label: 'Widgets',
      chart: { _sliceId: 'widgetId', _name: 'Widget', general: [] },
      generateRaw: () => [{ widgetId: '1' }],
    });
    expect(entry.route.flat).toBe('/widgetCake');
    expect(entry.label).toBe('Widgets');
  });

  it('passes a fresh, varying startIndex to generateRaw on each call', () => {
    const generateRaw = vi.fn().mockReturnValue([{ widgetId: '1' }]);
    const entry = createChartGenerator({
      label: 'Widgets',
      chart: { _sliceId: 'widgetId', _name: 'Widget', general: [] },
      generateRaw,
    });

    entry.generate(3);
    expect(generateRaw).toHaveBeenCalledWith(3, expect.any(Number));
    const [count, startIndex] = generateRaw.mock.calls[0];
    expect(count).toBe(3);
    expect(startIndex).toBeGreaterThanOrEqual(0);
    expect(startIndex).toBeLessThan(100_000);
  });

  it('builds per-table stats from the decomposed rljson result', () => {
    const entry = createChartGenerator({
      label: 'Widgets',
      chart: {
        _sliceId: 'widgetId',
        _name: 'Widget',
        general: [{ origin: 'name', destination: 'name', type: 'string' }],
      },
      generateRaw: (count) =>
        Array.from({ length: count }, (_, i) => ({ widgetId: String(i), name: `w${i}` })),
    });

    const result = entry.generate(4);
    expect(result.validationErrors).toEqual([]);
    expect(result.tableCfgs).toEqual([]);
    expect(result.stats.widgetGeneral).toBe(4);
    expect(result.stats.widgetCake).toBe(1);
  });
});
