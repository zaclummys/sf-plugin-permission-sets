import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { execCmd } from '@salesforce/cli-plugins-testkit';

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

/**
 * The part of `sf org create user --json` this needs. The new record's own columns are
 * nested under `fields` with their keys lowercased, so the id is at `fields.id`: reading
 * `result.id` yields undefined and hands the next command the string "undefined".
 *
 * Narrowed by hand rather than imported: @salesforce/plugin-user does export CreateUserOutput,
 * but it declares `fields` as Record<string, unknown>, so importing it would buy a
 * dependency on that whole plugin and still need a cast to read an id out of it.
 */
type CreateUserOutput = {
    fields: {
        id: string;
        username: string;
    };
};

/** Profiles most likely to have a licence free for a second user, tried before the rest. */
function byLikelihood(names: string[]): string[] {
    const preferred = names.filter((name) => /admin|standard/i.test(name));
    const rest = names.filter((name) => !/admin|standard/i.test(name));

    return [
        ...preferred,
        ...rest,
    ];
}

/**
 * Give the org assignments, so a spec can diff a file against state it did not declare.
 *
 * Takes every permission set one assignee gets rather than one at a time, because --name is
 * repeatable and each call is a whole `sf` process in the seeding hook.
 */
export function assignPermissionSets(orgUsername: string, assignee: string, permissionSets: string[]): void {
    const names = permissionSets.map((permissionSet) => `--name ${permissionSet}`).join(' ');

    execCmd(
        `org:assign:permset ${names} --on-behalf-of ${assignee} --target-org ${orgUsername} --json`,
        {
            ensureExitCode: 0,
            cli: 'sf',
        },
    );
}

/**
 * Create a user in the scratch org.
 *
 * The loop is the point: `sf org create user` needs a profile, which profiles an org ships
 * with is not knowable up front, and a profile existing does not mean a licence is free for
 * it. So ask the org what it has and take the first one it accepts. It lives here rather
 * than in the spec because a `.nut.ts` file may not contain a loop.
 */
export function createUser(dir: string, orgUsername: string): CreateUserOutput['fields'] {
    const query = execCmd<{ records: { Name: string }[] }>(
        `data:query --query 'SELECT Name FROM Profile' --target-org ${orgUsername} --json`,
        {
            ensureExitCode: 0,
            cli: 'sf',
        },
    );
    const profiles = query.jsonOutput?.result.records.map((record) => record.Name) ?? [];
    const definition = path.join(dir, 'inactive-user-def.json');

    let created: CreateUserOutput['fields'] | undefined;

    for (const profileName of byLikelihood(profiles)) {
        writeFileSync(definition, JSON.stringify({
            Email: 'ps-nut-inactive@example.com',
            profileName,
        }));

        const attempt = execCmd<CreateUserOutput>(
            `org:create:user --target-org ${orgUsername} --definition-file ${definition} --json`,
            { cli: 'sf' },
        );

        if (attempt.shellOutput.code === 0) {
            created = attempt.jsonOutput?.result.fields;
            break;
        }
    }

    if (!created) {
        throw new Error(`no profile among ${profiles.join(', ')} could create a user in ${orgUsername}`);
    }

    return created;
}

/**
 * The org's id for a username. Needed because an assignment is inserted by id, and the one
 * user a scratch org starts with is only ever named.
 */
export function userId(orgUsername: string, username: string): string {
    const query = execCmd<{
        records: {
            Id: string;
            Username: string;
        }[];
    }>(
        `data:query --query 'SELECT Id, Username FROM User' --target-org ${orgUsername} --json`,
        {
            ensureExitCode: 0,
            cli: 'sf',
        },
    );
    const found = query.jsonOutput?.result.records.find((record) => record.Username === username);

    if (!found) {
        throw new Error(`no user named ${username} in ${orgUsername}`);
    }

    return found.Id;
}

/**
 * Give the org an assignment that expires, which `sf org assign permset` cannot do: it has
 * no expiration flag, so the assignment is inserted as the plain sObject it is.
 *
 * The permission set id has to be looked up, and the query asks for all of them and filters
 * here rather than carrying a WHERE clause: the name would need quoting inside an argument
 * that is already quoted, and that is the shape that does not survive Windows.
 */
export function assignUntil(
    orgUsername: string,
    assigneeId: string,
    permissionSet: string,
    expiration: string,
): void {
    const query = execCmd<{
        records: {
            Id: string;
            Name: string;
        }[];
    }>(
        `data:query --query 'SELECT Id, Name FROM PermissionSet' --target-org ${orgUsername} --json`,
        {
            ensureExitCode: 0,
            cli: 'sf',
        },
    );
    const found = query.jsonOutput?.result.records.find((record) => record.Name === permissionSet);

    if (!found) {
        throw new Error(`${permissionSet} is not deployed to ${orgUsername}`);
    }

    execCmd(
        `data:create:record --sobject PermissionSetAssignment --values `
        + `"AssigneeId=${assigneeId} PermissionSetId=${found.Id} ExpirationDate=${expiration}" `
        + `--target-org ${orgUsername} --json`,
        {
            ensureExitCode: 0,
            cli: 'sf',
        },
    );
}

/**
 * The developer name of a permission set licence the org has, has a free seat for, and the
 * assignee does not already hold.
 *
 * Which licences an org ships with comes from its edition, so the name cannot be written
 * down the way a permission set the fixture project deploys can. Not holding it is what
 * makes a plan against it read as an addition, and the free seat is what lets an apply of
 * that plan succeed: an org carries plenty of licences with none left.
 */
export function unassignedLicense(orgUsername: string, assigneeId: string): string {
    const all = execCmd<{
        records: {
            DeveloperName: string;
            Status: string;
            TotalLicenses: number;
            UsedLicenses: number;
        }[];
    }>(
        `data:query --query 'SELECT DeveloperName, Status, TotalLicenses, UsedLicenses `
        + `FROM PermissionSetLicense' --target-org ${orgUsername} --json`,
        {
            ensureExitCode: 0,
            cli: 'sf',
        },
    );
    const held = execCmd<{
        records: {
            AssigneeId: string;
            PermissionSetLicense: { DeveloperName: string };
        }[];
    }>(
        `data:query --query 'SELECT AssigneeId, PermissionSetLicense.DeveloperName `
        + `FROM PermissionSetLicenseAssign' --target-org ${orgUsername} --json`,
        {
            ensureExitCode: 0,
            cli: 'sf',
        },
    );
    // Filtered here rather than in a WHERE clause: the id would need quoting inside an
    // argument that is already quoted, which is the shape that does not survive Windows.
    const taken = new Set(
        (held.jsonOutput?.result.records ?? [])
            .filter((record) => record.AssigneeId === assigneeId)
            .map((record) => record.PermissionSetLicense.DeveloperName),
    );
    const free = (all.jsonOutput?.result.records ?? [])
        .filter((record) => record.Status === 'Active' && record.UsedLicenses < record.TotalLicenses)
        .map((record) => record.DeveloperName)
        .find((name) => !taken.has(name));

    if (!free) {
        throw new Error(`no permission set licence in ${orgUsername} has a free seat for ${assigneeId}`);
    }

    return free;
}

/** Switch a user off, so a spec can assert what the plugin says about an inactive assignee. */
export function deactivateUser(orgUsername: string, userId: string): void {
    execCmd(
        `data:update:record --sobject User --record-id ${userId} --values IsActive=false --target-org ${orgUsername} --json`,
        {
            ensureExitCode: 0,
            cli: 'sf',
        },
    );
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

    writeFileSync(file, `users:\n  ${username}:\n    permissionSets:\n      - ${permissionSet}\n`);

    return file;
}

/** The same, for the scope the plugin calls permissionSetLicenses. */
export function writeLicenseFile(dir: string, username: string, license: string): string {
    const file = path.join(dir, `${license}--license.yml`);

    writeFileSync(file, `users:\n  ${username}:\n    permissionSetLicenses:\n      - ${license}\n`);

    return file;
}

/** The same, for the scope the plugin calls permissionSetGroups rather than permissionSets. */
export function writeGroupFile(dir: string, username: string, group: string): string {
    const file = path.join(dir, `${group}--group.yml`);

    writeFileSync(file, `users:\n  ${username}:\n    permissionSetGroups:\n      - ${group}\n`);

    return file;
}

/** The expiring form of an entry, which is what the update path in a diff is made of. */
export function writeExpiringFile(
    dir: string,
    username: string,
    permissionSet: string,
    expiration: string,
): string {
    const file = path.join(dir, `${permissionSet}--expiring.yml`);

    writeFileSync(
        file,
        `users:\n  ${username}:\n    permissionSets:\n      - name: ${permissionSet}\n        expiration: ${expiration}\n`,
    );

    return file;
}

/**
 * `ps <args>` through this plugin's own bin/run.js, which is what the testkit resolves to
 * and what every Salesforce plugin runs its NUTs against.
 *
 * Not through a globally installed sf, and TESTKIT_EXECUTABLE_PATH does not make that
 * work: TestSession points HOME at the session dir, and the linked or installed plugin
 * registry lives under the real home, so sf there answers "ps plan is not a sf command".
 * That stubbed home is the mechanism rather than an obstacle, because it is also where
 * TestSession authenticates a devhub and creates scratch orgs. Reach for `cli: 'sf'` only
 * to call a command from some *other* plugin, the way plugin-user calls project:deploy:start.
 *
 * Exit codes are therefore bin/run.js's, and pinning them is safe. They are not portable
 * across executables if that ever changes: the same NamedOrgNotFoundError exits 1 here and
 * 2 through sf, and an invalid --mode value is the other way round. Where the number is
 * oclif's rather than the plugin's, prefer 'nonZero' and assert the message.
 */
/**
 * The same command with colour forced on. A child of execCmd never has a TTY, so the plugin
 * prints plain text unless asked otherwise: FORCE_COLOR turns the detection back on, and
 * NO_COLOR has to be dropped alongside it, because NO_COLOR wins wherever both are set. That
 * variable comes from the suite's own env block, which is what keeps every other spec
 * asserting against plain text.
 */
export function psInColour(args: string[], ensureExitCode: number): string {
    // FORCE_COLOR turns the detection back on for a child that has no TTY, and NO_COLOR has to
    // go with it, because its mere presence beats FORCE_COLOR in ansis, which is what oclif
    // paints with. The suite's own env block sets NO_COLOR, which is what keeps every other
    // spec asserting plain text.
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
