import { describe, it, expect } from 'vitest';
import { writeFile, mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { runPs, parseJson, targetOrg } from '../helpers/run-plugin.js';

const valid = 'test/fixtures/valid.yml';
// A target org that resolves nowhere, so these fail identically on any machine
// without touching the network or a developer's default org.
const noOrg = 'no-such-org-alias-xyz';

// A fresh temp dir per test, so the concurrent cases never collide. The OS reclaims it.
async function tempDir() {
    return mkdtemp(path.join(tmpdir(), 'ps-apply-'));
}

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
        expect(stdout).toContain('--plan');
    });

    // Real-org saved-plan tests. Producing the plan via plan --out on an org's own export is an
    // empty diff, so applying it with --dry-run never mutates the org. The guard cases abort
    // before any DML, so they too leave the org untouched.
    it('applies a saved plan as a no-op round-trip (dry-run)', async ({ expect }) => {
        const dir = await tempDir();
        const snapshot = path.join(dir, 'snap.yml');
        const planFile = path.join(dir, 'test.plan');

        const exported = await runPs(['ps', 'export', '--target-org', targetOrg, '--output-file', snapshot]);
        expect(exported.exitCode).toBe(0);
        const planned = await runPs(['ps', 'plan', '--target-org', targetOrg, '-f', snapshot, '--out', planFile]);
        expect(planned.exitCode).toBe(0);

        const applied = await runPs([
            'ps',
            'apply',
            '--target-org',
            targetOrg,
            '--plan',
            planFile,
            '--dry-run',
            '--json',
        ]);
        expect(applied.exitCode).toBe(0);
        const result = parseJson(applied.stdout);
        expect(result.status).toBe('dry-run');
        expect(result.added + result.updated + result.removed).toBe(0);
    });

    it('rejects --file together with --plan', async ({ expect }) => {
        const { exitCode, stderr } = await runPs(['ps', 'apply', '--target-org', targetOrg, '--plan', 'x.plan', '-f', 'y.yml']);

        expect(exitCode).not.toBe(0);
        expect(stderr).toContain('either --file or --plan');
    });

    it('rejects --mode together with --plan', async ({ expect }) => {
        const { exitCode, stderr } = await runPs(['ps', 'apply', '--target-org', targetOrg, '--plan', 'x.plan', '--mode', 'sync']);

        expect(exitCode).not.toBe(0);
        expect(stderr).toContain('--mode cannot be combined');
    });

    it('requires a source (--file or --plan)', async ({ expect }) => {
        const { exitCode, stderr } = await runPs(['ps', 'apply', '--target-org', targetOrg]);

        expect(exitCode).not.toBe(0);
        expect(stderr).toContain('Provide a source');
    });

    it('refuses a plan built for a different org', async ({ expect }) => {
        const dir = await tempDir();
        const planFile = path.join(dir, 'wrong.plan');
        const planYaml = [
            'version: 1',
            'org: 00D000000000000EAA',
            'mode: additive',
            'generatedAt: 2026-01-01T00:00:00.000Z',
            'add: []',
            'update: []',
            'remove: []',
            '',
        ].join('\n');
        await writeFile(planFile, planYaml, 'utf8');

        const { exitCode, stderr } = await runPs(['ps', 'apply', '--target-org', targetOrg, '--plan', planFile, '--dry-run']);

        expect(exitCode).not.toBe(0);
        expect(stderr).toContain('built for org');
    });

    it('refuses an unreadable plan file', async ({ expect }) => {
        const { exitCode, stderr } = await runPs(['ps', 'apply', '--target-org', targetOrg, '--plan', 'does/not/exist.plan']);

        expect(exitCode).not.toBe(0);
        expect(stderr).toContain('Could not read the plan file');
    });
});
