// State a spec builds in the org for itself, the way it writes its own YAML into a temp
// dir. The plugin is still driven only through `sf ps`: nothing here is asserted on, and
// `sf data` is used because a permission set and an assignment are plain sObjects, created
// and deleted in milliseconds, so a spec that needs one never has to be told the org
// already holds it.
//
// Every permission set a spec creates is its own, named by that spec and granted to
// islandUser, so two specs running at the same time cannot see each other's state and no
// spec depends on the state another one left behind.

import { execa } from 'execa';
import { targetOrg } from '../env.js';
import { islandUser } from '../fixtures/org.js';

// Auto-update off and colors off for the reasons run-plugin.js turns them off: a network
// round-trip per spawn, and escape codes in output that gets parsed.
const env = {
    ...process.env,
    SF_AUTOUPDATE_DISABLE: 'true',
    NO_COLOR: '1',
    FORCE_COLOR: '0',
};

/**
 * Run one `sf data ...` command against the target org and return its result payload.
 * Unlike runPs this throws: a failure here means the spec never got the state it asked
 * for, so its assertions would be meaningless rather than red.
 *
 * @param {string[]} args
 * @returns {Promise<Record<string, unknown>>}
 */
async function sfData(args) {
    const result = await execa('sf', [
        ...args,
        '--target-org',
        targetOrg,
        '--json',
    ], {
        reject: false,
        env, 
    });
    const parsed = JSON.parse(result.stdout);

    if (parsed.status !== 0) {
        throw new Error(`sf ${args.join(' ')} failed: ${parsed.message}`);
    }

    return parsed.result;
}

/**
 * The records a SOQL query returns.
 *
 * @param {string} soql
 * @returns {Promise<Record<string, string>[]>}
 */
async function query(soql) {
    const result = await sfData([
        'data',
        'query',
        '--query',
        soql,
    ]);

    return result.records;
}

/**
 * @param {string} sobject
 * @param {string} recordId
 */
async function deleteRecord(sobject, recordId) {
    await sfData([
        'data',
        'delete',
        'record',
        '--sobject',
        sobject,
        '--record-id',
        recordId,
    ]);
}

/**
 * Revoke every assignment of a permission set. The org refuses to delete one that is still
 * assigned (DEPENDENCY_EXISTS), so this is what has to run first.
 *
 * @param {string} permissionSetId
 */
async function revokeAll(permissionSetId) {
    const assignments = await query(
        `SELECT Id FROM PermissionSetAssignment WHERE PermissionSetId = '${permissionSetId}'`,
    );
    const tasks = assignments.map((assignment) => deleteRecord('PermissionSetAssignment', assignment.Id));

    await Promise.all(tasks);
}

/**
 * Delete a permission set and everything holding it back, by name. Called before creating
 * one so a run that died before its cleanup does not fail the next run on a duplicate name.
 *
 * @param {string} name
 */
async function dropPermissionSet(name) {
    const existing = await query(`SELECT Id FROM PermissionSet WHERE Name = '${name}'`);
    const tasks = existing.map(async (permissionSet) => {
        await revokeAll(permissionSet.Id);
        await deleteRecord('PermissionSet', permissionSet.Id);
    });

    await Promise.all(tasks);
}

/**
 * A permission set that exists for this spec only, deleted (with its assignments) when the
 * spec finishes, whether it passed or failed. Name it after the spec so no two collide.
 *
 * `onTestFinished` has to be the one from the spec's own context (`async ({ onTestFinished })`),
 * never the import from `vitest`: the suite runs concurrently, so the imported hook cannot
 * tell which spec is calling and files the cleanup under whichever one happens to be
 * running, which deletes state a different spec is still using.
 *
 * @param {(cleanup: () => Promise<void>) => void} onTestFinished
 * @param {string} name
 * @returns {Promise<string>} the new permission set's id
 */
export async function createPermissionSet(onTestFinished, name) {
    await dropPermissionSet(name);
    const created = await sfData([
        'data',
        'create',
        'record',
        '--sobject',
        'PermissionSet',
        '--values',
        `Name=${name} Label=${name}`,
    ]);

    onTestFinished(async () => {
        await revokeAll(created.id);
        await deleteRecord('PermissionSet', created.id);
    });

    return created.id;
}

/**
 * Assign a permission set to islandUser, expiring at `expiration` when one is given. No
 * cleanup of its own: deleting the permission set revokes it.
 *
 * @param {string} permissionSetId
 * @param {{ expiration?: string }} [options]
 */
export async function grant(permissionSetId, options = {}) {
    const [assignee] = await query(`SELECT Id FROM User WHERE Username = '${islandUser}'`);

    if (!assignee) {
        throw new Error(`No user named ${islandUser} in ${targetOrg}: see test/fixtures/org.js.`);
    }

    const fields = [
        `AssigneeId=${assignee.Id}`,
        `PermissionSetId=${permissionSetId}`,
    ];

    if (options.expiration) {
        fields.push(`ExpirationDate=${options.expiration}`);
    }

    await sfData([
        'data',
        'create',
        'record',
        '--sobject',
        'PermissionSetAssignment',
        '--values',
        fields.join(' '),
    ]);
}
