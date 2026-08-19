// @license
// Copyright (c) 2025 Rljson
//
// Use of this source code is governed by terms that can be
// found in the LICENSE file in the root of this package.

import { DecomposeChart } from '@rljson/converter';
import { describe, expect, it } from 'vitest';

import { genericRawDataFor } from '../../src/generators/generic-raw-data.ts';

describe('genericRawDataFor', () => {
  it('generates count records starting at startIndex, with a synthesized sliceId', () => {
    const chart: DecomposeChart = {
      _sliceId: 'productId',
      _name: 'Product',
      general: [{ origin: 'name', destination: 'name', type: 'string' }],
    };

    const rows = genericRawDataFor(chart)(2, 5);
    expect(rows).toEqual([
      { productId: '6', name: 'name-5' },
      { productId: '7', name: 'name-6' },
    ]);
  });

  it('derives a value per field purely from its declared type', () => {
    const chart: DecomposeChart = {
      _sliceId: 'id',
      _name: 'X',
      general: [
        { origin: 'n', destination: 'n', type: 'number' },
        { origin: 'b', destination: 'b', type: 'boolean' },
        { origin: 's', destination: 's', type: 'string' },
        { origin: 'u', destination: 'u' }, // no type -> defaults like string
      ],
    };

    const [row0, row1] = genericRawDataFor(chart)(2, 0) as any[];
    expect(row0).toEqual({ id: '1', n: 0, b: true, s: 's-0', u: 'u-0' });
    expect(row1).toEqual({ id: '2', n: 1, b: false, s: 's-1', u: 'u-1' });
  });

  it('writes nested "/" origin paths into a nested object, merging siblings', () => {
    const chart: DecomposeChart = {
      _sliceId: 'id',
      _name: 'X',
      general: [
        { origin: 'data/a', destination: 'a', type: 'string' },
        { origin: 'data/b', destination: 'b', type: 'string' },
      ],
    };

    const [row] = genericRawDataFor(chart)(1, 0) as any[];
    // Both fields must land in the SAME nested "data" object (the second
    // write must merge into the object the first write already created).
    expect(row).toEqual({ id: '1', data: { a: 'a-0', b: 'b-0' } });
  });

  it('ignores non-block, non-underscore keys that are not arrays of PropertyDefs', () => {
    const chart = {
      _sliceId: 'id',
      _name: 'X',
      general: [{ origin: 'n', destination: 'n', type: 'string' }],
      // Not a PropertyDef[] (items lack origin/destination) and not an array
      // at all — neither should be treated as a block.
      notABlock: [{ foo: 1 }],
      alsoNotABlock: 'just a string',
    } as unknown as DecomposeChart;

    const [row] = genericRawDataFor(chart)(1, 0) as any[];
    expect(row).toEqual({ id: '1', n: 'n-0' });
  });

  it('generates exactly one child per _types entry, recursively', () => {
    const chart: DecomposeChart = {
      _sliceId: 'customerId',
      _name: 'Customer',
      general: [],
      _types: [
        {
          _sliceId: 'addressId',
          _name: 'Address',
          _path: 'addresses',
          general: [{ origin: 'street', destination: 'street', type: 'string' }],
        },
      ],
    };

    const [row] = genericRawDataFor(chart)(1, 0) as any[];
    expect(row.addresses).toEqual([{ addressId: '1-0', street: 'street-0' }]);
  });

  it('skips a _types entry missing _path or _sliceId', () => {
    const chart = {
      _sliceId: 'id',
      _name: 'X',
      general: [],
      _types: [
        { _name: 'NoPath', general: [] }, // missing _path
        { _name: 'NoSliceId', _path: 'nope', general: [] }, // missing _sliceId
      ],
    } as unknown as DecomposeChart;

    const [row] = genericRawDataFor(chart)(1, 0) as any[];
    expect(row).toEqual({ id: '1' });
  });
});
