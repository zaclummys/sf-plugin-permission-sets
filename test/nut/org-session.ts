import { ok } from 'node:assert';
import path from 'node:path';
import { execCmd, TestSession } from '@salesforce/cli-plugins-testkit';
import { assignPermissionSets, assignUntil, createUser, projectDir, ps, unassignedLicense, userId, writeAssignmentFile, writeExpiringFile, writeGroupFile, writeLicenseFile } from './run.ts';

// Far enough out that the assignment never lapses mid-run. Seeded with milliseconds and
// asserted without them, because the canonical form Expiration.toString writes drops them:
// putting the same spelling in and out would pass even if nothing normalised anything.
const seededExpiration = '2099-12-31T23:59:59.000Z';

export const canonicalExpiration = '2099-12-31T23:59:59Z';

// A different instant for the same assignment, which is what makes a diff report an update
// rather than an addition or a removal. Not named "later": it is earlier than the seeded one,
// and an update is a change of instant rather than a move forward.
const movedExpiration = '2098-06-30T12:00:00Z';

/**
 * The jobs the fixture project is built for: one permission set per job, so no spec can
 * observe what another did. Adding a spec that writes means adding a job here, a permission
 * set to test/nut/project, and the line that writes its file below.
 */
type Job =
    | 'readOnlyPlan'
    | 'dryRun'
    | 'applied'
    | 'missingTarget'
    | 'missingUser'
    | 'undeclared'
    | 'unchanged'
    | 'group'
    | 'license'
    | 'reExpiring'
    | 'undeclaredTarget';

/**
 * The rule every spec used to have to remember, enforced rather than documented: the session
 * is empty until the hook fills it, so reading it at module level would hand the command an
 * empty string and fail somewhere else entirely.
 */
function required(value: string | undefined, name: string): string {
    if (!value) {
        throw new Error(
            `org.${name} is empty: the session hook has not run yet, so read it inside an it() rather than at module level`,
        );
    }

    return value;
}

/**
 * The org-backed NUTs, in the shape every salesforcecli plugin uses: a Dev Hub authenticated
 * into the session's own home, a scratch org created there, and the project deployed into it.
 * The org is gone when the session is cleaned.
 *
 * Every spec file shares one instance, because a scratch org costs a slot in the Dev Hub's
 * daily allocation and about a minute to create. Its hooks are registered at module level
 * rather than inside a describe, so mocha runs them once for the whole `test/nut/org` glob
 * however many files import it: root hooks run before the first spec and after the last.
 *
 * Independence comes from the fixture project instead: one permission set per job, so no
 * file can observe what another did, and no file may depend on running after another. Alpha
 * is only ever planned, Beta only ever dry-run, Gamma is what apply writes, Delta and Epsilon
 * are seeded onto the admin so the diff has state no file put there, Zeta and Eta belong to
 * islandUser and only export reads them, and Theta goes in already expiring so that moving
 * its instant is an update.
 *
 * The one seeded resource that cannot be split that way is the licence, because which
 * licences an org has comes from its edition rather than from the fixture project. Planning
 * it and applying it therefore live in one file, in that order: see apply/org/license.nut.ts.
 *
 * Requires a Dev Hub. Set TESTKIT_AUTH_URL or TESTKIT_HUB_USERNAME first, as the Development
 * section of the README describes. Without one, TestSession.create throws and every org spec
 * fails rather than silently passing.
 */
class OrgSession {
    private session: TestSession | undefined;
    private sessionDir = '';
    private admin = '';
    private island = '';
    private readonly jobFiles = new Map<Job, string>();

    /** Create the org, deploy the project into it, and seed everything a spec reads. */
    public async open(): Promise<void> {
        const session = await TestSession.create({
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
        // TESTKIT_ORG_USERNAME tells TestSession to reuse an org rather than create one, which
        // is how a developer iterates without spending a slot from a hub's daily allocation.
        // It registers that org under its username instead of under 'default', so the key has
        // to follow. Unset, which is what CI and every normal run see, this is 'default' and a
        // scratch org is created and deleted as before.
        const reused = process.env.TESTKIT_ORG_USERNAME;
        const scratchOrg = session.orgs.get(reused ?? 'default');

        ok(scratchOrg?.username, 'the session should have an org with a username');

        this.session = session;
        this.sessionDir = session.dir;
        this.admin = scratchOrg.username;

        // Named rather than left to the default the session set, so the deploy says which org
        // it writes into, and so a session that came up without one fails on the assertion
        // above instead of a minute into a deploy.
        execCmd(`project:deploy:start --target-org ${this.admin}`, {
            ensureExitCode: 0,
            cli: 'sf',
        });

        const created = createUser(this.sessionDir, this.admin);
        const adminId = userId(this.admin, this.admin);

        this.island = created.username;

        this.seedAssignments(adminId, created.id);
        this.writeJobFiles(adminId);
    }

    /** Delete the scratch org, and with it everything every spec wrote. */
    public async close(): Promise<void> {
        await this.session?.clean();
    }

    /** Where a spec writes a file of its own, made per run and removed when the org is. */
    public dir(): string {
        return required(this.sessionDir, 'dir');
    }

    /** The org's admin, who holds every seeded assignment except islandUser's two. */
    public username(): string {
        return required(this.admin, 'username');
    }

    /**
     * The second user. The export specs scope every command to them, which is what makes the
     * counts exact rather than "whatever the org happens to hold", and what keeps the apply
     * specs from moving them.
     */
    public islandUser(): string {
        return required(this.island, 'islandUser');
    }

    /** The file written for one job, which only that job's spec may plan or apply. */
    public useJobFile(job: Job): string {
        return required(this.jobFiles.get(job), `useJobFile(${job})`);
    }

    /**
     * A command against this org. The target is the session's own, so no spec repeats it and
     * none can point one at an org this hook did not create. Use `ps` from run.ts directly for
     * a command that takes no --target-org, the way `ps check` does.
     */
    public runPs<T>(args: string, ensureExitCode: number | 'nonZero') {
        const target = this.username();

        return ps<T>(`${args} --target-org ${target}`, ensureExitCode);
    }

    /**
     * The org's own state, seeded so the diff has something to say that no file declared.
     * Zeta and Eta are what the export specs read: they see exactly those two and nothing the
     * other specs do to the admin. Theta goes in already expiring, so that declaring a
     * different instant for it is an update rather than an addition.
     */
    private seedAssignments(adminId: string, islandId: string): void {
        assignPermissionSets(this.admin, this.admin, [
            'PS_Nut_Delta',
            'PS_Nut_Epsilon',
        ]);
        assignPermissionSets(this.admin, this.island, ['PS_Nut_Zeta']);

        // Kappa is declared and Iota is not, which is the shape of deleting a line from an
        // exported file: the user stays in the file, the permission set leaves it entirely.
        assignPermissionSets(this.admin, this.admin, [
            'PS_Nut_Iota',
            'PS_Nut_Kappa',
        ]);
        assignUntil(this.admin, islandId, 'PS_Nut_Eta', seededExpiration);
        assignUntil(this.admin, adminId, 'PS_Nut_Theta', seededExpiration);
    }

    /** The file each job plans or applies, one per job so no two specs share one. */
    private writeJobFiles(adminId: string): void {
        const dir = this.sessionDir;
        const admin = this.admin;
        const license = unassignedLicense(admin, adminId);

        // Declared but never held, so a plan against them always has exactly one thing to say.
        this.jobFiles.set('readOnlyPlan', writeAssignmentFile(dir, admin, 'PS_Nut_Alpha'));
        this.jobFiles.set('dryRun', writeAssignmentFile(dir, admin, 'PS_Nut_Beta'));
        this.jobFiles.set('applied', writeAssignmentFile(dir, admin, 'PS_Nut_Gamma'));

        // Declared but never deployed, so the org cannot resolve it.
        this.jobFiles.set('missingTarget', writeAssignmentFile(dir, admin, 'PS_Nut_Never_Deployed'));
        this.jobFiles.set('missingUser', writeAssignmentFile(dir, 'nobody@nut.invalid', 'PS_Nut_Alpha'));

        // Delta is held by the admin and declared only for islandUser, which is what puts it in
        // scope (plan only fetches targets the files name) while leaving the admin's copy
        // undeclared: one addition, one removal. Epsilon is held by the admin and declared for
        // the admin, so it is the one assignment that is unchanged.
        this.jobFiles.set('undeclared', writeAssignmentFile(dir, this.island, 'PS_Nut_Delta'));
        this.jobFiles.set('unchanged', writeAssignmentFile(dir, admin, 'PS_Nut_Epsilon'));

        // A group rather than a permission set, a licence rather than either, and an assignment
        // whose expiration moves. Each is a query and DML path in the adapter that no other
        // spec reaches.
        this.jobFiles.set('group', writeGroupFile(dir, admin, 'PS_Nut_Group'));
        this.jobFiles.set('license', writeLicenseFile(dir, admin, license));
        this.jobFiles.set('reExpiring', writeExpiringFile(dir, admin, 'PS_Nut_Theta', movedExpiration));

        // Declares Kappa and says nothing about Iota, which the admin also holds. Nothing else
        // in the suite names Iota either, so it is a permission set the files have dropped
        // entirely rather than one another file still keeps in scope.
        this.jobFiles.set('undeclaredTarget', writeAssignmentFile(dir, admin, 'PS_Nut_Kappa'));
    }
}

/** What every org spec reads, and what the hooks below fill. */
export const org = new OrgSession();

before(async () => {
    await org.open();
});

after(async () => {
    await org.close();
});
