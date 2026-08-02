import { ok } from 'node:assert';
import path from 'node:path';
import { execCmd, TestSession } from '@salesforce/cli-plugins-testkit';
import { expect } from 'chai';
import { createInactiveUser, projectDir, ps, writeAssignmentFile } from '../run.ts';
import type { PsApplyResult } from '../../../src/commands/ps/apply.js';
import type { PsExportResult } from '../../../src/commands/ps/export.js';
import type { PsPlanResult } from '../../../src/commands/ps/plan.js';

/**
 * The org-backed NUTs, in the shape every salesforcecli plugin uses: a Dev Hub
 * authenticated into the session's own home, a scratch org created there, and the project
 * deployed into it. Nothing here reads PS_TARGET_ORG, so it cannot collide with the vitest
 * suite, and the org is gone when the session is cleaned.
 *
 * plan and apply share one session because a scratch org costs a slot in the Dev Hub's
 * daily allocation and about a minute to create. They stay independent of each other
 * anyway: the project deploys three permission sets and each test claims its own, so no
 * test can see what another one did to the org.
 *
 * Requires a Dev Hub. Set TESTKIT_AUTH_URL or TESTKIT_HUB_USERNAME first, as the
 * Development section of the README describes. Without one, TestSession.create throws and
 * this file fails rather than silently passing.
 */
describe('scratch org NUTs', () => {
    let session: TestSession | undefined;
    let username: string;

    // One permission set per test that touches the org, so the order they run in cannot
    // change what any of them sees. Only gamma is ever assigned.
    let readOnlyPlanFile: string;
    let dryRunFile: string;
    let appliedFile: string;

    // Declared but never deployed, so the org cannot resolve it.
    let missingTargetFile: string;
    let missingUserFile: string;

    before(async () => {
        session = await TestSession.create({
            project: { sourceDir: projectDir },
            devhubAuthStrategy: 'AUTO',
            scratchOrgs: [
                {
                    config: path.join('config', 'project-scratch-def.json'),
                    setDefault: true,
                    tracksSource: false,
                },
            ],
        });

        execCmd('project:deploy:start', {
            ensureExitCode: 0,
            cli: 'sf',
        });

        const scratchOrg = session.orgs.get('default');

        ok(scratchOrg?.username, 'the scratch org should have a username');
        username = scratchOrg.username;

        readOnlyPlanFile = writeAssignmentFile(session.dir, username, 'PS_Nut_Alpha');
        dryRunFile = writeAssignmentFile(session.dir, username, 'PS_Nut_Beta');
        appliedFile = writeAssignmentFile(session.dir, username, 'PS_Nut_Gamma');
        missingTargetFile = writeAssignmentFile(session.dir, username, 'PS_Nut_Never_Deployed');
        missingUserFile = writeAssignmentFile(session.dir, 'nobody@nut.invalid', 'PS_Nut_Alpha');
    });

    after(async () => {
        await session?.clean();
    });

    describe('ps plan', () => {
        it('counts the one assignment an additive run would add', () => {
            const result = ps(`plan --file ${readOnlyPlanFile} --target-org ${username}`, 0);

            expect(result.shellOutput.stdout).to.contain('Plan: 1 to add, 0 to update. 1 users affected.');
        });

        it('names the permission set it would add', () => {
            const result = ps(`plan --file ${readOnlyPlanFile} --target-org ${username}`, 0);

            expect(result.shellOutput.stdout).to.contain('PS_Nut_Alpha');
        });

        it('reports the org it planned against in --json', () => {
            const result = ps<PsPlanResult>(
                `plan --file ${readOnlyPlanFile} --target-org ${username} --json`,
                0,
            );
            const payload = result.jsonOutput?.result;

            expect(payload?.org.username).to.equal(username);
            expect(payload?.counts.toAdd).to.equal(1);
        });
    });

    describe('ps validate', () => {
        it('finds nothing wrong with a file the org can satisfy', () => {
            const result = ps(`validate --file ${readOnlyPlanFile} --target-org ${username}`, 0);

            expect(result.shellOutput.stdout).to.contain('0 errors, 0 warnings.');
        });

        it('names a permission set the org does not have', () => {
            const result = ps(`validate --file ${missingTargetFile} --target-org ${username}`, 1);

            expect(result.shellOutput.stdout).to.contain('PS_Nut_Never_Deployed: permission set not found in org');
        });

        it('names a user the org does not have', () => {
            const result = ps(`validate --file ${missingUserFile} --target-org ${username}`, 1);

            expect(result.shellOutput.stdout).to.contain('nobody@nut.invalid: user not found in org');
        });

        // Creating a user is the most failure-prone thing here: it needs a profile whose
        // name the org decides, and a licence to be free for it. Its own hook keeps a
        // failure to this one test rather than the file.
        //
        // TARGET_AMBIGUOUS still has no test, for a reason no org can fix: it needs two
        // records of one kind sharing a case-folded name, which an org without a managed
        // package cannot have.
        describe('and a user the org deactivated', () => {
            let inactiveUserFile: string;

            before(() => {
                const sessionDir = session?.dir ?? '';
                const inactive = createInactiveUser(sessionDir, username);

                inactiveUserFile = writeAssignmentFile(sessionDir, inactive.username, 'PS_Nut_Alpha');
            });

            it('names it as inactive rather than missing', () => {
                const result = ps(`validate --file ${inactiveUserFile} --target-org ${username}`, 1);

                expect(result.shellOutput.stdout).to.contain('user is inactive');
            });
        });
    });

    describe('ps export', () => {
        // Whatever the org holds, exporting it has to produce a file the plugin accepts.
        // Asserting the round trip rather than a count is what keeps this independent of
        // the apply test above, which changes what there is to export.
        it('writes a document that ps check accepts', () => {
            const exported = path.join(session?.dir ?? '', 'exported.yml');

            ps(`export --target-org ${username} --output-file ${exported}`, 0);

            const checked = ps(`check --file ${exported}`, 0);

            expect(checked.shellOutput.stdout).to.contain('0 errors');
        });

        it('reports the file it wrote in --json', () => {
            const exported = path.join(session?.dir ?? '', 'exported-json.yml');
            const result = ps<PsExportResult>(
                `export --target-org ${username} --output-file ${exported} --json`,
                0,
            );

            expect(result.jsonOutput?.result.outputFile).to.equal(exported);
        });
    });

    describe('ps apply', () => {
        it('reports what a dry run would do without doing it', () => {
            const dryRun = ps(`apply --file ${dryRunFile} --target-org ${username} --dry-run`, 0);

            expect(dryRun.shellOutput.stdout).to.contain('Dry run: 1 to add, 0 to update, 0 to remove.');

            // The org is untouched, so planning the same file still has the same to say.
            const after = ps(`plan --file ${dryRunFile} --target-org ${username}`, 0);

            expect(after.shellOutput.stdout).to.contain('Plan: 1 to add, 0 to update. 1 users affected.');
        });

        it('counts a dry run in the --json envelope without adding anything', () => {
            const result = ps<PsApplyResult>(
                `apply --file ${dryRunFile} --target-org ${username} --dry-run --json`,
                0,
            );
            const payload = result.jsonOutput?.result;

            expect(payload?.toAdd).to.equal(1);
            expect(payload?.added).to.equal(0);
        });

        it('adds the assignment and leaves the org matching the file', () => {
            const applied = ps(
                `apply --file ${appliedFile} --target-org ${username} --no-prompt`,
                0,
            );

            expect(applied.shellOutput.stdout).to.contain('Applied: 1 added, 0 updated, 0 removed.');

            // Applying twice is what proves the write landed rather than being reported.
            const after = ps(`plan --file ${appliedFile} --target-org ${username}`, 0);

            expect(after.shellOutput.stdout).to.contain('No changes.');
        });
    });
});
