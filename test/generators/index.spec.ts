// @license
// Copyright (c) 2025 Rljson
//
// Use of this source code is governed by terms that can be
// found in the LICENSE file in the root of this package.

import { describe, expect, it } from 'vitest';

import { generators } from '../../src/generators/index.ts';

describe('generators registry', () => {
  it('includes "Customer" from the real charts/Customer.json file (zero-code)', () => {
    // Real filesystem, no mocking: charts/Customer.json is an actual file
    // in this repo, and examples/ doesn't exist — so the registry is
    // exactly this one, chart-file-derived entry.
    expect(Object.keys(generators)).toEqual(['customer']);
    expect(generators.customer.route.flat).toBe('/customerCake');
    expect(generators.customer.label).toBe('Customer');
  });
});
