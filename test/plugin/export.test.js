import { describe, it, expect } from 'vitest';
import { parse } from 'yaml';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { runPs, parseJson, projectRoot, targetOrg } from '../helpers/run-plugin.js';

// Real-org test: drives `sf ps export` against the org named by PS_TARGET_ORG, which the
// caller always provides (a local logged-in org, or one a CI step authenticates). export is
// read-only (it only queries the org), so this never changes org state. Written under tmp/ (a
// relative path resolved from projectRoot, which is sf's cwd) so `npm run clean` removes it.
const outputFile = 'tmp/e2e-export.yml';

describe('sf ps export [online]', () => {
    it('exports org assignments and returns a valid --json envelope', async () => {
        const { stdout, exitCode } = await runPs([
            'ps',
            'export',
            '--target-org',
            targetOrg,
            '--output-file',
            outputFile,
            '--json',
        ]);

        expect(exitCode).toBe(0);
        const result = parseJson(stdout);
        expect(result.outputFile).toBe(outputFile);
        expect(Number.isInteger(result.users)).toBe(true);
        expect(Number.isInteger(result.assignments)).toBe(true);
        // Every exported user holds at least one assignment, so assignments never trails users.
        expect(result.assignments).toBeGreaterThanOrEqual(result.users);
    });

    it('writes a user-keyed file that ps check accepts (round-trip)', async () => {
        const exported = await runPs([
            'ps',
            'export',
            '--target-org',
            targetOrg,
            '--output-file',
            outputFile,
        ]);

        expect(exported.exitCode).toBe(0);
        expect(exported.stdout).toContain('Exported');

        const content = await readFile(path.join(projectRoot, outputFile), 'utf8');
        const document = parse(content);
        expect(document).toHaveProperty('users');

        // The whole point of export is that its output is valid input to the plugin.
        // Re-checking it offline proves the round-trip without asserting on org data.
        const checked = await runPs(['ps', 'check', '-f', outputFile]);
        expect(checked.exitCode).toBe(0);
        expect(checked.stdout).toContain('0 errors');
    });
});
