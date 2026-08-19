// @license
// Copyright (c) 2025 Rljson
//
// Use of this source code is governed by terms that can be
// found in the LICENSE file in the root of this package.

import { beforeEach, describe, expect, it, vi } from 'vitest';

const readdirSync = vi.fn();
const readFileSync = vi.fn();

vi.mock('node:fs', () => ({
  readdirSync: (...args: unknown[]) => readdirSync(...args),
  readFileSync: (...args: unknown[]) => readFileSync(...args),
}));

// Imported AFTER the mock is registered (vi.mock is hoisted above imports
// by vitest, so this ordering is safe).
const { chartFileGenerators, exampleFileGenerators } = await import(
  '../../src/generators/chart-files.ts'
);

describe('chartFileGenerators', () => {
  beforeEach(() => {
    readdirSync.mockReset();
    readFileSync.mockReset();
  });

  it('returns an empty registry when charts/ does not exist', () => {
    readdirSync.mockImplementation(() => {
      throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' });
    });
    expect(chartFileGenerators()).toEqual({});
  });

  it('registers one GeneratorEntry per chart file, keyed by lowerFirst(_name)', () => {
    readdirSync.mockReturnValue(['Widget.json', 'not-json.txt']);
    readFileSync.mockReturnValue(
      JSON.stringify({ _sliceId: 'widgetId', _name: 'Widget', general: [] }),
    );

    const entries = chartFileGenerators();
    expect(Object.keys(entries)).toEqual(['widget']);
    expect(entries.widget.route.flat).toBe('/widgetCake');
    // Only the .json file was read — .txt was filtered out.
    expect(readFileSync).toHaveBeenCalledTimes(1);
  });

  it('throws a source-annotated error when a chart file is missing _name', () => {
    readdirSync.mockReturnValue(['Broken.json']);
    readFileSync.mockReturnValue(JSON.stringify({ general: [] }));

    expect(() => chartFileGenerators()).toThrow(/charts\/Broken\.json.*_name is required/s);
  });
});

describe('exampleFileGenerators', () => {
  beforeEach(() => {
    readdirSync.mockReset();
    readFileSync.mockReset();
  });

  it('returns an empty registry when examples/ does not exist', () => {
    readdirSync.mockImplementation(() => {
      throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' });
    });
    expect(exampleFileGenerators()).toEqual({});
  });

  it('derives a chart from the file basename + content via chartFromJson', () => {
    readdirSync.mockReturnValue(['Product.json']);
    readFileSync.mockReturnValue(JSON.stringify({ name: 'Widget', price: 9.99 }));

    const entries = exampleFileGenerators();
    expect(Object.keys(entries)).toEqual(['product']);
    expect(entries.product.route.flat).toBe('/productCake');
  });

  it('propagates chartFromJson errors for a malformed example file', () => {
    readdirSync.mockReturnValue(['Bad.json']);
    // Valid JSON, but not a plain object -> chartFromExample rejects it.
    readFileSync.mockReturnValue(JSON.stringify('not-an-object'));

    expect(() => exampleFileGenerators()).toThrow(/must be a plain JSON object/);
  });
});
