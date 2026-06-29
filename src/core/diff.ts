import { ActualAssignment, AssignmentUpdate, DesiredAssignment, Diff, Kind } from './model.js';

/** Case-insensitive key for an (assignee, kind, target) tuple, matching how the org compares them. */
function assignmentKey(assignee: string, kind: Kind, target: string): string {
    return `${assignee.toLowerCase()} ${kind} ${target.toLowerCase()}`;
}

/** Whether two expirations name the same instant. Both absent counts as equal. */
function sameExpiration(left: string | undefined, right: string | undefined): boolean {
    if (!left || !right) {
        return left === right;
    }
    return Date.parse(left) === Date.parse(right);
}

/**
 * Compare the desired assignments against the org's current memberships of the
 * managed targets. `actual` must hold only assignments for targets that appear
 * in `desired` (the managed set), so any actual row not in `desired` is an
 * undeclared assignment eligible for removal. A declared assignment whose
 * expiration differs from the org's is an update rather than unchanged.
 */
export function diffAssignments(desired: DesiredAssignment[], actual: ActualAssignment[]): Diff {
    const actualByKey = new Map<string, ActualAssignment>();
    for (const assignment of actual) {
        actualByKey.set(assignmentKey(assignment.assignee, assignment.kind, assignment.target), assignment);
    }

    const desiredKeys = new Set<string>();
    const toAdd: DesiredAssignment[] = [];
    const toUpdate: AssignmentUpdate[] = [];
    const unchanged: ActualAssignment[] = [];

    for (const assignment of desired) {
        const key = assignmentKey(assignment.assignee, assignment.kind, assignment.target);
        if (desiredKeys.has(key)) continue;
        desiredKeys.add(key);

        const existing = actualByKey.get(key);
        if (!existing) {
            toAdd.push(assignment);
        } else if (sameExpiration(existing.expiration, assignment.expiration)) {
            unchanged.push(existing);
        } else {
            toUpdate.push({
                recordId: existing.recordId,
                assignee: existing.assignee,
                kind: existing.kind,
                target: existing.target,
                expiration: assignment.expiration,
            });
        }
    }

    const toRemove = actual.filter(
        (assignment) => !desiredKeys.has(assignmentKey(assignment.assignee, assignment.kind, assignment.target))
    );

    return { toAdd, toUpdate, toRemove, unchanged };
}
