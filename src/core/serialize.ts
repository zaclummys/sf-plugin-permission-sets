import { stringify } from 'yaml';
import { DesiredAssignment } from './model.js';
import { FileShape } from './schema.js';
import { kindKeys } from './normalize.js';

/**
 * Emit canonical (assignee, kind, target) tuples back to a user-keyed YAML
 * document: the inverse of normalize. Usernames and targets are sorted and
 * de-duplicated so the output is deterministic, and empty scopes are omitted.
 */
export function serializeAssignments(assignments: DesiredAssignment[]): string {
    const usernames = [...new Set(assignments.map((assignment) => assignment.assignee))].sort();
    const users: FileShape['users'] = {};

    for (const username of usernames) {
        const entry: FileShape['users'][string] = {};

        for (const [kind, key] of kindKeys) {
            const targets = [
                ...new Set(
                    assignments
                        .filter((assignment) => assignment.assignee === username && assignment.kind === kind)
                        .map((assignment) => assignment.target)
                ),
            ].sort();

            if (targets.length > 0) {
                entry[key] = targets;
            }
        }

        users[username] = entry;
    }

    return stringify({ users });
}
