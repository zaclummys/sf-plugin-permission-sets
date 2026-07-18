import { describe, it, expect } from 'vitest';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { runPs, parseJson, targetOrg } from '../helpers/run-plugin.js';

const valid = 'test/fixtures/valid.yml';
// A target org that resolves nowhere, so this fails identically on any machine
// without touching the network or a developer's default org.
const noOrg = 'no-such-org-alias-xyz';

// A uniquely-named file per test, so the concurrent cases never collide. The OS
// reclaims the temp dir, so there is nothing to clean up.
async function tempFile() {
    const dir = await mkdtemp(path.join(tmpdir(), 'ps-validate-'));

    return path.join(dir, 'export.yml');
}

describe('sf ps validate', () => {
    it('fails cleanly when the org cannot be resolved', async () => {
        const { stderr, exitCode } = await runPs(['ps', 'validate', '-f', valid, '--target-org', noOrg]);

        expect(exitCode).not.toBe(0);
        expect(stderr).not.toBe('');
    });

    it('--help documents its flags', async () => {
        const { stdout, exitCode } = await runPs(['ps', 'validate', '--help']);

        expect(exitCode).toBe(0);
        expect(stdout).toContain('--file');
        expect(stdout).toContain('--target-org');
    });
});

// Real-org tests: drive `sf ps validate` against the org named by PS_TARGET_ORG, which the
// caller always provides. validate is read-only (it only queries the org). Exporting the org
// and validating that snapshot back against the same org is the round-trip: every reference
// resolves because it came from the org, so the resolution path reports no problems.
describe('sf ps validate', () => {
    it('validates an org snapshot back against the same org with no findings', async ({ expect }) => {
        const file = await tempFile();
        const exported = await runPs(['ps', 'export', '--target-org', targetOrg, '--output-file', file]);

        expect(exported.exitCode).toBe(0);

        const { stdout, exitCode } = await runPs(['ps', 'validate', '-f', file, '--target-org', targetOrg]);

        expect(exitCode).toBe(0);
        expect(stdout).toContain('0 errors, 0 warnings.');
    });

    it('returns a valid --json envelope with resolved counts', async ({ expect }) => {
        const file = await tempFile();
        const exported = await runPs(['ps', 'export', '--target-org', targetOrg, '--output-file', file]);

        expect(exported.exitCode).toBe(0);

        const { stdout, exitCode } = await runPs([
            'ps',
            'validate',
            '-f',
            file,
            '--target-org',
            targetOrg,
            '--json',
        ]);

        expect(exitCode).toBe(0);
        const result = parseJson(stdout);
        expect(Number.isInteger(result.files)).toBe(true);
        expect(Number.isInteger(result.users)).toBe(true);
        expect(Number.isInteger(result.assignments)).toBe(true);
        expect(Array.isArray(result.findings)).toBe(true);
        expect(result.findings).toHaveLength(0);
    });

    // With the org resolvable, the missing-file failure is the command's own, not the org
    // resolver's (which runs first during flag parsing and would otherwise mask it).
    it('rejects a missing required --file flag', async ({ expect }) => {
        const { stderr, exitCode } = await runPs(['ps', 'validate', '--target-org', targetOrg]);

        expect(exitCode).not.toBe(0);
        expect(stderr.toLowerCase()).toContain('file');
    });
});
