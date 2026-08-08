import { stringify } from 'yaml';
import { Expiration } from './expiration.js';
import { DesiredAssignment } from './model.js';
import { kindKeys, ScopeKey } from './scope-key.js';
import { distinctAssignees } from './resolve.js';
import { TargetName } from './target-name.js';
import { Username } from './username.js';

/** A single serialized entry: a bare name, or a name with an expiration. */
type SerializedEntry = string | {
    name: string;
    expiration: string
};

/** One user's scopes as emitted. Every scope is optional, because an empty one is omitted. */
type OutputEntry = Partial<Record<ScopeKey, SerializedEntry[]>>;

/** The users block we emit. A superset of FileShape: every scope accepts the object form. */
type OutputUsers = Record<string, OutputEntry>;

/**
 * Order identifiers by their text, matching the plain string sort the output relies on. There
 * is no equal case to answer for: both callers sort a set already de-duplicated by `asKey()`,
 * and equal text folds to one key.
 */
function byText(left: TargetName | Username, right: TargetName | Username): number {
    const leftText = left.toString();
    const rightText = right.toString();

    return leftText < rightText ? -1 : 1;
}

/** One user's entries for one scope, de-duplicated by target and ordered by name. */
function scopeEntries(assignments: DesiredAssignment[]): SerializedEntry[] {
    const byTarget = new Map<string, {
        target: TargetName;
        expiration: Expiration | null
    }>();

    for (const assignment of assignments) {
        if (!byTarget.has(assignment.target.asKey())) {
            byTarget.set(assignment.target.asKey(), {
                target: assignment.target,
                expiration: assignment.expiration,
            });
        }
    }

    const sorted = [...byTarget.values()].sort((left, right) => byText(left.target, right.target));

    return sorted.map(({
        target,
        expiration,
    }) => {
        if (!expiration) {
            return target.toString();
        }

        return {
            name: target.toString(),
            expiration: expiration.toString(),
        };
    });
}

/**
 * Emit canonical assignments back to a user-keyed YAML document: the inverse of
 * normalize. Usernames and targets are sorted and de-duplicated so the output is
 * deterministic, empty scopes are omitted, and an assignment with an expiration
 * is written as the object form, in Expiration's canonical spelling, so the file
 * round-trips back through the schema.
 */
export function serializeAssignments(assignments: DesiredAssignment[]): string {
    const assignees = distinctAssignees(assignments);
    const usernames = assignees.sort(byText);
    const users: OutputUsers = {};

    for (const username of usernames) {
        const entry: OutputEntry = {};

        for (const [
            kind,
            key,
        ] of kindKeys) {
            const matching = assignments.filter(
                (assignment) => assignment.assignee.equals(username) && assignment.kind === kind,
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
