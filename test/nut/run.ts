import path from 'node:path';
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
 * way on any machine. The vitest suite uses the same one, for the same reason.
 */
export const unresolvableOrg = 'no-such-org-alias-xyz';

/**
 * The minimal SFDX project a scratch org NUT is built from: three permission sets nobody
 * holds, so each test can claim one and never depend on what another test did to the org.
 * TestSession copies it into the session dir, so the commands never touch this directory.
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

/** Give the org an assignment, so a spec can diff a file against state it did not declare. */
export function assignPermissionSet(orgUsername: string, assignee: string, permissionSet: string): void {
    execCmd(
        `org:assign:permset --name ${permissionSet} --on-behalf-of ${assignee} --target-org ${orgUsername} --json`,
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
