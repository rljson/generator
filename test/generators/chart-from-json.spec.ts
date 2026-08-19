// @license
// Copyright (c) 2025 Rljson
//
// Use of this source code is governed by terms that can be
// found in the LICENSE file in the root of this package.

import { describe, expect, it } from 'vitest';

import {
  chartFromExample,
  chartFromJson,
  chartFromJsonSchema,
  SCALAR_ARRAY_VALUE_FIELD,
  unwrapScalarArrayItem,
  wrapScalarArrayItem,
} from '../../src/generators/chart-from-json.ts';

describe('wrapScalarArrayItem / unwrapScalarArrayItem', () => {
  it('wraps a scalar into a { value } object and back', () => {
    const wrapped = wrapScalarArrayItem('a');
    expect(wrapped).toEqual({ [SCALAR_ARRAY_VALUE_FIELD]: 'a' });
    expect(unwrapScalarArrayItem(wrapped as Record<string, unknown>)).toBe('a');
  });
});

describe('chartFromExample', () => {
  it('throws for non-object input', () => {
    expect(() => chartFromExample('X', 'not-an-object' as any)).toThrow(
      /must be a plain JSON object/,
    );
    expect(() => chartFromExample('X', ['a'] as any)).toThrow();
    expect(() => chartFromExample('X', null as any)).toThrow();
  });

  it('derives _sliceId/_name and flattens scalar + nested-object fields', () => {
    const chart = chartFromExample('Product', {
      name: 'Widget',
      price: 9.99,
      inStock: true,
      note: null,
      dimensions: { width: 10, height: 20 },
    });

    expect(chart._sliceId).toBe('productId');
    expect(chart._name).toBe('Product');
    expect(chart._types).toBeUndefined();

    const fields = chart.general as any[];
    expect(fields).toContainEqual({ origin: 'name', destination: 'name', type: 'string' });
    expect(fields).toContainEqual({ origin: 'price', destination: 'price', type: 'number' });
    expect(fields).toContainEqual({ origin: 'inStock', destination: 'inStock', type: 'boolean' });
    // null falls back to string (type can't be inferred from a single example)
    expect(fields).toContainEqual({ origin: 'note', destination: 'note', type: 'string' });
    // nested object flattened with a "/" origin path
    expect(fields).toContainEqual({ origin: 'dimensions/width', destination: 'width', type: 'number' });
    expect(fields).toContainEqual({ origin: 'dimensions/height', destination: 'height', type: 'number' });
  });

  it('turns an array of objects into a _types sub-entity, recursively', () => {
    const chart = chartFromExample('Customer', {
      customerId: '1',
      addresses: [
        {
          street: 'Main St',
          tags: ['home'],
        },
      ],
    });

    expect(chart._types).toHaveLength(1);
    const addressType = chart._types![0];
    // Naive singularization only strips one trailing "s" ("addresses" ->
    // "addresse") — a documented cosmetic limitation, not a bug.
    expect(addressType._name).toBe('Addresse');
    expect(addressType._path).toBe('addresses');
    expect(addressType._sliceId).toBe('addresseId');
    expect(addressType._scalarArray).toBeUndefined();
    expect(addressType.addresseFields).toEqual([
      { origin: 'street', destination: 'street', type: 'string' },
    ]);
    // the address item itself has an array field -> nested _types, recursively
    expect(addressType._types).toHaveLength(1);
    expect(addressType._types![0]._name).toBe('Tag');
    expect(addressType._types![0]._scalarArray).toBe(true);
  });

  it('omits _types on an object-array entry with no nested arrays of its own', () => {
    const chart = chartFromExample('Customer', {
      addresses: [{ street: 'Main St' }],
    });
    expect(chart._types![0]._types).toBeUndefined();
  });

  it('turns an array of scalars into a _scalarArray _types sub-entity', () => {
    const chart = chartFromExample('Product', {
      tags: ['sale', 'new'],
    });

    expect(chart._types).toHaveLength(1);
    const tagType = chart._types![0];
    expect(tagType._scalarArray).toBe(true);
    expect(tagType._name).toBe('Tag');
    expect(tagType._sliceId).toBe('tagId');
    expect(tagType.tagFields).toEqual([
      { origin: SCALAR_ARRAY_VALUE_FIELD, destination: SCALAR_ARRAY_VALUE_FIELD, type: 'string' },
    ]);
  });

  it('infers the scalar array item type from the first element', () => {
    const chart = chartFromExample('Product', { scores: [1, 2, 3] });
    expect((chart._types![0].scoreFields as any[])[0].type).toBe('number');

    const chart2 = chartFromExample('Product', { flags: [true, false] });
    expect((chart2._types![0].flagFields as any[])[0].type).toBe('boolean');
  });

  it('falls back to string for an empty array (type cannot be inferred)', () => {
    const chart = chartFromExample('Product', { tags: [] });
    const tagType = chart._types![0];
    expect(tagType._scalarArray).toBe(true);
    expect((tagType.tagFields as any[])[0].type).toBe('string');
  });

  it('does not singularize a one-character field name (naive rule guard)', () => {
    // "s".length is 1, so the singularize() length>1 guard keeps it as-is.
    const chart = chartFromExample('Product', { s: ['x'] });
    expect(chart._types![0]._name).toBe('S');
  });
});

describe('chartFromJsonSchema', () => {
  it('throws when the root schema is not an object schema', () => {
    expect(() => chartFromJsonSchema('X', { type: 'string' })).toThrow(
      /root schema must have type "object"/,
    );
    expect(() => chartFromJsonSchema('X', { type: 'object' })).toThrow();
  });

  it('derives scalar fields, mapping integer to number', () => {
    const chart = chartFromJsonSchema('Product', {
      type: 'object',
      properties: {
        name: { type: 'string' },
        pages: { type: 'integer' },
        price: { type: 'number' },
        inStock: { type: 'boolean' },
      },
    });

    expect(chart.general).toEqual(
      expect.arrayContaining([
        { origin: 'name', destination: 'name', type: 'string' },
        { origin: 'pages', destination: 'pages', type: 'number' },
        { origin: 'price', destination: 'price', type: 'number' },
        { origin: 'inStock', destination: 'inStock', type: 'boolean' },
      ]),
    );
  });

  it('uses the schema title (falling back to the given name) for _sliceId', () => {
    const withTitle = chartFromJsonSchema('Fallback', {
      type: 'object',
      title: 'Book',
      properties: {},
    });
    expect(withTitle._sliceId).toBe('bookId');
    expect(withTitle._name).toBe('Fallback');

    const withoutTitle = chartFromJsonSchema('Book', {
      type: 'object',
      properties: {},
    });
    expect(withoutTitle._sliceId).toBe('bookId');
  });

  it('flattens nested object properties recursively', () => {
    const chart = chartFromJsonSchema('Product', {
      type: 'object',
      properties: {
        dimensions: {
          type: 'object',
          properties: { width: { type: 'number' }, height: { type: 'number' } },
        },
      },
    });
    expect(chart.general).toEqual(
      expect.arrayContaining([
        { origin: 'dimensions/width', destination: 'width', type: 'number' },
        { origin: 'dimensions/height', destination: 'height', type: 'number' },
      ]),
    );
  });

  it('skips properties with an unsupported/missing type', () => {
    const chart = chartFromJsonSchema('Product', {
      type: 'object',
      properties: {
        weird: { type: 'null' },
        noType: {},
      },
    });
    // "weird" (unsupported type) is silently skipped.
    expect(chart.general).not.toEqual(expect.arrayContaining([
      expect.objectContaining({ origin: 'weird' }),
    ]));
    // a property with no declared type at all is treated as a scalar string.
    expect(chart.general).toContainEqual({ origin: 'noType', destination: 'noType', type: 'string' });
  });

  it('builds a _types entry for an array of objects, recursively', () => {
    const chart = chartFromJsonSchema('Customer', {
      type: 'object',
      properties: {
        addresses: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              street: { type: 'string' },
              tags: { type: 'array', items: { type: 'string' } },
            },
          },
        },
      },
    });

    expect(chart._types).toHaveLength(1);
    const addressType = chart._types![0];
    // Naive singularization only strips one trailing "s" ("addresses" ->
    // "addresse") — a documented cosmetic limitation, not a bug.
    expect(addressType._name).toBe('Addresse');
    expect(addressType.addresseFields).toEqual([
      { origin: 'street', destination: 'street', type: 'string' },
    ]);
    expect(addressType._types).toHaveLength(1);
    expect(addressType._types![0]._scalarArray).toBe(true);
  });

  it('omits _types on an object-array entry with no nested arrays of its own', () => {
    const chart = chartFromJsonSchema('Customer', {
      type: 'object',
      properties: {
        addresses: {
          type: 'array',
          items: { type: 'object', properties: { street: { type: 'string' } } },
        },
      },
    });
    expect(chart._types![0]._types).toBeUndefined();
  });

  it('builds a _scalarArray _types entry for an array of scalars', () => {
    const chart = chartFromJsonSchema('Product', {
      type: 'object',
      properties: {
        tags: { type: 'array', items: { type: 'string' } },
      },
    });
    const tagType = chart._types![0];
    expect(tagType._scalarArray).toBe(true);
    expect((tagType.tagFields as any[])[0].type).toBe('string');
  });

  it('treats an array with no "items" schema as a scalar array (string fallback)', () => {
    const chart = chartFromJsonSchema('Product', {
      type: 'object',
      properties: { tags: { type: 'array' } },
    });
    expect(chart._types![0]._scalarArray).toBe(true);
    expect((chart._types![0].tagFields as any[])[0].type).toBe('string');
  });

  it('omits an array item schema with no usable shape (object with no properties)', () => {
    const chart = chartFromJsonSchema('Product', {
      type: 'object',
      properties: {
        weirdItems: { type: 'array', items: { type: 'object' } },
      },
    });
    expect(chart._types ?? []).toHaveLength(0);
  });
});

describe('chartFromJson (auto-detection)', () => {
  it('treats a plain example object as an example', () => {
    const chart = chartFromJson('Product', { name: 'Widget' });
    expect(chart.general).toEqual([{ origin: 'name', destination: 'name', type: 'string' }]);
  });

  it('detects a JSON Schema via a "properties" map', () => {
    const chart = chartFromJson('Product', {
      type: 'object',
      properties: { name: { type: 'string' } },
    });
    expect(chart.general).toEqual([{ origin: 'name', destination: 'name', type: 'string' }]);
  });

  it('detects a JSON Schema via "$schema"', () => {
    const chart = chartFromJson('Product', {
      $schema: 'https://json-schema.org/draft/2020-12/schema',
      type: 'object',
      properties: { name: { type: 'string' } },
    } as any);
    expect(chart.general).toHaveLength(1);
  });

  it('treats a non-object input as an example (and lets chartFromExample reject it)', () => {
    expect(() => chartFromJson('Product', 'nope' as any)).toThrow();
  });

  it('treats an object whose "properties" value is not itself an object as an example', () => {
    const chart = chartFromJson('Weird', { properties: 'not-a-schema-map' } as any);
    expect(chart.general).toEqual([
      { origin: 'properties', destination: 'properties', type: 'string' },
    ]);
  });
});
