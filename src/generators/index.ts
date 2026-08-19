import { chartFileGenerators, exampleFileGenerators } from './chart-files.ts';
import { GenerateResult, GeneratorEntry } from './generator-entry.ts';

// ─── Registry ─────────────────────────────────────────────────────────────────

export type { GenerateResult, GeneratorEntry };

/**
 * Registry of all available data generators: every chart dropped into
 * charts/ (see charts/Customer.json — the "Customer" entity itself is
 * registered this way, zero code), plus every plain example/schema
 * dropped into examples/ (see chart-files.ts — neither directory needs
 * any code at all).
 *
 * A code-based entry (real domain data instead of mechanical
 * placeholders, via `createChartGenerator()` in chart-generator.ts — see
 * its own doc comment) can still be added here directly when realism
 * matters more than zero-code; there simply isn't one today.
 *
 * Either way, the Server must be told to host the new entry's route
 * (RLJSON_ROUTES, see the Server repo's .env.example) before `pnpm
 * generate` can reach it.
 */
export const generators: Record<string, GeneratorEntry> = {
  ...chartFileGenerators(),
  ...exampleFileGenerators(),
};
