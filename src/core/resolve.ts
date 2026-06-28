import { DesiredAssignment, Finding, Kind } from './model.js';

type KindResolution = { sobject: string; field: 'Name' | 'DeveloperName'; label: string };

/** How each declarable target maps to the org object and field that names it. */
const KIND_RESOLUTION: Record<Kind, KindResolution> = {
    permissionSet: { sobject: 'PermissionSet', field: 'Name', label: 'permission set' },
    permissionSetGroup: { sobject: 'PermissionSetGroup', field: 'DeveloperName', label: 'permission set group' },
    permissionSetLicense: { sobject: 'PermissionSetLicense', field: 'DeveloperName', label: 'permission set license' },
};

type UserRow = { Username: string; IsActive: boolean };
type TargetRow = { Name?: string; DeveloperName?: string };

/** A SOQL query paired with the pure function that turns its rows into findings. */
export type ResolutionStep = {
    soql: string;
    evaluate: (rows: unknown[]) => Finding[];
};

/** Escape a value for safe inclusion in a SOQL string literal. */
function soqlLiteral(value: string): string {
    return value.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

/** Build a comma-separated, quoted IN list from the values. */
function inList(values: string[]): string {
    return values.map((value) => `'${soqlLiteral(value)}'`).join(', ');
}

function distinct(values: string[]): string[] {
    return [...new Set(values)];
}

/** Count how many rows carry each value of a field, keyed case-insensitively (SOQL matches that way). */
function countByField(rows: TargetRow[], field: KindResolution['field']): Map<string, number> {
    const counts = new Map<string, number>();
    for (const row of rows) {
        const value = (row[field] ?? '').toLowerCase();
        counts.set(value, (counts.get(value) ?? 0) + 1);
    }
    return counts;
}

/** Every declared user must exist and be active. */
function evaluateUsers(usernames: string[], rows: UserRow[]): Finding[] {
    const byName = new Map<string, UserRow>();
    for (const row of rows) {
        byName.set(row.Username.toLowerCase(), row);
    }

    const findings: Finding[] = [];
    for (const username of usernames) {
        const row = byName.get(username.toLowerCase());
        if (!row) {
            findings.push({ level: 'error', code: 'USER_NOT_FOUND', message: `${username}: user not found in org` });
        } else if (!row.IsActive) {
            findings.push({ level: 'error', code: 'USER_INACTIVE', message: `${username}: user is inactive` });
        }
    }
    return findings;
}

/** Every target of one kind must exist exactly once in the org. */
function evaluateTargets(kind: Kind, targets: string[], rows: TargetRow[]): Finding[] {
    const { field, label } = KIND_RESOLUTION[kind];
    const counts = countByField(rows, field);

    const findings: Finding[] = [];
    for (const target of targets) {
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

/**
 * Plan the org queries needed to resolve these assignments, each paired with the
 * pure evaluator for its rows. The online half of validate, kept free of any org
 * connection: the service runs the SOQL and feeds the rows back to evaluate.
 */
export function planResolution(assignments: DesiredAssignment[]): ResolutionStep[] {
    const steps: ResolutionStep[] = [];
    const usernames = distinct(assignments.map((assignment) => assignment.assignee));

    if (usernames.length > 0) {
        steps.push({
            soql: `SELECT Username, IsActive FROM User WHERE Username IN (${inList(usernames)})`,
            evaluate: (rows) => evaluateUsers(usernames, rows as UserRow[]),
        });
    }

    for (const kind of Object.keys(KIND_RESOLUTION) as Kind[]) {
        const { sobject, field } = KIND_RESOLUTION[kind];
        const targets = distinct(
            assignments.filter((assignment) => assignment.kind === kind).map((assignment) => assignment.target)
        );

        if (targets.length > 0) {
            steps.push({
                soql: `SELECT ${field} FROM ${sobject} WHERE ${field} IN (${inList(targets)})`,
                evaluate: (rows) => evaluateTargets(kind, targets, rows as TargetRow[]),
            });
        }
    }

    return steps;
}
