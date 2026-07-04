import { describe, it } from 'vitest';
import { parse } from 'yaml';
import { readFile, mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { runPs, parseJson, targetOrg } from '../helpers/run-plugin.js';

// A uniquely-named file under the OS temp dir per test, so the concurrent cases never write
// over each other. The OS reclaims the temp dir, so there is nothing to clean up.
async function tempOutputFile() {
    const dir = await mkdtemp(path.join(tmpdir(), 'ps-export-'));

    return path.join(dir, 'export.yml');
}

// Real-org test: drives `sf ps export` against the org named by PS_TARGET_ORG, which the
// caller always provides (a local logged-in org, or one a CI step authenticates). export is
// read-only (it only queries the org), so this never changes org state. Tests run
// concurrently (see vitest.config.js), so each uses its own temp file and context `expect`.
describe('sf ps export [online]', () => {
    it('exports org assignments and returns a valid --json envelope', async ({ expect }) => {
        const file = await tempOutputFile();
        const { stdout, exitCode } = await runPs([
            'ps',
            'export',
            '--target-org',
            targetOrg,
            '--output-file',
            file,
            '--json',
        ]);

        expect(exitCode).toBe(0);
        const result = parseJson(stdout);
        expect(result.outputFile).toBe(file);
        expect(Number.isInteger(result.users)).toBe(true);
        expect(Number.isInteger(result.assignments)).toBe(true);
        // Every exported user holds at least one assignment, so assignments never trails users.
        expect(result.assignments).toBeGreaterThanOrEqual(result.users);
    });

    it('writes a user-keyed file that ps check accepts (round-trip)', async ({ expect }) => {
        const file = await tempOutputFile();
        const exported = await runPs(['ps', 'export', '--target-org', targetOrg, '--output-file', file]);

        expect(exported.exitCode).toBe(0);
        expect(exported.stdout).toContain('Exported');

        const content = await readFile(file, 'utf8');
        const document = parse(content);
        expect(document).toHaveProperty('users');

        // The whole point of export is that its output is valid input to the plugin.
        // Re-checking it offline proves the round-trip without asserting on org data.
        const checked = await runPs(['ps', 'check', '-f', file]);
        expect(checked.exitCode).toBe(0);
        expect(checked.stdout).toContain('0 errors');
    });
});
