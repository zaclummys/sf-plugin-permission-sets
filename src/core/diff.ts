import { ActualAssignment, AssignmentUpdate, DesiredAssignment, Kind, ReconcileMode } from './model.js';
import { TargetName } from './target-name.js';
import { Username } from './username.js';

/** What a mode deliberately leaves alone, reported beneath a plan as drift. */
export type Drift = { adds: number; updates: number; removes: number };

/** A diff narrowed to one mode: what that mode acts on, and the drift it leaves behind. */
export class ScopedChange {
    public constructor(
        public readonly additions: DesiredAssignment[],
        public readonly updates: AssignmentUpdate[],
        public readonly removals: ActualAssignment[],
        public readonly drift: Drift
    ) {}

    /** How many assignments this mode would act on. */
    public get count(): number {
        return this.additions.length + this.updates.length + this.removals.length;
    }

    /** How many distinct users this mode would touch. */
    public get usersAffected(): number {
        const acted = [
            ...this.additions,
            ...this.updates,
            ...this.removals,
        ];
        const assignees = new Set(acted.map((assignment) => assignment.assignee.asKey()));

        return assignees.size;
    }
}

/** The change set between the desired model and the org's current state. */
export class Diff {
    public constructor(
        public readonly toAdd: DesiredAssignment[],
        public readonly toUpdate: AssignmentUpdate[],
        public readonly toRemove: ActualAssignment[],
        public readonly unchanged: ActualAssignment[]
    ) {}

    /** The diff of a run that aborted before it ever reached the org. */
    public static empty(): Diff {
        return new Diff([], [], [], []);
    }

    /** How many assignments differ, whatever the mode would act on. */
    public get changeCount(): number {
        return this.toAdd.length + this.toUpdate.length + this.toRemove.length;
    }

    /**
     * Narrow the diff to what the chosen mode acts on: additive skips removals,
     * destructive skips adds and updates, sync acts on all. Whatever the mode skips
     * comes back as drift, so plan and apply report it rather than hiding it.
     */
    public scopeTo(mode: ReconcileMode): ScopedChange {
        const additions = mode === 'destructive' ? [] : this.toAdd;
        const updates = mode === 'destructive' ? [] : this.toUpdate;
        const removals = mode === 'additive' ? [] : this.toRemove;
        const drift = {
            adds: mode === 'destructive' ? this.toAdd.length : 0,
            updates: mode === 'destructive' ? this.toUpdate.length : 0,
            removes: mode === 'additive' ? this.toRemove.length : 0,
        };

        return new ScopedChange(additions, updates, removals, drift);
    }
}

/** Key for an (assignee, kind, target) tuple, off the identifiers' own comparison keys. */
function assignmentKey(assignee: Username, kind: Kind, target: TargetName): string {
    return `${assignee.asKey()} ${kind} ${target.asKey()}`;
}

/** Whether two expirations name the same instant. Both absent (null) counts as equal. */
function sameExpiration(left: string | null, right: string | null): boolean {
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
                previousExpiration: existing.expiration,
            });
        }
    }

    const toRemove = actual.filter(
        (assignment) => !desiredKeys.has(assignmentKey(assignment.assignee, assignment.kind, assignment.target))
    );

    return new Diff(toAdd, toUpdate, toRemove, unchanged);
}
