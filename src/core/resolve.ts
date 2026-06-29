import { DesiredAssignment, Kind, OrgTarget, OrgUser } from './model.js';
import { Finding, userNotFoundError, userInactiveError, targetNotFoundError, targetAmbiguousError } from './finding.js';

/** Human label per kind, used in findings. Domain wording, not SObject names. */
const kindLabels: Record<Kind, string> = {
    permissionSet: 'permission set',
    permissionSetGroup: 'permission set group',
    permissionSetLicense: 'permission set license',
};

export const kinds = Object.keys(kindLabels) as Kind[];

function distinct(values: string[]): string[] {
    return [...new Set(values)];
}

/** The distinct usernames assigned across all assignments. */
export function distinctAssignees(assignments: DesiredAssignment[]): string[] {
    return distinct(assignments.map((assignment) => assignment.assignee));
}

/** The distinct targets of one kind across all assignments. */
export function distinctTargets(assignments: DesiredAssignment[], kind: Kind): string[] {
    return distinct(
        assignments.filter((assignment) => assignment.kind === kind).map((assignment) => assignment.target)
    );
}

/** Every declared user must exist in the org and be active. */
export function evaluateUsers(declared: string[], found: OrgUser[]): Finding[] {
    const byName = new Map<string, OrgUser>();
    for (const user of found) {
        byName.set(user.username.toLowerCase(), user);
    }

    const findings: Finding[] = [];
    for (const username of declared) {
        const user = byName.get(username.toLowerCase());
        if (!user) {
            findings.push(userNotFoundError(username));
        } else if (!user.isActive) {
            findings.push(userInactiveError(username));
        }
    }
    return findings;
}

/**
 * Every declared target of one kind must resolve to exactly one record in the
 * org. `found` is the list of matching identifiers the org returned; matching is
 * case-insensitive, mirroring how the org compares them.
 */
export function evaluateTargets(kind: Kind, declared: string[], found: string[]): Finding[] {
    const label = kindLabels[kind];

    const counts = new Map<string, number>();
    for (const name of found) {
        const key = name.toLowerCase();
        counts.set(key, (counts.get(key) ?? 0) + 1);
    }

    const findings: Finding[] = [];
    for (const target of declared) {
        const count = counts.get(target.toLowerCase()) ?? 0;
        if (count === 0) {
            findings.push(targetNotFoundError(target, label));
        } else if (count > 1) {
            findings.push(targetAmbiguousError(target, label));
        }
    }
    return findings;
}

/** Index active users by lowercased username to their org id, for building assignments. */
export function indexUsersById(found: OrgUser[]): Map<string, string> {
    const byName = new Map<string, string>();
    for (const user of found) {
        if (user.isActive) {
            byName.set(user.username.toLowerCase(), user.id);
        }
    }
    return byName;
}

/** Index targets by lowercased name to their org id, skipping names that resolve ambiguously. */
export function indexTargetsById(found: OrgTarget[]): Map<string, string> {
    const counts = new Map<string, number>();
    for (const target of found) {
        const key = target.name.toLowerCase();
        counts.set(key, (counts.get(key) ?? 0) + 1);
    }

    const byName = new Map<string, string>();
    for (const target of found) {
        const key = target.name.toLowerCase();
        if (counts.get(key) === 1) {
            byName.set(key, target.id);
        }
    }
    return byName;
}
