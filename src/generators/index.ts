import { chartFileGenerators, exampleFileGenerators } from './chart-files.ts';
import { customersGenerator } from './customers.ts';
import { GenerateResult, GeneratorEntry } from './generator-entry.ts';

// ─── Registry ─────────────────────────────────────────────────────────────────

export type { GenerateResult, GeneratorEntry };

/**
 * Registry of all available data generators: code-based ones, plus every
 * chart dropped into charts/, plus every plain example/schema dropped into
 * examples/ (see chart-files.ts — neither directory needs any code at
 * all). Add a code-based entry here to make it available to the CLI — for
 * a chart-driven generator, `createChartGenerator()` (see
 * chart-generator.ts) builds a ready-to-register GeneratorEntry from just
 * a DecomposeChart and a raw-row function, with the route derived
 * automatically from the chart's `_name`.
 *
 * Either way, the Server must be told to host the new entry's route
 * (RLJSON_ROUTES, see the Server repo's .env.example) before `pnpm
 * generate` can reach it.
 */
export const generators: Record<string, GeneratorEntry> = {
  customers: customersGenerator,
  ...chartFileGenerators(),
  ...exampleFileGenerators(),
};
