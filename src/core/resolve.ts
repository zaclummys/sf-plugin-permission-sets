import { DesiredAssignment, Finding, Kind, OrgUser } from './model.js';

/** Human label per kind, used in findings. Domain wording, not SObject names. */
const KIND_LABELS: Record<Kind, string> = {
    permissionSet: 'permission set',
    permissionSetGroup: 'permission set group',
    permissionSetLicense: 'permission set license',
};

export const KINDS = Object.keys(KIND_LABELS) as Kind[];

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
            findings.push({ level: 'error', code: 'USER_NOT_FOUND', message: `${username}: user not found in org` });
        } else if (!user.isActive) {
            findings.push({ level: 'error', code: 'USER_INACTIVE', message: `${username}: user is inactive` });
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
    const label = KIND_LABELS[kind];

    const counts = new Map<string, number>();
    for (const name of found) {
        const key = name.toLowerCase();
        counts.set(key, (counts.get(key) ?? 0) + 1);
    }

    const findings: Finding[] = [];
    for (const target of declared) {
        const count = counts.get(target.toLowerCase()) ?? 0;
        if (count === 0) {
            findings.push({
                level: 'error',
                code: 'TARGET_NOT_FOUND',
                message: `${target}: ${label} not found in org`,
            });
        } else if (count > 1) {
            findings.push({
                level: 'error',
                code: 'TARGET_AMBIGUOUS',
                message: `${target}: ${label} is not unique in org`,
            });
        }
    }
    return findings;
}
