import { describe, it } from 'vitest';
import { runPs, runPsTargetOrg, parseJson } from '../helpers/run-plugin.js';
import { exportOrgSnapshot } from '../helpers/org-snapshot.js';
import {
    validPath,
    schemaErrorPath,
    malformedPath,
    warningsPath,
    undeclaredPath,
    noOrg,
    declaredPermissionSet,
    undeclaredHolder,
    undeclaredPermissionSet,
} from '../fixtures/index.js';

describe('sf ps plan', () => {
    it('fails cleanly when the org cannot be resolved', async ({ expect }) => {
        const {
            stderr,
            exitCode,
        } = await runPs([
            'ps',
            'plan',
            '--file',
            validPath,
            '--target-org',
            noOrg,
        ]);

        expect(exitCode).toBe(2);
        expect(stderr).toContain('No authorization information found');
    });

    it('--help documents its flags', async ({ expect }) => {
        const {
            stdout,
            exitCode,
        } = await runPs([
            'ps',
            'plan',
            '--help',
        ]);

        expect(exitCode).toBe(0);
        expect(stdout).toContain('--mode');
        expect(stdout).toContain('--file');
        expect(stdout).toContain('--show-unchanged');
        expect(stdout).toContain('--strict');
    });

    // plan is read-only: it queries the org and prints a diff, so these never change org state.
    it('reports no changes when planning an org snapshot back against the org', async ({ expect }) => {
        const snapshot = await exportOrgSnapshot(expect);

        const {
            stdout,
            exitCode,
        } = await runPsTargetOrg([
            'ps',
            'plan',
            '--file',
            snapshot,
        ]);

        expect(exitCode).toBe(0);
        expect(stdout).toContain('No changes.');
    });

    it('headers the plan with the org and the mode', async ({ expect }) => {
        const snapshot = await exportOrgSnapshot(expect);

        const {
            stdout,
            exitCode,
        } = await runPsTargetOrg([
            'ps',
            'plan',
            '--file',
            snapshot,
            '--mode',
            'sync',
        ]);

        expect(exitCode).toBe(0);
        expect(stdout).toContain('Permission Set Assignments Plan');
        expect(stdout).toContain('Mode: sync');
    });

    it('lists unchanged assignments under --show-unchanged', async ({ expect }) => {
        const snapshot = await exportOrgSnapshot(expect);

        const {
            stdout,
            exitCode,
        } = await runPsTargetOrg([
            'ps',
            'plan',
            '--file',
            snapshot,
            '--show-unchanged',
        ]);

        expect(exitCode).toBe(0);
        expect(stdout).toContain(declaredPermissionSet);
    });

    it('leaves unchanged assignments out of the body by default', async ({ expect }) => {
        const snapshot = await exportOrgSnapshot(expect);

        const {
            stdout,
            exitCode,
        } = await runPsTargetOrg([
            'ps',
            'plan',
            '--file',
            snapshot,
        ]);

        expect(exitCode).toBe(0);
        expect(stdout).not.toContain(declaredPermissionSet);
    });

    it('counts the assignments an additive run would add', async ({ expect }) => {
        const {
            stdout,
            exitCode,
        } = await runPsTargetOrg([
            'ps',
            'plan',
            '--file',
            undeclaredPath,
        ]);

        expect(exitCode).toBe(0);
        expect(stdout).toContain('Plan: 1 to add, 0 to update. 1 users affected.');
    });

    it('counts additions and removals together in sync mode', async ({ expect }) => {
        const {
            stdout,
            exitCode,
        } = await runPsTargetOrg([
            'ps',
            'plan',
            '--file',
            undeclaredPath,
            '--mode',
            'sync',
        ]);

        expect(exitCode).toBe(0);
        expect(stdout).toContain('Plan: 1 to add, 0 to update, 1 to remove. 2 users affected.');
    });

    it('marks the holder of an undeclared assignment for removal in sync mode', async ({ expect }) => {
        const {
            stdout,
            exitCode,
        } = await runPsTargetOrg([
            'ps',
            'plan',
            '--file',
            undeclaredPath,
            '--mode',
            'sync',
        ]);

        expect(exitCode).toBe(0);
        expect(stdout).toContain(undeclaredPermissionSet);
        expect(stdout).toContain(`- ${undeclaredHolder}`);
    });

    it('reports undeclared assignments as drift in additive mode', async ({ expect }) => {
        const {
            stdout,
            exitCode,
        } = await runPsTargetOrg([
            'ps',
            'plan',
            '--file',
            undeclaredPath,
        ]);

        expect(exitCode).toBe(0);
        expect(stdout).toContain('Drift: 1 undeclared assignment(s) not removed in additive mode.');
    });

    it('suggests the apply command that would carry out the plan', async ({ expect }) => {
        const {
            stdout,
            exitCode,
        } = await runPsTargetOrg([
            'ps',
            'plan',
            '--file',
            undeclaredPath,
            '--mode',
            'sync',
        ]);

        expect(exitCode).toBe(0);
        // The org is named by whatever PS_TARGET_ORG resolves to, so assert the parts the
        // command builds itself.
        expect(stdout).toContain('ps apply');
        expect(stdout).toContain(`-f "${undeclaredPath}" --mode sync`);
    });

    it('returns counts, drift and the full diff in the --json envelope', async ({ expect }) => {
        const {
            stdout,
            exitCode,
        } = await runPsTargetOrg([
            'ps',
            'plan',
            '--file',
            undeclaredPath,
            '--mode',
            'sync',
            '--json',
        ]);

        expect(exitCode).toBe(0);
        const result = parseJson(stdout);

        expect(result.counts.toAdd).toBe(1);
        expect(result.counts.toUpdate).toBe(0);
        expect(result.counts.toRemove).toBe(1);
        expect(result.counts.usersAffected).toBe(2);
        expect(result.drift).toEqual({
            adds: 0,
            updates: 0,
            removes: 0,
        });
        expect(result.changes.toRemove).toHaveLength(1);
    });

    it('keeps stdout pure JSON when --json is passed', async ({ expect }) => {
        const {
            stdout,
            exitCode,
        } = await runPsTargetOrg([
            'ps',
            'plan',
            '--file',
            undeclaredPath,
            '--json',
        ]);

        expect(exitCode).toBe(0);
        expect(stdout).not.toContain('Permission Set Assignments Plan');
    });

    // Load errors abort before any org call, so the org just needs to resolve; nothing
    // is ever queried or changed.
    it('fails a schema violation with exit 1', async ({ expect }) => {
        const {
            stdout,
            stderr,
            exitCode,
        } = await runPsTargetOrg([
            'ps',
            'plan',
            '--file',
            schemaErrorPath,
        ]);

        expect(exitCode).toBe(1);
        expect(stdout).toContain('error:');
        expect(stderr).toContain('do not resolve cleanly against the org');
    });

    it('fails malformed YAML with exit 1', async ({ expect }) => {
        const {
            stdout,
            exitCode,
        } = await runPsTargetOrg([
            'ps',
            'plan',
            '--file',
            malformedPath,
        ]);

        expect(exitCode).toBe(1);
        expect(stdout).toContain('error:');
    });

    it('turns warnings into a failure under --strict', async ({ expect }) => {
        const {
            stderr,
            exitCode,
        } = await runPsTargetOrg([
            'ps',
            'plan',
            '--file',
            warningsPath,
            '--strict',
        ]);

        expect(exitCode).toBe(1);
        expect(stderr).toContain('--strict treats them as errors');
    });

    it('names the warnings that --strict refused to plan', async ({ expect }) => {
        const {
            stdout,
            exitCode,
        } = await runPsTargetOrg([
            'ps',
            'plan',
            '--file',
            warningsPath,
            '--strict',
        ]);

        expect(exitCode).toBe(1);
        expect(stdout).toContain('listed twice under permissionSets');
    });

    it('plans an org snapshot under --strict, which raises no warnings', async ({ expect }) => {
        const snapshot = await exportOrgSnapshot(expect);

        const {
            stdout,
            exitCode,
        } = await runPsTargetOrg([
            'ps',
            'plan',
            '--file',
            snapshot,
            '--strict',
        ]);

        expect(exitCode).toBe(0);
        expect(stdout).toContain('No changes.');
    });
});
