// @license
// Copyright (c) 2025 Rljson
//
// Use of this source code is governed by terms that can be
// found in the LICENSE file in the root of this package.

import { describe, expect, it } from 'vitest';

import { Generator } from '../src/generator';


describe('Generator', () => {
  it('should validate a template', () => {
    const generator = Generator.example;
    expect(generator).toBeDefined();
  });
});
