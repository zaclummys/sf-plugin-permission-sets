import { ActualAssignment, AssignmentUpdate, DesiredAssignment, Diff, ReconcileMode } from './model.js';

/** A diff scoped to one mode: what it acts on, and the drift it deliberately leaves alone. */
export type ScopedChange = {
    additions: DesiredAssignment[];
    updates: AssignmentUpdate[];
    removals: ActualAssignment[];
    drift: { adds: number; updates: number; removes: number };
};

/**
 * Split a diff into what the chosen mode acts on versus the drift it leaves alone.
 * additive skips removals, destructive skips adds and updates, sync acts on all.
 */
export function scopeToMode(diff: Diff, mode: ReconcileMode): ScopedChange {
    const additions = mode === 'destructive' ? [] : diff.toAdd;
    const updates = mode === 'destructive' ? [] : diff.toUpdate;
    const removals = mode === 'additive' ? [] : diff.toRemove;
    const drift = {
        adds: mode === 'destructive' ? diff.toAdd.length : 0,
        updates: mode === 'destructive' ? diff.toUpdate.length : 0,
        removes: mode === 'additive' ? diff.toRemove.length : 0,
    };

    return { additions, updates, removals, drift };
}
