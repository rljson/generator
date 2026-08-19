// @license
// Copyright (c) 2025 Rljson
//
// Use of this source code is governed by terms that can be
// found in the LICENSE file in the root of this package.

// Derives a DecomposeChart automatically from either a plain example JSON
// object or a (small subset of) JSON Schema — so a new entity type can be
// added by dropping a data shape, not a hand-authored chart. See
// `chartFromExample`/`chartFromJsonSchema` below for how each field kind
// maps, and the module doc on `wrapScalarArrayItem`/`unwrapScalarArrayItem`
// for how plain-scalar arrays (e.g. `tags: string[]`) — which
// `@rljson/converter`'s DecomposeChart model cannot address directly, since
// every `_types` entry's items must be objects with named properties — are
// made to work anyway.

import { DecomposeChart, DecomposeChartComponentPropertyDef } from '@rljson/converter';
import { Json, JsonBasicValueType } from '@rljson/json';

// ─── Naming helpers ──────────────────────────────────────────────────────────

const capitalize = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1);
const lowerFirst = (s: string): string => s.charAt(0).toLowerCase() + s.slice(1);

/** Naive, mechanical singularization ("addresses" -> "address", "tags" ->
 * "tag") — good enough to derive a `_name`/`_sliceId` for v1; irregular
 * plurals (e.g. "categories") won't singularize correctly and will just
 * keep their trailing "s" stripped ("categorie") — a cosmetic, not a
 * functional, limitation. */
const singularize = (key: string): string =>
  key.endsWith('s') && key.length > 1 ? key.slice(0, -1) : key;

const sliceIdField = (name: string): string => `${lowerFirst(name)}Id`;

/**
 * `fromJson()` requires every block (component) name to be unique across
 * the WHOLE chart tree, not just within one nesting level (it throws "All
 * component names must be unique within one chart!" otherwise) — so every
 * `_types` sub-chart needs its own, distinct block name. The root chart
 * keeps the conventional `general` (matching hand-authored charts like
 * `customerChart`); every nested type derives its block name from its own
 * (already-required-unique) `_name`, which guarantees no collision with
 * `general` or with any other type's block.
 */
const blockKeyFor = (typeName: string): string => `${lowerFirst(typeName)}Fields`;

// ─── Scalar-array workaround ─────────────────────────────────────────────────

/**
 * The field name used to hold a plain-scalar array's items once wrapped as
 * one-property objects (`"a"` -> `{ value: "a" }`). A `_types` sub-chart
 * produced for a scalar array always has exactly this one block field —
 * `unwrapScalarArrayItem`/callers can detect it by checking a sub-chart's
 * `_scalarArray` marker (see `chartFromExample`/`chartFromJsonSchema`)
 * rather than guessing from field names.
 */
export const SCALAR_ARRAY_VALUE_FIELD = 'value';

/**
 * Wraps one scalar-array item as the single-property object shape a
 * DecomposeChart's `_types` model requires (every `_types` item needs named
 * properties to map `origin` paths against — a raw string/number/boolean
 * has none). Used both by the generic placeholder generator (so generated
 * data already matches what a `_scalarArray` sub-chart expects) and by any
 * real conversion feeding actual arrays of scalars through the same chart.
 */
export const wrapScalarArrayItem = (item: Json): Json => ({
  [SCALAR_ARRAY_VALUE_FIELD]: item,
});

/** Reverses `wrapScalarArrayItem` — used when recomposing a `_scalarArray`
 * sub-chart back into a plain array of scalars for display/consumption. */
export const unwrapScalarArrayItem = (item: Record<string, unknown>): unknown =>
  item[SCALAR_ARRAY_VALUE_FIELD];

const scalarTypeOf = (value: unknown): JsonBasicValueType => {
  if (typeof value === 'number') return 'number';
  if (typeof value === 'boolean') return 'boolean';
  // Includes 'string', null/undefined (type can't be inferred from a single
  // example — 'string' is the documented fallback), and anything else.
  return 'string';
};

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);

// ─── Example-JSON-driven inference ───────────────────────────────────────────

/**
 * Flattens `example`'s own scalar and nested-object fields into `block`
 * (mutated in place), using `/`-joined origin paths for nesting — mirrors
 * how hand-authored charts like `customerChart` fold e.g. `data.turnover`
 * into a `data/turnover` origin. Array-valued fields are NOT handled here;
 * callers collect those into `_types` separately, since they need a whole
 * sub-chart, not a single block field.
 */
const collectScalarFields = (
  example: Record<string, unknown>,
  block: DecomposeChartComponentPropertyDef[],
  pathPrefix: string,
): void => {
  for (const [key, value] of Object.entries(example)) {
    if (Array.isArray(value)) continue; // handled by callers as `_types`
    const origin = pathPrefix ? `${pathPrefix}/${key}` : key;
    if (isPlainObject(value)) {
      collectScalarFields(value, block, origin);
    } else {
      block.push({ origin, destination: key, type: scalarTypeOf(value) });
    }
  }
};

/**
 * Builds the `_types` sub-chart for one array-valued field, from its first
 * item (only the first item's shape is inspected — later items are assumed
 * to be structurally identical, same as any single-example-based
 * inference). An empty array can't be inferred at all and produces an
 * empty, `string`-typed placeholder field, documented as a known gap.
 */
const buildArrayType = (fieldKey: string, items: unknown[]): DecomposeChart => {
  const name = capitalize(singularize(fieldKey));
  const firstItem = items[0];

  if (items.length === 0 || !isPlainObject(firstItem)) {
    // Scalar array (or empty array, treated the same way so the chart
    // shape is at least well-formed): wrap each item as { value } so the
    // `_types` model — which requires named properties per item — applies.
    const type = items.length === 0 ? 'string' : scalarTypeOf(firstItem);
    return {
      _sliceId: sliceIdField(name),
      _name: name,
      _path: fieldKey,
      _scalarArray: true,
      [blockKeyFor(name)]: [
        { origin: SCALAR_ARRAY_VALUE_FIELD, destination: SCALAR_ARRAY_VALUE_FIELD, type },
      ],
    };
  }

  const fields: DecomposeChartComponentPropertyDef[] = [];
  collectScalarFields(firstItem, fields, '');
  const nestedTypes = collectArrayTypes(firstItem);

  return {
    _sliceId: sliceIdField(name),
    _name: name,
    _path: fieldKey,
    [blockKeyFor(name)]: fields,
    ...(nestedTypes.length > 0 ? { _types: nestedTypes } : {}),
  };
};

const collectArrayTypes = (example: Record<string, unknown>): DecomposeChart[] => {
  const types: DecomposeChart[] = [];
  for (const [key, value] of Object.entries(example)) {
    if (Array.isArray(value)) types.push(buildArrayType(key, value));
  }
  return types;
};

/**
 * Derives a `DecomposeChart` from a single plain example JSON object —
 * no chart-authoring knowledge needed, just a representative record.
 * Every scalar/nested-object field lands in one block per nesting level
 * (blocks are purely organisational — one per level is structurally
 * sufficient; `fromJson()` only requires their names be unique across the
 * whole chart, which `blockKeyFor` guarantees); every array-of-objects
 * field becomes a `_types` sub-entity; every array-of-scalars field
 * becomes a `_types` sub-entity too, via the `value`-wrapping workaround
 * (see module doc).
 *
 * Type inference is necessarily approximate for fields that are `null` in
 * this particular example (falls back to `string`) — pass a JSON Schema
 * instead (`chartFromJsonSchema`/`chartFromJson`) when the fields' real
 * types must be exact regardless of what one example happens to contain.
 */
export const chartFromExample = (name: string, example: Json): DecomposeChart => {
  if (!isPlainObject(example)) {
    throw new Error('chartFromExample: example must be a plain JSON object.');
  }
  const general: DecomposeChartComponentPropertyDef[] = [];
  collectScalarFields(example, general, '');
  const types = collectArrayTypes(example);

  return {
    _sliceId: sliceIdField(name),
    _name: name,
    general,
    ...(types.length > 0 ? { _types: types } : {}),
  };
};

// ─── JSON-Schema-driven inference ────────────────────────────────────────────

/** Minimal subset of JSON Schema this module understands: `type`,
 * `properties`, `items`. Anything else (`oneOf`/`anyOf`/`$ref`/
 * `patternProperties`/...) is out of scope — such a property is skipped
 * rather than guessed at. */
interface JsonSchemaLike {
  type?: string;
  properties?: Record<string, JsonSchemaLike>;
  items?: JsonSchemaLike;
  title?: string;
}

const schemaScalarType = (schema: JsonSchemaLike): JsonBasicValueType => {
  if (schema.type === 'integer' || schema.type === 'number') return 'number';
  if (schema.type === 'boolean') return 'boolean';
  return 'string';
};

const isScalarSchemaType = (type: string | undefined): boolean =>
  type === 'string' || type === 'number' || type === 'integer' || type === 'boolean';

const collectSchemaFields = (
  properties: Record<string, JsonSchemaLike>,
  block: DecomposeChartComponentPropertyDef[],
  pathPrefix: string,
): void => {
  for (const [key, schema] of Object.entries(properties)) {
    if (schema.type === 'array') continue; // handled as `_types` by callers
    const origin = pathPrefix ? `${pathPrefix}/${key}` : key;
    if (schema.type === 'object' && schema.properties) {
      collectSchemaFields(schema.properties, block, origin);
    } else if (isScalarSchemaType(schema.type) || schema.type === undefined) {
      block.push({ origin, destination: key, type: schemaScalarType(schema) });
    }
    // Unsupported schema shapes (oneOf/anyOf/$ref/no type info at all
    // beyond this) are silently skipped — see module doc.
  }
};

const buildArrayTypeFromSchema = (
  fieldKey: string,
  itemSchema: JsonSchemaLike | undefined,
): DecomposeChart | undefined => {
  const name = capitalize(singularize(fieldKey));

  if (!itemSchema || isScalarSchemaType(itemSchema.type)) {
    const type = itemSchema ? schemaScalarType(itemSchema) : 'string';
    return {
      _sliceId: sliceIdField(name),
      _name: name,
      _path: fieldKey,
      _scalarArray: true,
      [blockKeyFor(name)]: [
        { origin: SCALAR_ARRAY_VALUE_FIELD, destination: SCALAR_ARRAY_VALUE_FIELD, type },
      ],
    };
  }

  if (itemSchema.type === 'object' && itemSchema.properties) {
    const fields: DecomposeChartComponentPropertyDef[] = [];
    collectSchemaFields(itemSchema.properties, fields, '');
    const nestedTypes = collectSchemaArrayTypes(itemSchema.properties);
    return {
      _sliceId: sliceIdField(name),
      _name: name,
      _path: fieldKey,
      [blockKeyFor(name)]: fields,
      ...(nestedTypes.length > 0 ? { _types: nestedTypes } : {}),
    };
  }

  // Array item schema with no usable shape (e.g. object with no declared
  // properties) — nothing to build a sub-chart from.
  return undefined;
};

const collectSchemaArrayTypes = (
  properties: Record<string, JsonSchemaLike>,
): DecomposeChart[] => {
  const types: DecomposeChart[] = [];
  for (const [key, schema] of Object.entries(properties)) {
    if (schema.type !== 'array') continue;
    const built = buildArrayTypeFromSchema(key, schema.items);
    if (built) types.push(built);
  }
  return types;
};

/**
 * Derives a `DecomposeChart` from a JSON Schema (root must be `type:
 * "object"` with `properties`). Prefer this over `chartFromExample` when a
 * schema is available: it declares every field's real type explicitly, so
 * there's no ambiguity from a field merely being `null`/absent in one
 * example record. Only a practical subset of JSON Schema is understood —
 * see `JsonSchemaLike`; anything beyond it (oneOf/anyOf/$ref/
 * patternProperties/...) is skipped rather than guessed at.
 */
export const chartFromJsonSchema = (name: string, schema: Json): DecomposeChart => {
  const s = schema as unknown as JsonSchemaLike;
  if (s.type !== 'object' || !s.properties) {
    throw new Error(
      'chartFromJsonSchema: root schema must have type "object" and a "properties" map.',
    );
  }
  const general: DecomposeChartComponentPropertyDef[] = [];
  collectSchemaFields(s.properties, general, '');
  const types = collectSchemaArrayTypes(s.properties);

  return {
    _sliceId: sliceIdField(s.title ?? name),
    _name: name,
    general,
    ...(types.length > 0 ? { _types: types } : {}),
  };
};

// ─── Unified entry point ──────────────────────────────────────────────────────

/** True for objects that look like a JSON Schema rather than a plain data
 * example — i.e. carry `$schema`, or a `properties` map paired with (or in
 * lieu of) a JSON-Schema-style `type`. A plain example record could itself
 * coincidentally have a field literally called "properties", but not one
 * shaped like a schema's (an object of `{type: ...}` descriptors), so this
 * heuristic is reliable in practice for the inputs this module expects
 * (either a hand-written example or a hand-written/exported schema, never
 * adversarial input). */
const looksLikeJsonSchema = (input: Json): boolean => {
  if (!isPlainObject(input)) return false;
  if ('$schema' in input) return true;
  const properties = (input as Record<string, unknown>).properties;
  return isPlainObject(properties);
};

/**
 * Derives a `DecomposeChart` from either a plain example JSON object or a
 * JSON Schema — whichever `input` looks like (see `looksLikeJsonSchema`).
 * This is the intended single entry point for chart-less entity-type
 * registration: drop a data shape, get a chart, feed it straight into
 * `createChartGenerator`/`genericRawDataFor`, unchanged.
 */
export const chartFromJson = (name: string, input: Json): DecomposeChart =>
  looksLikeJsonSchema(input)
    ? chartFromJsonSchema(name, input)
    : chartFromExample(name, input);
