import { stringify } from 'yaml';
import { DesiredAssignment } from './model.js';
import { kindKeys, ScopeKey } from './normalize.js';
import { distinctAssignees } from './resolve.js';
import { TargetName } from './target-name.js';

/** A single serialized entry: a bare name, or a name with an expiration. */
type SerializedEntry = string | { name: string; expiration: string };

/** The YAML shape we emit. A superset of FileShape: every scope accepts the object form. */
type OutputFile = { users: Record<string, Partial<Record<ScopeKey, SerializedEntry[]>>> };

/** Order identifiers by their text, matching the plain string sort the output relies on. */
function byText(left: { toString(): string }, right: { toString(): string }): number {
    const leftText = left.toString();
    const rightText = right.toString();

    if (leftText === rightText) return 0;

    return leftText < rightText ? -1 : 1;
}

/** One user's entries for one scope, de-duplicated by target and ordered by name. */
function scopeEntries(assignments: DesiredAssignment[]): SerializedEntry[] {
    const byTarget = new Map<string, { target: TargetName; expiration: string | null }>();
    for (const assignment of assignments) {
        if (!byTarget.has(assignment.target.key)) {
            byTarget.set(assignment.target.key, { target: assignment.target, expiration: assignment.expiration });
        }
    }

    const sorted = [...byTarget.values()].sort((left, right) => byText(left.target, right.target));

    return sorted.map(({ target, expiration }) => {
        if (!expiration) return target.toString();

        return { name: target.toString(), expiration };
    });
}

/**
 * Emit canonical assignments back to a user-keyed YAML document: the inverse of
 * normalize. Usernames and targets are sorted and de-duplicated so the output is
 * deterministic, empty scopes are omitted, and an assignment with an expiration
 * is written as the object form so it round-trips through the schema.
 */
export function serializeAssignments(assignments: DesiredAssignment[]): string {
    const assignees = distinctAssignees(assignments);
    const usernames = assignees.sort(byText);
    const users: OutputFile['users'] = {};

    for (const username of usernames) {
        const entry: OutputFile['users'][string] = {};

        for (const [kind, key] of kindKeys) {
            const matching = assignments.filter(
                (assignment) => assignment.assignee.equals(username) && assignment.kind === kind
            );
            const entries = scopeEntries(matching);

            if (entries.length > 0) {
                entry[key] = entries;
            }
        }

        users[username.toString()] = entry;
    }

    return stringify({ users });
}
