import { availableParallelism } from 'node:os';
import { defineConfig } from 'vitest/config';

// How many `sf` subprocesses may be in flight at once. Measured on an 8-core machine:
// one process per core is the plateau (8 in flight ran the suite in 53s, 4 in 62s, 12
// bought nothing, and 20 was 2.4x slower and timed 11 specs out). Only the product of
// maxWorkers and maxConcurrency matters, not how it splits (2x4 and 4x2 tied), so the
// file workers stay pinned and the per-file concurrency scales with the machine.
const maxWorkers = 2;
const inFlight = Math.max(4, availableParallelism());
const maxConcurrency = Math.ceil(inFlight / maxWorkers);

export default defineConfig({
    test: {
        // Black-box plugin tests: each spec spawns `sf ps ...` as a subprocess, so
        // give them room beyond the default 5s timeout. globalSetup links the built
        // plugin into sf so those commands resolve.
        include: ['test/**/*.test.js'],
        testTimeout: 60_000,
        globalSetup: ['./test/global-setup.js'],
        // Run every test concurrently, not just files in parallel. Each test is an
        // independent `sf` subprocess (the real-org ones write their own temp files), so there is
        // no shared state to serialize. But every test spawns a heavy `sf` process, so the
        // total is bounded (maxWorkers parallel files x maxConcurrency per file) to keep the
        // machine from thrashing and tripping the 60s testTimeout.
        sequence: { concurrent: true },
        maxWorkers,
        maxConcurrency,
    },
});
