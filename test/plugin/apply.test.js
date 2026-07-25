import { describe, it } from 'vitest';
import path from 'node:path';
import { runPs, parseJson, targetOrg } from '../helpers/run-plugin.js';
import { tempDir } from '../helpers/temp-dir.js';
import { validPath, schemaErrorPath, malformedPath, undeclaredPath, noOrg } from '../fixtures/index.js';

describe('sf ps apply', () => {
    it('rejects an invalid --mode value', async ({ expect }) => {
        const { stderr, exitCode } = await runPs(['ps', 'apply', '-f', validPath, '--target-org', noOrg, '--mode', 'bogus']);

        expect(exitCode).toBe(1);
        expect(stderr).toContain('additive, destructive, sync');
    });

    it('rejects a negative --max-deletes', async ({ expect }) => {
        const { stderr, exitCode } = await runPs([
            'ps',
            'apply',
            '-f',
            validPath,
            '--target-org',
            noOrg,
            '--max-deletes=-1',
        ]);

        expect(exitCode).toBe(2);
        expect(stderr).toContain('greater than or equal to 0');
    });

    // With the org resolvable, the missing-file failure is the command's own, not the org
    // resolver's (which runs first during flag parsing and would otherwise mask it).
    it('requires --file', async ({ expect }) => {
        const { stderr, exitCode } = await runPs(['ps', 'apply', '--target-org', targetOrg]);

        expect(exitCode).toBe(2);
        expect(stderr).toContain('Missing required flag file');
    });

    it('--help documents its flags', async ({ expect }) => {
        const { stdout, exitCode } = await runPs(['ps', 'apply', '--help']);

        expect(exitCode).toBe(0);
        expect(stdout).toContain('--mode');
        expect(stdout).toContain('--file');
        expect(stdout).toContain('--max-deletes');
        expect(stdout).toContain('--no-prompt');
    });

    // Real-org round-trips. Applying an org's own export is an empty diff, so --dry-run and a
    // real apply both leave the org untouched.
    it('applies an org export as a no-op round-trip (dry-run)', async ({ expect }) => {
        const dir = await tempDir('ps-apply-');
        const snapshot = path.join(dir, 'snap.yml');

        const exported = await runPs(['ps', 'export', '--target-org', targetOrg, '--output-file', snapshot]);
        expect(exported.exitCode).toBe(0);

        const applied = await runPs([
            'ps',
            'apply',
            '--target-org',
            targetOrg,
            '-f',
            snapshot,
            '--mode',
            'sync',
            '--dry-run',
            '--json',
        ]);
        expect(applied.exitCode).toBe(0);
        const result = parseJson(applied.stdout);
        expect(result.status).toBe('dry-run');
        expect(result.added + result.updated + result.removed).toBe(0);
    });

    it('applies an org export as a no-op round-trip (real apply, no --dry-run)', async ({ expect }) => {
        const dir = await tempDir('ps-apply-');
        const snapshot = path.join(dir, 'snap.yml');

        const exported = await runPs(['ps', 'export', '--target-org', targetOrg, '--output-file', snapshot]);
        expect(exported.exitCode).toBe(0);

        const applied = await runPs([
            'ps',
            'apply',
            '--target-org',
            targetOrg,
            '-f',
            snapshot,
            '--mode',
            'sync',
            '--json',
        ]);
        expect(applied.exitCode).toBe(0);
        const result = parseJson(applied.stdout);
        expect(result.status).toBe('applied');
        expect(result.added + result.updated + result.removed).toBe(0);
        expect(result.failures).toBe(0);
    });

    // The destructive guards. Both return before the service calls the org client's write
    // methods, so a tripped guard drives a real org without ever changing it.
    it('refuses a destructive run that would remove more than --max-deletes', async ({ expect }) => {
        const { stderr, exitCode } = await runPs([
            'ps',
            'apply',
            '--target-org',
            targetOrg,
            '-f',
            undeclaredPath,
            '--mode',
            'destructive',
            '--max-deletes',
            '0',
        ]);

        expect(exitCode).toBe(1);
        expect(stderr).toContain('Refusing to remove 1 assignment(s): over the --max-deletes limit of 0.');
    });

    it('leaves the org unchanged when the --max-deletes guard trips', async ({ expect }) => {
        const before = await runPs(['ps', 'export', '--target-org', targetOrg]);
        expect(before.exitCode).toBe(0);

        const guarded = await runPs([
            'ps',
            'apply',
            '--target-org',
            targetOrg,
            '-f',
            undeclaredPath,
            '--mode',
            'destructive',
            '--max-deletes',
            '0',
        ]);
        // Assert the guard is what stopped the run, so a file that failed to load earlier
        // cannot make this pass for the wrong reason.
        expect(guarded.stderr).toContain('over the --max-deletes limit of 0');

        const after = await runPs(['ps', 'export', '--target-org', targetOrg]);
        expect(after.stdout).toBe(before.stdout);
    });

    it('refuses to delete in a --json run without --no-prompt', async ({ expect }) => {
        const { stdout, exitCode } = await runPs([
            'ps',
            'apply',
            '--target-org',
            targetOrg,
            '-f',
            undeclaredPath,
            '--mode',
            'destructive',
            '--json',
        ]);

        expect(exitCode).toBe(1);
        const error = JSON.parse(stdout);
        expect(error.name).toBe('PromptInJsonError');
    });

    // Answering "no" needs an interactive TTY, which a spawned `sf` in this suite never gets.
    // Left visible rather than silently uncovered.
    it.todo('reports a declined confirmation without changing the org');

    // Load errors abort before any org call or DML, so the org just needs to resolve.
    it('fails a schema violation with exit 1', async ({ expect }) => {
        const { stdout, stderr, exitCode } = await runPs([
            'ps',
            'apply',
            '--target-org',
            targetOrg,
            '-f',
            schemaErrorPath,
            '--dry-run',
        ]);

        expect(exitCode).toBe(1);
        expect(stdout).toContain('error:');
        expect(stderr).toContain('do not resolve cleanly against the org');
    });

    it('fails malformed YAML with exit 1', async ({ expect }) => {
        const { stdout, exitCode } = await runPs([
            'ps',
            'apply',
            '--target-org',
            targetOrg,
            '-f',
            malformedPath,
            '--dry-run',
        ]);

        expect(exitCode).toBe(1);
        expect(stdout).toContain('error:');
    });
});
