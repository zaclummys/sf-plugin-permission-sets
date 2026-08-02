import { ok } from 'node:assert';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { execCmd, TestSession } from '@salesforce/cli-plugins-testkit';
import { expect } from 'chai';
import { parse } from 'yaml';
import { assignPermissionSet, assignUntil, createUser, deactivateUser, fixture, projectDir, ps, unassignedLicense, userId, writeAssignmentFile, writeExpiringFile, writeGroupFile, writeLicenseFile } from '../run.ts';
import type { PsApplyResult } from '../../../src/commands/ps/apply.js';
import type { PsExportResult } from '../../../src/commands/ps/export.js';
import type { PsPlanResult } from '../../../src/commands/ps/plan.js';
import type { PsValidateResult } from '../../../src/commands/ps/validate.js';

// Far enough out that the assignment never lapses mid-run. Seeded with milliseconds and
// asserted without them, because the canonical form Expiration.toString writes drops them:
// putting the same spelling in and out would pass even if nothing normalised anything.
const seededExpiration = '2099-12-31T23:59:59.000Z';
const canonicalExpiration = '2099-12-31T23:59:59Z';

// A different instant for the same assignment, which is what makes a diff report an update
// rather than an addition or a removal.
const laterExpiration = '2098-06-30T12:00:00Z';

/**
 * The org-backed NUTs, in the shape every salesforcecli plugin uses: a Dev Hub
 * authenticated into the session's own home, a scratch org created there, and the project
 * deployed into it. Nothing here reads PS_TARGET_ORG, so it cannot collide with the vitest
 * suite, and the org is gone when the session is cleaned.
 *
 * Every command shares one session, because a scratch org costs a slot in the Dev Hub's
 * daily allocation and about a minute to create. Independence comes from the fixture
 * project instead: one permission set per job, so no test can observe what another did.
 * Alpha is only ever planned, Beta only ever dry-run, Gamma is what apply writes, Delta and
 * Epsilon are seeded onto the admin so the diff has state no file put there, Zeta and Eta
 * belong to islandUser and only export reads them, and Theta goes in already expiring so
 * that moving its instant is an update. Adding a test that writes means adding one more.
 *
 * Requires a Dev Hub. Set TESTKIT_AUTH_URL or TESTKIT_HUB_USERNAME first, as the
 * Development section of the README describes. Without one, TestSession.create throws and
 * this file fails rather than silently passing.
 *
 * All three scopes are exercised. The licence is picked at run time rather than named:
 * which licences an org has comes from its edition, so unlike a permission set the fixture
 * project deploys, its name is not ours to write down.
 */
describe('scratch org NUTs', () => {
    let session: TestSession | undefined;
    let username: string;

    // Declared but never held, so a plan against them always has exactly one thing to say.
    let readOnlyPlanFile: string;
    let dryRunFile: string;
    let appliedFile: string;

    // Declared but never deployed, so the org cannot resolve it.
    let missingTargetFile: string;
    let missingUserFile: string;

    // The org's own state, seeded so the diff has something to say that no file declared.
    // Delta is held by the admin and declared only for islandUser, which is what puts it in
    // scope (plan only fetches targets the files name) while leaving the admin's copy
    // undeclared: one addition, one removal. Epsilon is held by the admin and declared for
    // the admin, so it is the one assignment that is unchanged.
    let undeclaredFile: string;
    let unchangedFile: string;

    // A second user, holding only what the export specs read, so scoping every export to it
    // keeps them blind to whatever the apply specs did to the admin.
    let islandUser: string;

    // A group rather than a permission set, and an assignment whose expiration moves. Both
    // are query and DML paths in the adapter that no other test reaches.
    let groupFile: string;
    let reExpiringFile: string;
    let licenseFile: string;

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

        const created = createUser(session.dir, username);

        islandUser = created.username;

        assignPermissionSet(username, username, 'PS_Nut_Delta');
        assignPermissionSet(username, username, 'PS_Nut_Epsilon');

        // What the export specs read. They scope every command to --user islandUser, so
        // they see exactly these two and nothing the other specs do to the admin.
        assignPermissionSet(username, islandUser, 'PS_Nut_Zeta');
        assignUntil(username, created.id, 'PS_Nut_Eta', seededExpiration);

        // Theta is the admin's, so the export specs never see it, and it goes in already
        // expiring so that declaring a different instant is an update and not an addition.
        assignUntil(username, userId(username, username), 'PS_Nut_Theta', seededExpiration);

        undeclaredFile = writeAssignmentFile(session.dir, islandUser, 'PS_Nut_Delta');
        unchangedFile = writeAssignmentFile(session.dir, username, 'PS_Nut_Epsilon');
        groupFile = writeGroupFile(session.dir, username, 'PS_Nut_Group');
        licenseFile = writeLicenseFile(session.dir, username, unassignedLicense(username, userId(username, username)));
        reExpiringFile = writeExpiringFile(session.dir, username, 'PS_Nut_Theta', laterExpiration);
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

        it('plans a permission set group the same way it plans a permission set', () => {
            const result = ps(`plan --file ${groupFile} --target-org ${username}`, 0);

            expect(result.shellOutput.stdout).to.contain('Plan: 1 to add, 0 to update. 1 users affected.');
            expect(result.shellOutput.stdout).to.contain('PS_Nut_Group');
        });

        it('plans a permission set licence the same way it plans a permission set', () => {
            const result = ps(`plan --file ${licenseFile} --target-org ${username}`, 0);

            expect(result.shellOutput.stdout).to.contain('Plan: 1 to add, 0 to update. 1 users affected.');
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

        it('headers the plan with the org and the mode', () => {
            const result = ps(`plan --file ${readOnlyPlanFile} --target-org ${username} --mode sync`, 0);

            expect(result.shellOutput.stdout).to.contain('Permission Set Assignments Plan');
            expect(result.shellOutput.stdout).to.contain('Mode: sync');
        });

        it('suggests the apply command that would carry out the plan', () => {
            const result = ps(`plan --file ${readOnlyPlanFile} --target-org ${username} --mode sync`, 0);

            expect(result.shellOutput.stdout).to.contain('ps apply');
            expect(result.shellOutput.stdout).to.contain(`-f "${readOnlyPlanFile}" --mode sync`);
        });

        it('reports no changes when everything the file declares is already held', () => {
            const result = ps(`plan --file ${unchangedFile} --target-org ${username}`, 0);

            expect(result.shellOutput.stdout).to.contain('No changes.');
        });

        it('lists unchanged assignments under --show-unchanged', () => {
            const result = ps(`plan --file ${unchangedFile} --target-org ${username} --show-unchanged`, 0);

            expect(result.shellOutput.stdout).to.contain('PS_Nut_Epsilon');
        });

        it('leaves unchanged assignments out of the body by default', () => {
            const result = ps(`plan --file ${unchangedFile} --target-org ${username}`, 0);

            expect(result.shellOutput.stdout).to.not.contain('PS_Nut_Epsilon');
        });

        it('counts additions and removals together in sync mode', () => {
            const result = ps(`plan --file ${undeclaredFile} --target-org ${username} --mode sync`, 0);

            expect(result.shellOutput.stdout).to.contain('Plan: 1 to add, 0 to update, 1 to remove. 2 users affected.');
        });

        it('marks the holder of an undeclared assignment for removal in sync mode', () => {
            const result = ps(`plan --file ${undeclaredFile} --target-org ${username} --mode sync`, 0);

            expect(result.shellOutput.stdout).to.contain('PS_Nut_Delta');
            expect(result.shellOutput.stdout).to.contain(`- ${username}`);
        });

        it('reports undeclared assignments as drift in additive mode', () => {
            const result = ps(`plan --file ${undeclaredFile} --target-org ${username}`, 0);

            expect(result.shellOutput.stdout).to.contain(
                'Drift: 1 undeclared assignment(s) not removed in additive mode.',
            );
        });

        it('returns counts, drift and the full diff in the --json envelope', () => {
            const result = ps<PsPlanResult>(
                `plan --file ${undeclaredFile} --target-org ${username} --mode sync --json`,
                0,
            );
            const payload = result.jsonOutput?.result;

            expect(payload?.counts).to.deep.include({
                toAdd: 1,
                toUpdate: 0,
                toRemove: 1,
                usersAffected: 2,
            });
            expect(payload?.changes.toRemove).to.have.lengthOf(1);
        });

        it('keeps stdout pure JSON when --json is passed', () => {
            const result = ps(`plan --file ${undeclaredFile} --target-org ${username} --json`, 0);

            expect(result.shellOutput.stdout).to.not.contain('Permission Set Assignments Plan');
        });

        // These four abort on the file, before the org is ever queried, but they still need
        // an org that resolves: --target-org is parsed before run() reads anything.
        it('fails a schema violation with exit 1', () => {
            const result = ps(`plan --file ${fixture('schema-error.yml')} --target-org ${username}`, 1);

            expect(result.shellOutput.stderr).to.contain('do not resolve cleanly against the org');
        });

        it('fails malformed YAML with exit 1', () => {
            const result = ps(`plan --file ${fixture('malformed.yml')} --target-org ${username}`, 1);

            expect(result.shellOutput.stdout).to.contain('error:');
        });

        it('turns warnings into a failure under --strict', () => {
            const result = ps(`plan --file ${fixture('warnings.yml')} --target-org ${username} --strict`, 1);

            expect(result.shellOutput.stderr).to.contain('--strict treats them as errors');
        });

        it('names the warnings that --strict refused to plan', () => {
            const result = ps(`plan --file ${fixture('warnings.yml')} --target-org ${username} --strict`, 1);

            expect(result.shellOutput.stdout).to.contain('listed twice under permissionSets');
        });

        it('plans a file with no warnings under --strict', () => {
            const result = ps(`plan --file ${unchangedFile} --target-org ${username} --strict`, 0);

            expect(result.shellOutput.stdout).to.contain('No changes.');
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

        it('returns the resolved counts in the --json envelope', () => {
            const result = ps<PsValidateResult>(
                `validate --file ${readOnlyPlanFile} --target-org ${username} --json`,
                0,
            );

            expect(result.jsonOutput?.result).to.deep.include({
                files: 1,
                users: 1,
                assignments: 1,
            });
        });

        it('rejects a missing required --file flag', () => {
            const result = ps(`validate --target-org ${username}`, 2);

            expect(result.shellOutput.stderr).to.contain('Missing required flag file');
        });

        it('fails a schema violation with exit 1', () => {
            const result = ps(`validate --file ${fixture('schema-error.yml')} --target-org ${username}`, 1);

            expect(result.shellOutput.stdout).to.contain('error:');
        });

        it('fails malformed YAML with exit 1', () => {
            const result = ps(`validate --file ${fixture('malformed.yml')} --target-org ${username}`, 1);

            expect(result.shellOutput.stdout).to.contain('error:');
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
                const inactive = createUser(sessionDir, username);

                deactivateUser(username, inactive.id);
                inactiveUserFile = writeAssignmentFile(sessionDir, inactive.username, 'PS_Nut_Alpha');
            });

            it('names it as inactive rather than missing', () => {
                const result = ps(`validate --file ${inactiveUserFile} --target-org ${username}`, 1);

                expect(result.shellOutput.stdout).to.contain('user is inactive');
            });
        });
    });

    describe('ps export', () => {
        // Everything here scopes to --user islandUser, which holds Zeta and an expiring Eta
        // and nothing else. That is what makes the counts exact rather than "whatever the
        // org happens to have", and what keeps the apply specs from moving them.
        function exportIsland(args: string, ensureExitCode: number | 'nonZero') {
            return ps<PsExportResult>(`export --target-org ${username} --user ${islandUser} ${args}`, ensureExitCode);
        }

        it('returns the exported counts in the --json envelope', () => {
            const result = exportIsland('--json', 0);

            expect(result.jsonOutput?.result).to.deep.include({
                users: 1,
                assignments: 2,
            });
        });

        it('writes a user-keyed document to --output-file', () => {
            const exported = path.join(session?.dir ?? '', 'keyed.yml');

            exportIsland(`--output-file ${exported}`, 0);

            const document = parse(readFileSync(exported, 'utf8')) as { users: Record<string, unknown> };

            expect(Object.keys(document.users)).to.deep.equal([islandUser]);
        });

        it('reports the file it wrote in --json', () => {
            const exported = path.join(session?.dir ?? '', 'exported-json.yml');
            const result = exportIsland(`--output-file ${exported} --json`, 0);

            expect(result.jsonOutput?.result.outputFile).to.equal(exported);
        });

        it('writes a document that ps check accepts', () => {
            const exported = path.join(session?.dir ?? '', 'exported.yml');

            exportIsland(`--output-file ${exported}`, 0);

            const checked = ps(`check --file ${exported}`, 0);

            expect(checked.shellOutput.stdout).to.contain('0 errors');
        });

        it('writes an org expiration in canonical ISO form', () => {
            const exported = path.join(session?.dir ?? '', 'expiring.yml');

            exportIsland(`--output-file ${exported}`, 0);

            expect(readFileSync(exported, 'utf8')).to.contain(canonicalExpiration);
        });

        it('scopes the document to the requested --kind only', () => {
            const exported = path.join(session?.dir ?? '', 'kinded.yml');

            exportIsland(`--kind permissionSetLicenses --output-file ${exported}`, 0);

            expect(readFileSync(exported, 'utf8')).to.not.contain('PS_Nut_Zeta');
        });

        it('writes the document to stdout when --output-file is omitted', () => {
            const result = exportIsland('', 0);

            expect(result.shellOutput.stdout).to.contain('PS_Nut_Zeta');
        });

        it('keeps stdout free of the summary line when it carries the document', () => {
            const result = exportIsland('', 0);

            expect(result.shellOutput.stdout).to.not.contain('assignment(s) exported');
        });

        it('emits the same document to stdout as it writes to a file', () => {
            const exported = path.join(session?.dir ?? '', 'both.yml');
            const toStdout = exportIsland('', 0);

            exportIsland(`--output-file ${exported}`, 0);

            expect(toStdout.shellOutput.stdout.trim()).to.equal(readFileSync(exported, 'utf8').trim());
        });

        it('returns the document in the --json envelope with a null outputFile', () => {
            const result = exportIsland('--json', 0);
            const payload = result.jsonOutput?.result;

            expect(payload?.outputFile).to.equal(null);
            expect(payload?.content).to.contain('PS_Nut_Zeta');
        });

        it('matches a requested --user whose case differs from the org', () => {
            const result = ps<PsExportResult>(
                `export --target-org ${username} --user ${islandUser.toUpperCase()} --json`,
                0,
            );

            expect(result.jsonOutput?.result.users).to.equal(1);
        });

        it('warns and continues when a requested --user matches nothing', () => {
            const result = ps<PsExportResult>(
                `export --target-org ${username} --user nobody@nut.invalid --json`,
                0,
            );

            expect(result.jsonOutput?.result.unmatchedUsers).to.deep.equal(['nobody@nut.invalid']);
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

        it('applies nothing when the org already satisfies the file', () => {
            const result = ps(`apply --file ${unchangedFile} --target-org ${username} --no-prompt`, 0);

            expect(result.shellOutput.stdout).to.contain('Applied: 0 added, 0 updated, 0 removed.');
        });

        it('reports nothing to do on a dry run of a file the org satisfies', () => {
            const result = ps(`apply --file ${unchangedFile} --target-org ${username} --dry-run`, 0);

            expect(result.shellOutput.stdout).to.contain('Dry run: 0 to add, 0 to update, 0 to remove.');
        });

        it('applies a file with no warnings under --strict', () => {
            const result = ps(`apply --file ${unchangedFile} --target-org ${username} --strict --no-prompt`, 0);

            expect(result.shellOutput.stdout).to.contain('Applied: 0 added, 0 updated, 0 removed.');
        });

        // The guard tests all end in a refusal, so none of them removes the seeded Delta
        // assignment that the plan specs above read.
        it('refuses a destructive run that would remove more than --max-deletes', () => {
            const result = ps(
                `apply --file ${undeclaredFile} --target-org ${username} --mode destructive --max-deletes 0 --no-prompt`,
                1,
            );

            expect(result.shellOutput.stderr).to.contain('over the --max-deletes limit of 0');
        });

        it('leaves the org unchanged when the --max-deletes guard trips', () => {
            ps(
                `apply --file ${undeclaredFile} --target-org ${username} --mode destructive --max-deletes 0 --no-prompt`,
                1,
            );

            const after = ps(`plan --file ${undeclaredFile} --target-org ${username} --mode sync`, 0);

            expect(after.shellOutput.stdout).to.contain('Plan: 1 to add, 0 to update, 1 to remove. 2 users affected.');
        });

        it('refuses to delete in a --json run without --no-prompt', () => {
            const result = ps(
                `apply --file ${undeclaredFile} --target-org ${username} --mode destructive --json`,
                1,
            );

            expect(result.shellOutput.stdout).to.contain('Re-run with --no-prompt');
        });

        it('requires --file', () => {
            const result = ps(`apply --target-org ${username}`, 2);

            expect(result.shellOutput.stderr).to.contain('Missing required flag file');
        });

        it('fails a schema violation with exit 1', () => {
            const result = ps(
                `apply --file ${fixture('schema-error.yml')} --target-org ${username} --no-prompt`,
                1,
            );

            expect(result.shellOutput.stderr).to.contain('do not resolve cleanly against the org');
        });

        it('fails malformed YAML with exit 1', () => {
            const result = ps(
                `apply --file ${fixture('malformed.yml')} --target-org ${username} --no-prompt`,
                1,
            );

            expect(result.shellOutput.stdout).to.contain('error:');
        });

        it('refuses a file with warnings under --strict', () => {
            const result = ps(
                `apply --file ${fixture('warnings.yml')} --target-org ${username} --strict --no-prompt`,
                1,
            );

            expect(result.shellOutput.stderr).to.contain('Nothing was applied');
        });

        it('names the warnings that --strict refused to apply', () => {
            const result = ps(
                `apply --file ${fixture('warnings.yml')} --target-org ${username} --strict --no-prompt`,
                1,
            );

            expect(result.shellOutput.stdout).to.contain('listed twice under permissionSets');
        });

        it('reports an expiration change as an update rather than an addition', () => {
            const result = ps<PsApplyResult>(
                `apply --file ${reExpiringFile} --target-org ${username} --no-prompt --json`,
                0,
            );

            expect(result.jsonOutput?.result).to.deep.include({
                added: 0,
                updated: 1,
                removed: 0,
            });
        });

        it('adds a permission set licence, which is a different sObject from an assignment', () => {
            const applied = ps(`apply --file ${licenseFile} --target-org ${username} --no-prompt`, 0);

            expect(applied.shellOutput.stdout).to.contain('Applied: 1 added, 0 updated, 0 removed.');

            const after = ps(`plan --file ${licenseFile} --target-org ${username}`, 0);

            expect(after.shellOutput.stdout).to.contain('No changes.');
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
