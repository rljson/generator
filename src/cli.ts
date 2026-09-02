// @license
// Copyright (c) 2025 Rljson
//
// Use of this source code is governed by terms that can be
// found in the LICENSE file in the root of this package.

// Thin CLI shim (`pnpm generate` / `tsx src/cli.ts`). All testable logic
// lives in generate.ts; this file only wires env loading + execution.

import { run } from './generate.ts';

try {
  process.loadEnvFile();
} catch {
  // No .env file present — fall back to already-exported environment variables.
}

run().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exitCode = 1;
});
