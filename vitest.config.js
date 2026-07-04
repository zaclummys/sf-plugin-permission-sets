import { defineConfig } from 'vitest/config';

export default defineConfig({
    test: {
        // Black-box plugin tests: each spec spawns `sf ps ...` as a subprocess, so
        // give them room beyond the default 5s timeout. globalSetup links the built
        // plugin into sf so those commands resolve.
        include: ['test/**/*.test.js'],
        testTimeout: 30_000,
        globalSetup: ['./test/global-setup.js'],
        // Run every test concurrently, not just files in parallel. Each test is an
        // independent `sf` subprocess (the online one writes its own temp file), so there is
        // no shared state to serialize. But every test spawns a heavy `sf` process, so the
        // total is bounded (maxWorkers parallel files x maxConcurrency per file) to keep the
        // machine from thrashing and tripping the 30s timeout.
        sequence: { concurrent: true },
        maxWorkers: 2,
        maxConcurrency: 4,
    },
});
