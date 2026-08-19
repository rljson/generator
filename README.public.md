<!--
@license
Copyright (c) 2025 Rljson

Use of this source code is governed by terms that can be
found in the LICENSE file in the root of this package.
-->

# @rljson/generator

> New to this workspace? Start at the top-level [README.md](../README.md)
> for the full one-time setup + walkthrough. This document covers the
> Generator's own details.

Headless RLJSON data generator. Connects to a running **`@rljson/server`**
instance as a `Client`, generates test data, and syncs it over the official
sync protocol — no UI, no direct database access, no console output on
success.

## How it fits together

```
Generator (this repo)  --Socket.IO-->  Server  --IoMulti hot-swap-->  MSSQL
      Client                                        (persistent)
```

- The Generator never talks to the database directly during normal use. It
  writes to its own throwaway in-memory store, then sends a single
  reference (`sendWithAck`) to the Server over the sync route.
- The Server pulls the referenced data through the official `Db`/`Controller`
  read APIs, which persists it into its own MSSQL database as a side effect
  ("hot-swap" write-back). See the Server repo for details.
- `pnpm setup-server-tables` is the **only** part of this repo that talks to
  MSSQL directly — a one-time schema bootstrap, not part of the regular
  generate flow.

## Prerequisites

- A running `@rljson/server` instance (see the Server repo's own README/
  runbook) reachable at `SERVER_URL`.
- The Server's database schema provisioned once (see
  [One-time setup](#one-time-setup-per-environment) below).

## Installation

```bash
npm install
```
(`pnpm install` also works if pnpm is set up on your machine.)

## Configuration

Copy `.env.example` to `.env` and adjust:

| Variable | Purpose |
|---|---|
| `SERVER_URL` | URL of the running Server (default `http://localhost:3000`) |
| `MSSQL_*` | Only used by `setup-server-tables` — **must** point at the same database/schema as the Server's own `.env` |

Routes are **not** configured via `.env` — each generator declares its own
route (see [Adding a new generator](#adding-a-new-generator) below). The
Server must be told to host every one of them via `RLJSON_ROUTES` (see the
Server repo's `.env.example`).

## One-time setup (per environment)

Before the Server can accept any data, its database needs the table schema
and a couple of admin stored procedures. Run this **once** per fresh
database (safe to rerun — fully idempotent):

```bash
npm run setup-server-tables
```

Expected output: `Tables created/verified in the Server database.`

Rerun this after any database reset, before generating data again.

## Generating data

With the Server already running:

```bash
npm run generate -- --count 5
```

- `--count` (or `--count=5`) sets how many records **each registered
  generator** produces (each independently, over its own connection).
  Omit it entirely to use the default (30).
- **Success** = exit code `0`, no output at all.
- **Failure** = an error message on stderr and exit code `1`.

Each run starts from a different index (derived from the current time), so
every run generates genuinely new identities — different names/IDs — rather
than resubmitting the same fixed set of records, which RLJSON's
content-addressed storage would otherwise silently deduplicate. `--count 5`
means "5 new records this run", not "always the same 5 records".

### Verifying the data landed

Quickest check is a direct SQL query against the Server's database, e.g.:

```sql
SELECT * FROM PantrySchema.customerGeneral_tbl;
SELECT * FROM PantrySchema.customerCake_tbl;
```

## Troubleshooting

| Symptom | Likely cause |
|---|---|
| `ACK timeout for ref ... after 60000ms` | Check the **Server's** console at that moment — the `onRefArrived` hook logs the real error there (e.g. `Invalid object name '...'` means a table is missing — rerun `setup-server-tables`). |
| No new rows despite a successful run | Did you skip `setup-server-tables` after a DB reset? Or check whether the specific table you're looking at is expected to change for this generator (e.g. shared reference data intentionally dedupes). |
| `'pnpm' is not recognized` | Use `npm run <script>` instead — every script here is a plain command with no pnpm-specific behavior. |

## Adding a new generator

Generators are registered in [`src/generators/index.ts`](src/generators/index.ts).
Every generator declares its own `route: Route` — a Client/Server pair is
inherently single-route (see `@rljson/server`'s `Client`/`Server`
constructors), so this is what lets several, fully independent entity
types coexist: `generate.ts` opens one Client connection per distinct
route among the registered generators, and each connection only carries
that route's own generators.

### Adding more of an existing entity type

Same root Cake, same route: add a new `GeneratorEntry` reusing that same
`route` value. All entries sharing a route run through the same Client
connection.

### Adding a genuinely new, independent entity type — zero code

The simplest way to add a new entity type needs **no code file at all**:
drop a `DecomposeChart` as a plain JSON file into `charts/` (at the repo
root). [`src/generators/chart-files.ts`](src/generators/chart-files.ts)
auto-discovers every `charts/*.json` file at startup and registers it —
route derivation, table creation, and even the raw sample data are all
generated purely from the chart itself
([`src/generators/generic-raw-data.ts`](src/generators/generic-raw-data.ts)
builds a value per field from nothing but its declared `type`:
`string` → `"fieldName-3"`, `number` → the index, `boolean` → alternating).

1. **Write `charts/<Name>.json`** — a `DecomposeChart` (`_name` required,
   used for both the route — `` `${_name.toLowerCase()}Cake` `` — and the
   registry key). Add a `_types` array for sub-entities, exactly like a
   code-based chart; one placeholder child gets generated per parent
   automatically.
2. Steps 5–8 below (Server route, restart, provision, generate) — nothing
   else in this repo needs to change.

This trades realism for zero code: generated values are mechanical
placeholders, not domain-meaningful data. For that, use the code-based
path below.

### Adding a genuinely new, independent entity type — from an example or schema

Even less ceremony than hand-authoring a `DecomposeChart`: drop a **plain
example record** (or a JSON Schema) into `examples/` (at the repo root,
alongside `charts/`) —
[`src/generators/chart-from-json.ts`](src/generators/chart-from-json.ts)'s
`chartFromJson()` derives the `DecomposeChart` automatically from the
data's own shape, then feeds it into the exact same
`createChartGenerator()`/`genericRawDataFor()` pipeline as a hand-authored
chart — no other code path, no special-casing downstream.

1. **Write `examples/<Name>.json`** — either:
   - a representative example record, e.g. `{ "name": "Widget", "price": 9.99, "tags": ["sale", "new"] }`, or
   - a JSON Schema (`{ "type": "object", "properties": {...} }`) — preferred
     when available, since it declares every field's real type explicitly
     (an example's field types are inferred from whichever value happens to
     be there, so a `null` in one example falls back to `string`).

   The file's basename becomes the entity's `_name` (`examples/Product.json`
   → `_name: "Product"`). Both input flavors are auto-detected — nothing to
   configure.

   Field mapping is mechanical: scalar fields (at any nesting depth) become
   chart fields; arrays of objects become `_types` sub-entities (recursively,
   so nested arrays inside array items work too); arrays of plain scalars
   (`tags: ["a", "b"]`) — which `@rljson/converter`'s `_types` model can't
   address directly, since every array item needs named properties to map
   `origin` paths against — become a `_types` sub-entity too, via a small,
   transparent wrapping trick (each item becomes `{ value: <item> }`
   internally; `chartFromJson`'s module doc explains why and how).

   Only a practical subset is understood: `oneOf`/`anyOf`/`$ref`/
   `patternProperties` (JSON Schema) are skipped rather than guessed at, and
   an empty example array can't have its item type inferred at all (falls
   back to `string`). For anything beyond this subset, hand-author the
   chart instead (previous section).
2. Steps 5–8 below (Server route, restart, provision, generate) — nothing
   else in this repo needs to change.

### Adding a genuinely new, independent entity type — with custom data

[`src/generators/chart-generator.ts`](src/generators/chart-generator.ts)'s
`createChartGenerator()` builds the whole `GeneratorEntry` — route
derivation, run-uniqueness, and `GenerateResult`/stats wrapping — from just
a `DecomposeChart` and a raw-row function (this is also what
`chart-files.ts` uses under the hood), so adding one only ever means
supplying the two things that actually differ per entity type, then
wiring it through the same fixed checklist every time:

1. **Write the chart.** In a new `src/generators/<name>.ts`, define a
   `DecomposeChart`. `_name` is required — the route (and root Cake table)
   is derived from it as `` `${_name.toLowerCase()}Cake` ``, the exact
   convention `@rljson/converter` itself uses. If the entity has
   sub-entities (like a customer's addresses), add a `_types` block — see
   [`customers.ts`](src/generators/customers.ts) for a full worked
   example.
2. **Write `generateRaw(count, startIndex)`.** Returns `count` raw rows
   matching the chart's `origin` paths, including a value for the chart's
   `_sliceId` field (and, for every `_types` entry, its own `_sliceId`
   too — see how `customers.ts` derives `addressId` from `customerId`).
   Must be deterministic for a given `(count, startIndex)` pair;
   `createChartGenerator()` already supplies a fresh, time-based
   `startIndex` per run, so this function only needs to make the content
   *vary* with the index it's given, not invent its own uniqueness.
3. **Wrap it.** `export const xGenerator = createChartGenerator({ label, chart, generateRaw })`.
4. **Register it** in the `generators` map in `src/generators/index.ts`.
5. **Tell the Server about the new route.** Add it to `RLJSON_ROUTES` in
   the **Server repo's** `.env` (comma-separated, e.g.
   `customerCake,productCake`) — the Server hosts one `Server` instance +
   Socket.IO namespace per route, so a route it doesn't know about is
   unreachable.
6. **Restart the Server.** Routes are read from the environment once, at
   startup (`main()` in `server-bootstrap.ts`) — a running Server process
   will not pick up a route added to `RLJSON_ROUTES` while it was already
   running.
7. **Provision the new tables**: `npm run setup-server-tables`.
   [`src/table-cfgs.ts`](src/table-cfgs.ts) aggregates every registered
   generator's `TableCfg`s automatically, so the new entity's tables are
   created without touching that file.
8. **Generate and verify.** `npm run generate` now syncs the new entity
   type too, over its own connection. Check the Server's console for a
   `[TRAFFIC] ⬅ [Server.Multicast] /<name>Cake {...}` line, or query
   `<name>General_tbl` directly (see
   [Verifying the data landed](#verifying-the-data-landed)).

(A generator that doesn't fit the chart-driven shape at all can still
implement `GeneratorEntry` directly instead of using
`createChartGenerator()`.)

### Viewing new entity types in generator-ui

The [generator-ui](../generator-ui) example viewer is generic across every
entity type — see its own README. In short:
- A **file-based** chart (`charts/*.json`) or an **example/schema**
  (`examples/*.json`) needs no change in generator-ui either; both are
  picked up automatically (`import.meta.glob` there mirrors this repo's
  own `charts/`/`examples/` discovery, just browser-safe — including
  running `examples/*.json` content through the very same
  `chartFromJson()`).
- A **code-based** chart (like `customers.ts`) needs one line added to
  generator-ui's `src/entity-types.ts` — the chart itself is imported
  directly from this repo, the same cross-repo pattern this repo already
  uses for RLJSON's example data.

Either way, remember: generator-ui only shows what the **Server** hosts
(`RLJSON_ROUTES`) and what actually has data — steps 5–8 above still apply.

## Scripts reference

| Command | Purpose |
|---|---|
| `npm run setup-server-tables` | One-time: create tables + install admin stored procedures |
| `npm run generate -- --count N` | Generate and sync `N` records to the Server |
