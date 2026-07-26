import { describe, it } from 'vitest';
import { runPs, runPsTargetOrg, parseJson } from '../helpers/run-plugin.js';
import { exportOrgSnapshot } from '../helpers/org-snapshot.js';
import { validPath, schemaErrorPath, malformedPath, warningsPath, undeclaredPath, noOrg } from '../fixtures/index.js';

describe('sf ps apply', () => {
    it('rejects an invalid --mode value', async ({ expect }) => {
        const { stderr, exitCode } = await runPs(['ps', 'apply', '--file', validPath, '--target-org', noOrg, '--mode', 'bogus']);

        expect(exitCode).toBe(1);
        expect(stderr).toContain('additive, destructive, sync');
    });

    it('rejects a negative --max-deletes', async ({ expect }) => {
        const { stderr, exitCode } = await runPs([
            'ps',
            'apply',
            '--file',
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
        const { stderr, exitCode } = await runPsTargetOrg(['ps', 'apply']);

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
        expect(stdout).toContain('--strict');
    });

    // Real-org round-trips. Applying an org's own export is an empty diff, so --dry-run and a
    // real apply both leave the org untouched.
    it('applies an org export as a no-op round-trip (dry-run)', async ({ expect }) => {
        const snapshot = await exportOrgSnapshot(expect);

        const applied = await runPsTargetOrg([
            'ps',
            'apply',
            '--file',
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
        const snapshot = await exportOrgSnapshot(expect);

        const applied = await runPsTargetOrg([
            'ps',
            'apply',
            '--file',
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
        const { stderr, exitCode } = await runPsTargetOrg([
            'ps',
            'apply',
            '--file',
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
        const before = await runPsTargetOrg(['ps', 'export']);

        expect(before.exitCode).toBe(0);

        const guarded = await runPsTargetOrg([
            'ps',
            'apply',
            '--file',
            undeclaredPath,
            '--mode',
            'destructive',
            '--max-deletes',
            '0',
        ]);

        // Assert the guard is what stopped the run, so a file that failed to load earlier
        // cannot make this pass for the wrong reason.
        expect(guarded.stderr).toContain('over the --max-deletes limit of 0');

        const after = await runPsTargetOrg(['ps', 'export']);

        expect(after.stdout).toBe(before.stdout);
    });

    it('refuses to delete in a --json run without --no-prompt', async ({ expect }) => {
        const { stdout, exitCode } = await runPsTargetOrg([
            'ps',
            'apply',
            '--file',
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
        const { stdout, stderr, exitCode } = await runPsTargetOrg([
            'ps',
            'apply',
            '--file',
            schemaErrorPath,
            '--dry-run',
        ]);

        expect(exitCode).toBe(1);
        expect(stdout).toContain('error:');
        expect(stderr).toContain('do not resolve cleanly against the org');
    });

    it('fails malformed YAML with exit 1', async ({ expect }) => {
        const { stdout, exitCode } = await runPsTargetOrg([
            'ps',
            'apply',
            '--file',
            malformedPath,
            '--dry-run',
        ]);

        expect(exitCode).toBe(1);
        expect(stdout).toContain('error:');
    });

    // No --dry-run on purpose: --strict has to stop a real apply before any DML, which is
    // the whole point of it matching what plan --strict refused.
    it('refuses a real apply of a file with warnings under --strict', async ({ expect }) => {
        const { stderr, exitCode } = await runPsTargetOrg([
            'ps',
            'apply',
            '--file',
            warningsPath,
            '--strict',
            '--no-prompt',
        ]);

        expect(exitCode).toBe(1);
        expect(stderr).toContain('Nothing was applied');
    });

    it('names the warnings that --strict refused to apply', async ({ expect }) => {
        const { stdout, exitCode } = await runPsTargetOrg([
            'ps',
            'apply',
            '--file',
            warningsPath,
            '--strict',
            '--no-prompt',
        ]);

        expect(exitCode).toBe(1);
        expect(stdout).toContain('listed twice under permissionSets');
    });

    it('applies an org export under --strict, which raises no warnings', async ({ expect }) => {
        const snapshot = await exportOrgSnapshot(expect);

        const { exitCode } = await runPsTargetOrg([
            'ps',
            'apply',
            '--file',
            snapshot,
            '--strict',
            '--dry-run',
        ]);

        expect(exitCode).toBe(0);
    });
});
