import { ActualAssignment, DesiredAssignment, Diff, Kind } from './model.js';

/** Case-insensitive key for an (assignee, kind, target) tuple, matching how the org compares them. */
function assignmentKey(assignee: string, kind: Kind, target: string): string {
    return `${assignee.toLowerCase()} ${kind} ${target.toLowerCase()}`;
}

/**
 * Compare the desired assignments against the org's current memberships of the
 * managed targets. `actual` must hold only assignments for targets that appear
 * in `desired` (the managed set), so any actual row not in `desired` is an
 * undeclared assignment eligible for removal.
 */
export function diffAssignments(desired: DesiredAssignment[], actual: ActualAssignment[]): Diff {
    const actualByKey = new Map<string, ActualAssignment>();
    for (const assignment of actual) {
        actualByKey.set(assignmentKey(assignment.assignee, assignment.kind, assignment.target), assignment);
    }

    const desiredKeys = new Set<string>();
    const toAdd: DesiredAssignment[] = [];
    const unchanged: ActualAssignment[] = [];

    for (const assignment of desired) {
        const key = assignmentKey(assignment.assignee, assignment.kind, assignment.target);
        if (desiredKeys.has(key)) continue;
        desiredKeys.add(key);

        const existing = actualByKey.get(key);
        if (existing) {
            unchanged.push(existing);
        } else {
            toAdd.push(assignment);
        }
    }

    const toRemove = actual.filter(
        (assignment) => !desiredKeys.has(assignmentKey(assignment.assignee, assignment.kind, assignment.target))
    );

    return { toAdd, toRemove, unchanged };
}
