import { describe, it } from 'vitest';
import path from 'node:path';
import { runPs, parseJson, targetOrg } from '../helpers/run-plugin.js';
import { tempDir } from '../helpers/temp-dir.js';

const valid = 'test/fixtures/valid.yml';
const schemaError = 'test/fixtures/schema-error.yml';
const malformed = 'test/fixtures/malformed.yml';
// A target org that resolves nowhere, so this fails identically on any machine
// without touching the network or a developer's default org.
const noOrg = 'no-such-org-alias-xyz';

/** Snapshot the org into a temp file, the input every resolution case validates back. */
async function writeOrgSnapshot(expect) {
    const dir = await tempDir('ps-validate-');
    const snapshot = path.join(dir, 'snap.yml');
    const exported = await runPs(['ps', 'export', '--target-org', targetOrg, '--output-file', snapshot]);

    expect(exported.exitCode).toBe(0);

    return snapshot;
}

describe('sf ps validate', () => {
    it('fails cleanly when the org cannot be resolved', async ({ expect }) => {
        const { stderr, exitCode } = await runPs(['ps', 'validate', '-f', valid, '--target-org', noOrg]);

        expect(exitCode).toBe(2);
        expect(stderr).toContain('No authorization information found');
    });

    it('--help documents its flags', async ({ expect }) => {
        const { stdout, exitCode } = await runPs(['ps', 'validate', '--help']);

        expect(exitCode).toBe(0);
        expect(stdout).toContain('--file');
        expect(stdout).toContain('--target-org');
    });

    // The tests below drive `sf ps validate` against the org named by PS_TARGET_ORG, which the
    // caller always provides. validate is read-only (it only queries the org). Exporting the org
    // and validating that snapshot back against the same org is the round-trip: every reference
    // resolves because it came from the org, so the resolution path reports no problems.
    it('validates an org snapshot back against the same org with no findings', async ({ expect }) => {
        const snapshot = await writeOrgSnapshot(expect);

        const { stdout, exitCode } = await runPs(['ps', 'validate', '-f', snapshot, '--target-org', targetOrg]);

        expect(exitCode).toBe(0);
        expect(stdout).toContain('0 errors, 0 warnings.');
    });

    it('returns a valid --json envelope with resolved counts', async ({ expect }) => {
        const snapshot = await writeOrgSnapshot(expect);

        const { stdout, exitCode } = await runPs([
            'ps',
            'validate',
            '-f',
            snapshot,
            '--target-org',
            targetOrg,
            '--json',
        ]);

        expect(exitCode).toBe(0);
        const result = parseJson(stdout);
        expect(Number.isInteger(result.files)).toBe(true);
        expect(Number.isInteger(result.users)).toBe(true);
        expect(Number.isInteger(result.assignments)).toBe(true);
        expect(result.findings).toHaveLength(0);
    });

    it('reports an unknown user as an unresolved reference', async ({ expect }) => {
        const { stdout, stderr, exitCode } = await runPs([
            'ps',
            'validate',
            '-f',
            valid,
            '--target-org',
            targetOrg,
        ]);

        expect(exitCode).toBe(1);
        expect(stdout).toContain('alice@example.com');
        expect(stderr).toContain('found problems');
    });

    // With the org resolvable, the missing-file failure is the command's own, not the org
    // resolver's (which runs first during flag parsing and would otherwise mask it).
    it('rejects a missing required --file flag', async ({ expect }) => {
        const { stderr, exitCode } = await runPs(['ps', 'validate', '--target-org', targetOrg]);

        expect(exitCode).toBe(2);
        expect(stderr).toContain('Missing required flag file');
    });

    it('fails a schema violation with exit 1', async ({ expect }) => {
        const { stdout, stderr, exitCode } = await runPs([
            'ps',
            'validate',
            '--target-org',
            targetOrg,
            '-f',
            schemaError,
        ]);

        expect(exitCode).toBe(1);
        expect(stdout).toContain('error:');
        expect(stderr).toContain('found problems');
    });

    it('fails malformed YAML with exit 1', async ({ expect }) => {
        const { stdout, exitCode } = await runPs(['ps', 'validate', '--target-org', targetOrg, '-f', malformed]);

        expect(exitCode).toBe(1);
        expect(stdout).toContain('error:');
    });
});
