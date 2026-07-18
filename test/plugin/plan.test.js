import { describe, it, expect } from 'vitest';
import { parse } from 'yaml';
import { readFile, mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { runPs, targetOrg } from '../helpers/run-plugin.js';

const valid = 'test/fixtures/valid.yml';
// A target org that resolves nowhere, so this fails identically on any machine
// without touching the network or a developer's default org.
const noOrg = 'no-such-org-alias-xyz';

// A fresh temp dir per test, so the concurrent cases never collide. The OS reclaims it.
async function tempDir() {
    return mkdtemp(path.join(tmpdir(), 'ps-plan-'));
}

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
        expect(stdout).toContain('--out');
    });

    // Real-org test: exporting the org and planning that snapshot back against it is an empty
    // diff, so --out writes a valid no-op plan file. Read-only, it never changes the org.
    it('writes a saved plan file with --out', async ({ expect }) => {
        const dir = await tempDir();
        const snapshot = path.join(dir, 'snap.yml');
        const planFile = path.join(dir, 'test.plan');

        const exported = await runPs(['ps', 'export', '--target-org', targetOrg, '--output-file', snapshot]);
        expect(exported.exitCode).toBe(0);

        const planned = await runPs(['ps', 'plan', '--target-org', targetOrg, '-f', snapshot, '--out', planFile]);
        expect(planned.exitCode).toBe(0);

        const content = await readFile(planFile, 'utf8');
        const plan = parse(content);
        expect(plan.version).toBe(1);
        expect(typeof plan.org).toBe('string');
        expect(['additive', 'destructive', 'sync']).toContain(plan.mode);
        expect(Array.isArray(plan.add)).toBe(true);
    });
});
