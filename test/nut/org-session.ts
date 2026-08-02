import { ok } from 'node:assert';
import path from 'node:path';
import { execCmd, TestSession } from '@salesforce/cli-plugins-testkit';
import { assignPermissionSet, assignUntil, createUser, projectDir, ps, unassignedLicense, userId, writeAssignmentFile, writeExpiringFile, writeGroupFile, writeLicenseFile } from './run.ts';
import type { PsExportResult } from '../../src/commands/ps/export.js';

// Far enough out that the assignment never lapses mid-run. Seeded with milliseconds and
// asserted without them, because the canonical form Expiration.toString writes drops them:
// putting the same spelling in and out would pass even if nothing normalised anything.
const seededExpiration = '2099-12-31T23:59:59.000Z';

export const canonicalExpiration = '2099-12-31T23:59:59Z';

// A different instant for the same assignment, which is what makes a diff report an update
// rather than an addition or a removal.
export const laterExpiration = '2098-06-30T12:00:00Z';

/**
 * What every org spec reads: the org it runs against, the second user the export specs are
 * scoped to, and the files seeded for each job. Empty until the hook below fills it, which
 * is why a spec reads it inside an `it` and never at module level.
 */
export const org = {
    dir: '',
    username: '',
    islandUser: '',

    // Declared but never held, so a plan against them always has exactly one thing to say.
    readOnlyPlanFile: '',
    dryRunFile: '',
    appliedFile: '',

    // Declared but never deployed, so the org cannot resolve it.
    missingTargetFile: '',
    missingUserFile: '',

    // The org's own state, seeded so the diff has something to say that no file declared.
    // Delta is held by the admin and declared only for islandUser, which is what puts it in
    // scope (plan only fetches targets the files name) while leaving the admin's copy
    // undeclared: one addition, one removal. Epsilon is held by the admin and declared for
    // the admin, so it is the one assignment that is unchanged.
    undeclaredFile: '',
    unchangedFile: '',

    // A group rather than a permission set, and an assignment whose expiration moves. Both
    // are query and DML paths in the adapter that no other spec reaches.
    groupFile: '',
    reExpiringFile: '',
    licenseFile: '',
};

/**
 * The org-backed NUTs, in the shape every salesforcecli plugin uses: a Dev Hub authenticated
 * into the session's own home, a scratch org created there, and the project deployed into it.
 * The org is gone when the session is cleaned.
 *
 * Every spec file shares one session, because a scratch org costs a slot in the Dev Hub's
 * daily allocation and about a minute to create. These hooks are registered at module level
 * rather than inside a describe, so mocha runs them once for the whole `test/nut/org` glob
 * however many files import this: root hooks run before the first spec and after the last.
 *
 * Independence comes from the fixture project instead: one permission set per job, so no
 * file can observe what another did, and no file may depend on running after another. Alpha
 * is only ever planned, Beta only ever dry-run, Gamma is what apply writes, Delta and Epsilon
 * are seeded onto the admin so the diff has state no file put there, Zeta and Eta belong to
 * islandUser and only export reads them, and Theta goes in already expiring so that moving
 * its instant is an update. Adding a spec that writes means adding one more.
 *
 * The one seeded resource that cannot be split that way is the licence, because which
 * licences an org has comes from its edition rather than from the fixture project. Planning
 * it and applying it therefore live in one file, in that order: see apply/org/license.nut.ts.
 *
 * Requires a Dev Hub. Set TESTKIT_AUTH_URL or TESTKIT_HUB_USERNAME first, as the Development
 * section of the README describes. Without one, TestSession.create throws and every org spec
 * fails rather than silently passing.
 */
let session: TestSession | undefined;

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
    org.dir = session.dir;
    org.username = scratchOrg.username;

    const admin = org.username;

    org.readOnlyPlanFile = writeAssignmentFile(org.dir, admin, 'PS_Nut_Alpha');
    org.dryRunFile = writeAssignmentFile(org.dir, admin, 'PS_Nut_Beta');
    org.appliedFile = writeAssignmentFile(org.dir, admin, 'PS_Nut_Gamma');
    org.missingTargetFile = writeAssignmentFile(org.dir, admin, 'PS_Nut_Never_Deployed');
    org.missingUserFile = writeAssignmentFile(org.dir, 'nobody@nut.invalid', 'PS_Nut_Alpha');

    const created = createUser(org.dir, admin);

    org.islandUser = created.username;

    assignPermissionSet(admin, admin, 'PS_Nut_Delta');
    assignPermissionSet(admin, admin, 'PS_Nut_Epsilon');

    // What the export specs read. They scope every command to --user islandUser, so they see
    // exactly these two and nothing the other specs do to the admin.
    assignPermissionSet(admin, org.islandUser, 'PS_Nut_Zeta');
    assignUntil(admin, created.id, 'PS_Nut_Eta', seededExpiration);

    // Theta is the admin's, so the export specs never see it, and it goes in already expiring
    // so that declaring a different instant is an update and not an addition.
    assignUntil(admin, userId(admin, admin), 'PS_Nut_Theta', seededExpiration);

    org.undeclaredFile = writeAssignmentFile(org.dir, org.islandUser, 'PS_Nut_Delta');
    org.unchangedFile = writeAssignmentFile(org.dir, admin, 'PS_Nut_Epsilon');
    org.groupFile = writeGroupFile(org.dir, admin, 'PS_Nut_Group');
    org.licenseFile = writeLicenseFile(org.dir, admin, unassignedLicense(admin, userId(admin, admin)));
    org.reExpiringFile = writeExpiringFile(org.dir, admin, 'PS_Nut_Theta', laterExpiration);
});

after(async () => {
    await session?.clean();
});

/**
 * An export scoped to islandUser, who holds Zeta and an expiring Eta and nothing else. That
 * is what makes the counts exact rather than "whatever the org happens to have", and what
 * keeps the apply specs from moving them.
 */
export function exportIsland(args: string, ensureExitCode: number | 'nonZero') {
    return ps<PsExportResult>(`export --target-org ${org.username} --user ${org.islandUser} ${args}`, ensureExitCode);
}
