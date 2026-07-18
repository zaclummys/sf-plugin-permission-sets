import { describe, it, expect } from 'vitest';
import { runPs, targetOrg } from '../helpers/run-plugin.js';

const valid = 'test/fixtures/valid.yml';
const schemaError = 'test/fixtures/schema-error.yml';
const malformed = 'test/fixtures/malformed.yml';
// A target org that resolves nowhere, so this fails identically on any machine
// without touching the network or a developer's default org.
const noOrg = 'no-such-org-alias-xyz';

describe('sf ps plan', () => {
    it('fails cleanly when the org cannot be resolved', async () => {
        const { stderr, exitCode } = await runPs(['ps', 'plan', '-f', valid, '--target-org', noOrg]);

        expect(exitCode).not.toBe(0);
        expect(stderr).not.toBe('');
    });

    it('--help documents its flags', async () => {
        const { stdout, exitCode } = await runPs(['ps', 'plan', '--help']);

        expect(exitCode).toBe(0);
        expect(stdout).toContain('--mode');
        expect(stdout).toContain('--file');
    });

    // Load errors abort before any org call, so the org just needs to resolve; nothing
    // is ever queried or changed.
    it('fails a schema violation with exit 1', async ({ expect }) => {
        const { stdout, exitCode } = await runPs(['ps', 'plan', '--target-org', targetOrg, '-f', schemaError]);

        expect(exitCode).toBe(1);
        expect(stdout).toContain('error:');
    });

    it('fails malformed YAML with exit 1', async ({ expect }) => {
        const { stdout, exitCode } = await runPs(['ps', 'plan', '--target-org', targetOrg, '-f', malformed]);

        expect(exitCode).toBe(1);
        expect(stdout).toContain('error:');
    });
});
