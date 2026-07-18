import { describe, it } from 'vitest';
import { parse } from 'yaml';
import { readFile, writeFile, mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { runPs, parseJson, targetOrg } from '../helpers/run-plugin.js';

// A fresh temp dir per test, so the concurrent cases never collide. The OS reclaims it.
async function tempDir() {
    return mkdtemp(path.join(tmpdir(), 'ps-plan-'));
}

// Real-org tests: they drive `sf ps` against PS_TARGET_ORG. The round-trip stays read-only
// by planning an org's own export against it (an empty diff) and applying with --dry-run, so
// the org is never mutated. The guard cases abort before any DML.
describe('sf ps plan --out / apply --plan [online]', () => {
    it('writes a saved plan file that apply can run as a no-op round-trip', async ({ expect }) => {
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

        // The snapshot already matches the org, so applying the plan changes nothing.
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
        const { exitCode, stderr } = await runPs([
            'ps',
            'apply',
            '--target-org',
            targetOrg,
            '--plan',
            'x.plan',
            '-f',
            'y.yml',
        ]);

        expect(exitCode).not.toBe(0);
        expect(stderr).toContain('either --file or --plan');
    });

    it('rejects --mode together with --plan', async ({ expect }) => {
        const { exitCode, stderr } = await runPs([
            'ps',
            'apply',
            '--target-org',
            targetOrg,
            '--plan',
            'x.plan',
            '--mode',
            'sync',
        ]);

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

        const { exitCode, stderr } = await runPs([
            'ps',
            'apply',
            '--target-org',
            targetOrg,
            '--plan',
            planFile,
            '--dry-run',
        ]);

        expect(exitCode).not.toBe(0);
        expect(stderr).toContain('built for org');
    });

    it('refuses an unreadable plan file', async ({ expect }) => {
        const { exitCode, stderr } = await runPs([
            'ps',
            'apply',
            '--target-org',
            targetOrg,
            '--plan',
            'does/not/exist.plan',
        ]);

        expect(exitCode).not.toBe(0);
        expect(stderr).toContain('Could not read the plan file');
    });
});
