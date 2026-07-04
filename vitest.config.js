import { defineConfig } from 'vitest/config';

export default defineConfig({
    test: {
        // Black-box plugin tests: each spec spawns `sf ps ...` as a subprocess, so
        // give them room beyond the default 5s timeout. globalSetup links the built
        // plugin into sf so those commands resolve.
        include: ['test/**/*.test.js'],
        testTimeout: 30_000,
        globalSetup: ['./test/global-setup.js'],
    },
});
