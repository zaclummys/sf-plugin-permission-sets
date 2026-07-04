import { describe, it, expect } from 'vitest';
import { runPs } from '../helpers/run-plugin.js';

const valid = 'test/fixtures/valid.yml';
// A target org that resolves nowhere, so these commands fail identically on any
// machine without touching the network or a developer's default org.
const noOrg = 'no-such-org-alias-xyz';

describe('org-required commands (offline failure paths)', () => {
    it('ps plan fails cleanly when the org cannot be resolved', async () => {
        const { stderr, exitCode } = await runPs(['ps', 'plan', '-f', valid, '--target-org', noOrg]);

        expect(exitCode).not.toBe(0);
        expect(stderr).not.toBe('');
    });

    it('ps apply rejects an invalid --mode value', async () => {
        const { exitCode } = await runPs(['ps', 'apply', '-f', valid, '--target-org', noOrg, '--mode', 'bogus']);

        expect(exitCode).not.toBe(0);
    });

    it('ps apply rejects a negative --max-deletes', async () => {
        const { exitCode } = await runPs(['ps', 'apply', '-f', valid, '--target-org', noOrg, '--max-deletes=-1']);

        expect(exitCode).not.toBe(0);
    });
});

describe('--help exits 0 and lists the interface', () => {
    it('ps topic help lists the check command', async () => {
        const { stdout, exitCode } = await runPs(['ps', '--help']);

        expect(exitCode).toBe(0);
        expect(stdout).toContain('check');
    });

    it('ps check --help documents its flags', async () => {
        const { stdout, exitCode } = await runPs(['ps', 'check', '--help']);

        expect(exitCode).toBe(0);
        expect(stdout).toContain('--strict');
    });

    it('ps apply --help documents its flags', async () => {
        const { stdout, exitCode } = await runPs(['ps', 'apply', '--help']);

        expect(exitCode).toBe(0);
        expect(stdout).toContain('--mode');
    });
});
