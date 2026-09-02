// @license
// Copyright (c) 2025 Rljson
//
// Use of this source code is governed by terms that can be
// found in the LICENSE file in the root of this package.

import { describe, expect, it } from 'vitest';

import { allTableCfgs } from '../src/table-cfgs.ts';

describe('allTableCfgs', () => {
  it('aggregates every registered generator TableCfg, deduplicated by key', () => {
    const cfgs = allTableCfgs();
    expect(cfgs.length).toBeGreaterThan(0);

    const keys = cfgs.map((c) => c.key);
    expect(new Set(keys).size).toBe(keys.length);
    expect(keys.some((k) => k.toLowerCase().includes('customer'))).toBe(true);
  });
});
