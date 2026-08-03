import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { execCmd } from '@salesforce/cli-plugins-testkit';
import { DefaultUserFields, User, type Org } from '@salesforce/core';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

/** Absolute path to a file under test/fixtures, so no command below depends on its cwd. */
export function fixture(name: string): string {
    return path.join(repoRoot, 'test', 'fixtures', name);
}

/**
 * An alias that resolves nowhere, so the specs that must fail to reach an org fail the same
 * way on any machine, without the network or a developer's default org.
 */
export const unresolvableOrg = 'no-such-org-alias-xyz';

/**
 * The SFDX project a scratch org NUT is built from: one permission set per job that touches
 * the org, plus a group, so no test depends on what another left behind. TestSession copies
 * it into the session dir, so the commands never touch this directory.
 */
export const projectDir = path.join(repoRoot, 'test', 'nut', 'project');

type Profile = {
    Id: string;
    Name: string;
};

/**
 * Structurally a jsforce SaveResult, declared here rather than imported, so setting up an
 * org for a test never reaches into src.
 */
type SaveResult = {
    success: boolean;
    errors: { message: string }[];
};

/** The profiles most likely to have a licence free for a second user. */
const likelyProfile = /admin|standard/i;

/** Kept off the admin's own address, so creating a user cannot mail a real person. */
const inactiveUserEmail = 'ps-nut-inactive@example.com';

function byLikelihood(profiles: Profile[]): Profile[] {
    const preferred = profiles.filter((profile) => likelyProfile.test(profile.Name));
    const rest = profiles.filter((profile) => !likelyProfile.test(profile.Name));

    return [
        ...preferred,
        ...rest,
    ];
}

/**
 * A save that failed comes back as a result rather than an exception, so a seed that
 * silently wrote nothing is what this turns into a named failure. It is what the CLI's
 * ensureExitCode used to cover.
 */
function ensureSaved(result: SaveResult, attempted: string): void {
    if (result.success) {
        return;
    }

    const reasons = result.errors.map((error) => error.message).join(', ');

    throw new Error(`${attempted} failed with ${reasons}`);
}

/**
 * The scratch org a NUT builds its state in, and every question a spec has to ask of it.
 *
 * The org is the injected dependency and each operation takes its own arguments, the way a
 * service under src does. Seeding goes through the org's API rather than through `sf`
 * commands, because it is arrange rather than act. What has to stay a real spawn is the
 * plugin itself, which `ps` below still is. A round trip here costs a request instead of a
 * whole `sf` process, and a name can go in a WHERE clause at last, since there is no shell
 * left for the quoting to have to survive.
 *
 * Every method names a user the way a caller already knows them, by username, and looks the
 * id up itself. No id crosses this boundary, so nothing outside has to hold one, thread it
 * through a hook, or decide which of two users it belongs to.
 *
 * Nothing here reaches into src. The classes are @salesforce/core's own, which is what the
 * commands they replace call underneath.
 */
export class ScratchOrg {
    // Declared and assigned rather than written as a parameter property, which is what a
    // service under src does. Node runs these files through strip-only type stripping, and
    // a parameter property is the one class shape that needs code generated rather than
    // erased, so it fails to parse here while compiling fine there.
    private readonly org: Org;

    public constructor(org: Org) {
        this.org = org;
    }

    /**
     * Give the org assignments, so a spec can diff a file against state it did not declare.
     *
     * User.assignPermissionSets is what `sf org assign permset` calls underneath. It takes
     * permission set names rather than ids, so the names the fixture project deploys go
     * straight in and the assignee is the only thing this has to resolve.
     */
    public async assignPermissionSets(username: string, permissionSets: string[]): Promise<void> {
        const assigneeId = await this.findUserId(username);
        const user = await User.create({ org: this.org });

        await user.assignPermissionSets(assigneeId, permissionSets);
    }

    /**
     * Create a user in the scratch org.
     *
     * DefaultUserFields derives every required field from the admin and fixes the profile at
     * Standard User, so the loop is what is left of the problem: which profiles an org ships
     * with is not knowable up front, and a licence may be free for none of them. Ask the org
     * what it has and take the first profile it accepts. It lives here rather than in a spec
     * because a `.nut.ts` file may not contain a loop.
     */
    public async createUser(): Promise<string> {
        const templateUser = this.getUsername();
        const profiles = await this.query<Profile>('SELECT Id, Name FROM Profile');
        const defaults = await DefaultUserFields.create({ templateUser });
        const fields = defaults.getFields();
        const user = await User.create({ org: this.org });

        let refusal = 'the org listed no profile to try';

        for (const profile of byLikelihood(profiles)) {
            try {
                const authInfo = await user.createUser({
                    ...fields,
                    profileId: profile.Id,
                    email: inactiveUserEmail,
                });

                return authInfo.getUsername();
            } catch (error) {
                // A profile with no licence free is what the next one in the order is for.
                // The reason is kept, because a refusal for any other cause would otherwise
                // surface as the licence problem below that the org never had.
                refusal = error instanceof Error ? error.message : String(error);
            }
        }

        throw new Error(`no profile in ${templateUser} could create a user, and the last refusal was ${refusal}`);
    }

    /**
     * Give the org permission set group grants, which `sf org assign permset` cannot do: its
     * --name is a permission set. A group grant is the same sObject carrying the group's id
     * instead, so it goes in as the plain record it is, the way an expiring grant does.
     */
    public async assignPermissionSetGroups(username: string, groups: string[]): Promise<void> {
        const assigneeId = await this.findUserId(username);

        for (const group of groups) {
            const groupId = await this.findId(
                `SELECT Id FROM PermissionSetGroup WHERE DeveloperName = '${group}'`,
            );

            await this.createRecord('PermissionSetAssignment', {
                AssigneeId: assigneeId,
                PermissionSetGroupId: groupId,
            });
        }
    }

    /**
     * Give the org an assignment that expires, which `sf org assign permset` cannot do: it
     * has no expiration flag, so the assignment is inserted as the plain sObject it is.
     */
    public async assignUntil(username: string, permissionSet: string, expiration: string): Promise<void> {
        const assigneeId = await this.findUserId(username);
        const permissionSetId = await this.findId(
            `SELECT Id FROM PermissionSet WHERE Name = '${permissionSet}'`,
        );

        await this.createRecord('PermissionSetAssignment', {
            AssigneeId: assigneeId,
            PermissionSetId: permissionSetId,
            ExpirationDate: expiration,
        });
    }

    /**
     * The developer name of a permission set licence the org has, has a free seat for, and
     * the assignee does not already hold.
     *
     * Which licences an org ships with comes from its edition, so the name cannot be written
     * down the way a permission set the fixture project deploys can. Not holding it is what
     * makes a plan against it read as an addition, and the free seat is what lets an apply of
     * that plan succeed: an org carries plenty of licences with none left.
     */
    public async findUnassignedLicense(username: string): Promise<string> {
        const assigneeId = await this.findUserId(username);
        const licenses = await this.query<{
            DeveloperName: string;
            TotalLicenses: number;
            UsedLicenses: number;
        }>(
            `SELECT DeveloperName, TotalLicenses, UsedLicenses FROM PermissionSetLicense
             WHERE Status = 'Active'`,
        );
        const held = await this.query<{ PermissionSetLicense: { DeveloperName: string } }>(
            `SELECT PermissionSetLicense.DeveloperName FROM PermissionSetLicenseAssign
             WHERE AssigneeId = '${assigneeId}'`,
        );
        const taken = new Set(held.map((record) => record.PermissionSetLicense.DeveloperName));
        const free = licenses
            .filter((record) => record.UsedLicenses < record.TotalLicenses)
            .map((record) => record.DeveloperName)
            .find((name) => !taken.has(name));

        if (!free) {
            throw new Error(`no permission set licence in ${this.getUsername()} has a free seat for ${username}`);
        }

        return free;
    }

    /** Switch a user off, so a spec can assert what the plugin says about an inactive assignee. */
    public async deactivateUser(username: string): Promise<void> {
        const connection = this.org.getConnection();
        const assigneeId = await this.findUserId(username);
        const result = await connection.update('User', {
            Id: assigneeId,
            IsActive: false,
        });

        ensureSaved(result, `deactivating ${username}`);
    }

    /**
     * The org's own username, which is the template a new user is derived from and the name
     * a failure above is worth reporting against. Read through AuthInfo rather than
     * Org.getUsername, because that one is optional and this is never called without an org.
     */
    private getUsername(): string {
        const connection = this.org.getConnection();
        const authInfo = connection.getAuthInfo();

        return authInfo.getUsername();
    }

    /**
     * The org's id for a username, which every method above resolves for itself. Private
     * because an id is the org's own bookkeeping, and letting one out is what made a caller
     * hold it and hand it back.
     */
    private findUserId(username: string): Promise<string> {
        return this.findId(`SELECT Id FROM User WHERE Username = '${username}'`);
    }

    /**
     * The rows a SOQL query returns. The cast is here because the jsforce generic describes
     * a schema rather than a row.
     */
    private async query<T>(soql: string): Promise<T[]> {
        const connection = this.org.getConnection();
        const result = await connection.query(soql);

        return result.records as unknown as T[];
    }

    /**
     * The id of the one record a lookup wants. singleRecordQuery names the query in its own
     * failure when the org has no such record or more than one.
     */
    private async findId(soql: string): Promise<string> {
        const connection = this.org.getConnection();
        const record = await connection.singleRecordQuery<{ Id: string }>(soql);

        return record.Id;
    }

    private async createRecord(sobject: string, columns: Record<string, string>): Promise<void> {
        const connection = this.org.getConnection();
        const result = await connection.create(sobject, columns);

        ensureSaved(result, `inserting ${sobject}`);
    }
}

/**
 * Every file below has the same shape, one user with one scope with one entry under it. The
 * entry is spliced in after the dash, so an expiring one carries its own second line and the
 * indent that puts it under the name.
 */
function writeUserFile(file: string, username: string, scope: string, entry: string): string {
    writeFileSync(file, `users:\n  ${username}:\n    ${scope}:\n      - ${entry}\n`);

    return file;
}

/**
 * Write the one-user, one-target file a scratch org test plans or applies. The username is
 * the org's admin, which only exists once the org does, so this cannot be a committed
 * fixture the way test/fixtures/*.yml are.
 */
export function writeAssignmentFile(dir: string, username: string, permissionSet: string): string {
    // Both halves are in the name because two tests can declare the same permission set
    // for different users, and naming the file after the target alone had one silently
    // overwrite the other.
    const file = path.join(dir, `${permissionSet}--${username.replace(/[^\w.-]/g, '_')}.yml`);

    return writeUserFile(file, username, 'permissionSets', permissionSet);
}

/** The same, for the scope the plugin calls permissionSetLicenses. */
export function writeLicenseFile(dir: string, username: string, license: string): string {
    const file = path.join(dir, `${license}--license.yml`);

    return writeUserFile(file, username, 'permissionSetLicenses', license);
}

/** The same, for the scope the plugin calls permissionSetGroups rather than permissionSets. */
export function writeGroupFile(dir: string, username: string, group: string): string {
    const file = path.join(dir, `${group}--group.yml`);

    return writeUserFile(file, username, 'permissionSetGroups', group);
}

/** The expiring form of an entry, which is what the update path in a diff is made of. */
export function writeExpiringFile(
    dir: string,
    username: string,
    permissionSet: string,
    expiration: string,
): string {
    const file = path.join(dir, `${permissionSet}--expiring.yml`);

    return writeUserFile(
        file,
        username,
        'permissionSets',
        `name: ${permissionSet}\n        expiration: ${expiration}`,
    );
}

/**
 * `ps <args>` through this plugin's own bin/run.js, which is what the testkit resolves to
 * and what every Salesforce plugin runs its NUTs against.
 *
 * Not through a globally installed sf, and TESTKIT_EXECUTABLE_PATH does not make that
 * work. TestSession points HOME at the session dir, and the linked or installed plugin
 * registry lives under the real home, so sf there answers "ps plan is not a sf command".
 * That stubbed home is the mechanism rather than an obstacle, because it is also where
 * TestSession authenticates a devhub and creates scratch orgs, and where the org the seeding
 * above runs on comes from. Reach for `cli: 'sf'` only to call a command from some *other*
 * plugin, the way org-session.ts calls project:deploy:start.
 *
 * Exit codes are therefore bin/run.js's, and pinning them is safe. They are not portable
 * across executables if that ever changes, since the same NamedOrgNotFoundError exits 1 here
 * and 2 through sf, and an invalid --mode value is the other way round. Where the number is
 * oclif's rather than the plugin's, prefer 'nonZero' and assert the message.
 */
export function ps<T>(args: string, ensureExitCode: number | 'nonZero') {
    return execCmd<T>(`ps ${args}`, {
        ensureExitCode,
        // execCmd redirects the child's output through stdout<id>.txt and stderr<id>.txt
        // in this cwd, and deletes them after. It deletes them *after* the ensureExitCode
        // check throws, so every mismatched run leaks a pair. Pointing cwd at the OS temp
        // dir is what keeps that litter out of the repo, and it costs nothing because the
        // fixture paths above are absolute. The official NUTs never notice because a
        // TestSession with a project stubs cwd into the session dir for them.
        cwd: tmpdir(),
    });
}

/**
 * The same command with colour forced on. A child of execCmd never has a TTY, so the plugin
 * prints plain text unless asked otherwise. FORCE_COLOR turns the detection back on, and
 * NO_COLOR has to be dropped alongside it, because its mere presence beats FORCE_COLOR in
 * ansis, which is what oclif paints with. That variable comes from the suite's own env
 * block, which is what keeps every other spec asserting against plain text.
 */
export function psInColour(args: string[], ensureExitCode: number): string {
    // Annotated because spreading process.env into a literal drops its index signature,
    // and without one the delete below has no key to remove.
    const env: NodeJS.ProcessEnv = {
        ...process.env,
        FORCE_COLOR: '1',
    };

    delete env.NO_COLOR;

    const run = spawnSync(process.execPath, [
        path.join(repoRoot, 'bin', 'run.js'),
        'ps',
        ...args,
    ], {
        encoding: 'utf8',
        cwd: tmpdir(),
        env,
    });

    // The same failure execCmd's ensureExitCode raises, and for the same reason: a bare
    // number afterwards is not diagnosable, so the command's own output comes with it.
    if (run.status !== ensureExitCode) {
        throw new Error(
            `expected exit ${ensureExitCode}, got ${run.status}\nstdout=${run.stdout}\nstderr=${run.stderr}`,
        );
    }

    return run.stdout;
}
