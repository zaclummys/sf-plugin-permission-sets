import { describe, it, expect } from 'vitest';
import { runPs } from '../helpers/run-plugin.js';

const valid = 'test/fixtures/valid.yml';
// A target org that resolves nowhere, so these fail identically on any machine
// without touching the network or a developer's default org.
const noOrg = 'no-such-org-alias-xyz';

describe('sf ps apply', () => {
    it('rejects an invalid --mode value', async () => {
        const { exitCode } = await runPs(['ps', 'apply', '-f', valid, '--target-org', noOrg, '--mode', 'bogus']);

        expect(exitCode).not.toBe(0);
    });

    it('rejects a negative --max-deletes', async () => {
        const { exitCode } = await runPs(['ps', 'apply', '-f', valid, '--target-org', noOrg, '--max-deletes=-1']);

        expect(exitCode).not.toBe(0);
    });

    it('--help documents its flags', async () => {
        const { stdout, exitCode } = await runPs(['ps', 'apply', '--help']);

        expect(exitCode).toBe(0);
        expect(stdout).toContain('--mode');
    });
});
