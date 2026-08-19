// @license
// Copyright (c) 2025 Rljson
//
// Use of this source code is governed by terms that can be
// found in the LICENSE file in the root of this package.

import { describe, expect, it } from 'vitest';

import { generators } from '../../src/generators/index.ts';

describe('generators registry', () => {
  it('includes the code-based customers generator', () => {
    expect(generators.customers).toBeDefined();
    expect(generators.customers.route.flat).toBe('/customerCake');
  });

  it('has no chart-file/example-file entries when charts/ and examples/ are empty', () => {
    // Real filesystem, no mocking: neither directory exists in this repo
    // today, so chartFileGenerators()/exampleFileGenerators() both
    // contribute nothing — the registry is exactly { customers }.
    expect(Object.keys(generators)).toEqual(['customers']);
  });
});
