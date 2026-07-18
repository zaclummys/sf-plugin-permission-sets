import { stringify } from 'yaml';
import { DesiredAssignment } from './model.js';
import { kindKeys, ScopeKey } from './normalize.js';

/** A single serialized entry: a bare name, or a name with an expiration. */
type SerializedEntry = string | { name: string; expiration: string };

/** The YAML shape we emit. A superset of FileShape: every scope accepts the object form. */
type OutputFile = { users: Record<string, Partial<Record<ScopeKey, SerializedEntry[]>>> };

/**
 * Emit canonical assignments back to a user-keyed YAML document: the inverse of
 * normalize. Usernames and targets are sorted and de-duplicated so the output is
 * deterministic, empty scopes are omitted, and an assignment with an expiration
 * is written as the object form so it round-trips through the schema.
 */
export function serializeAssignments(assignments: DesiredAssignment[]): string {
    const usernames = [...new Set(assignments.map((assignment) => assignment.assignee))].sort();
    const users: OutputFile['users'] = {};

    for (const username of usernames) {
        const entry: OutputFile['users'][string] = {};

        for (const [kind, key] of kindKeys) {
            const matching = assignments.filter(
                (assignment) => assignment.assignee === username && assignment.kind === kind
            );

            const expirationByTarget = new Map<string, string | null>();
            for (const assignment of matching) {
                if (!expirationByTarget.has(assignment.target)) {
                    expirationByTarget.set(assignment.target, assignment.expiration);
                }
            }

            const entries: SerializedEntry[] = [...expirationByTarget.keys()].sort().map((target) => {
                const expiration = expirationByTarget.get(target);
                if (!expiration) return target;

                return { name: target, expiration };
            });

            if (entries.length > 0) {
                entry[key] = entries;
            }
        }

        users[username] = entry;
    }

    return stringify({ users });
}
