import { defineConfig } from 'vitest/config';

export default defineConfig({
    test: {
        // Salesforce's TestContext calls global beforeEach/afterEach (mocha-style),
        // so expose the test globals.
        globals: true,
        include: ['src/**/*.test.ts'],
        // Tests are paused for now. Do not fail the run when there are none.
        passWithNoTests: true,
    },
});
