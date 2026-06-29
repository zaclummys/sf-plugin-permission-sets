import { Diff, Kind } from './model.js';
import { kindKeys } from './normalize.js';

type DiffBucket = {
    adds: Map<string, string | undefined>;
    updates: Map<string, string | undefined>;
    removes: Set<string>;
    unchanged: Map<string, string | undefined>;
};

function bucketFor(byKind: Map<Kind, Map<string, DiffBucket>>, kind: Kind, target: string): DiffBucket {
    let byTarget = byKind.get(kind);
    if (!byTarget) {
        byTarget = new Map();
        byKind.set(kind, byTarget);
    }

    let bucket = byTarget.get(target);
    if (!bucket) {
        bucket = { adds: new Map(), updates: new Map(), removes: new Set(), unchanged: new Map() };
        byTarget.set(target, bucket);
    }
    return bucket;
}

/** An assignee line, annotated with its expiration when there is one. */
function withExpiry(assignee: string, expiration: string | undefined): string {
    return expiration ? `${assignee} (expires ${expiration})` : assignee;
}

/**
 * Render a diff as a plan, grouped by kind then target, with `+` adds, `~` expiration
 * updates, `-` removes, and `=` unchanged. Timed grants carry their expiration. Shared
 * by plan and apply.
 */
export function formatDiff(diff: Diff): string[] {
    const byKind = new Map<Kind, Map<string, DiffBucket>>();
    for (const assignment of diff.toAdd) {
        bucketFor(byKind, assignment.kind, assignment.target).adds.set(assignment.assignee, assignment.expiration);
    }
    for (const update of diff.toUpdate) {
        bucketFor(byKind, update.kind, update.target).updates.set(update.assignee, update.expiration);
    }
    for (const assignment of diff.toRemove) {
        bucketFor(byKind, assignment.kind, assignment.target).removes.add(assignment.assignee);
    }
    for (const assignment of diff.unchanged) {
        bucketFor(byKind, assignment.kind, assignment.target).unchanged.set(assignment.assignee, assignment.expiration);
    }

    const lines: string[] = [];
    for (const [kind, scopeKey] of kindKeys) {
        const byTarget = byKind.get(kind);
        if (!byTarget) continue;

        lines.push(`${scopeKey}:`);
        for (const [target, bucket] of [...byTarget].sort((left, right) => left[0].localeCompare(right[0]))) {
            lines.push(`  ${target}`);
            for (const assignee of [...bucket.adds.keys()].sort()) {
                lines.push(`    + ${withExpiry(assignee, bucket.adds.get(assignee))}`);
            }
            for (const assignee of [...bucket.updates.keys()].sort()) {
                const expiration = bucket.updates.get(assignee);
                lines.push(`    ~ ${expiration ? withExpiry(assignee, expiration) : `${assignee} (expiry cleared)`}`);
            }
            for (const assignee of [...bucket.removes].sort()) lines.push(`    - ${assignee}`);
            for (const assignee of [...bucket.unchanged.keys()].sort()) {
                lines.push(`    = ${withExpiry(assignee, bucket.unchanged.get(assignee))}`);
            }
        }
    }
    return lines;
}
