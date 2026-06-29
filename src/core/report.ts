import { Diff, Kind } from './model.js';
import { kindKeys } from './normalize.js';

type DiffBucket = { adds: Set<string>; removes: Set<string>; unchanged: Set<string> };

function bucketFor(byKind: Map<Kind, Map<string, DiffBucket>>, kind: Kind, target: string): DiffBucket {
    let byTarget = byKind.get(kind);
    if (!byTarget) {
        byTarget = new Map();
        byKind.set(kind, byTarget);
    }

    let bucket = byTarget.get(target);
    if (!bucket) {
        bucket = { adds: new Set(), removes: new Set(), unchanged: new Set() };
        byTarget.set(target, bucket);
    }
    return bucket;
}

/**
 * Render a diff as a plan, grouped by kind then target, with `+` adds, `-` removes,
 * and `=` unchanged. Shared by plan and apply.
 */
export function formatDiff(diff: Diff): string[] {
    const byKind = new Map<Kind, Map<string, DiffBucket>>();
    for (const assignment of diff.toAdd) {
        bucketFor(byKind, assignment.kind, assignment.target).adds.add(assignment.assignee);
    }
    for (const assignment of diff.toRemove) {
        bucketFor(byKind, assignment.kind, assignment.target).removes.add(assignment.assignee);
    }
    for (const assignment of diff.unchanged) {
        bucketFor(byKind, assignment.kind, assignment.target).unchanged.add(assignment.assignee);
    }

    const lines: string[] = [];
    for (const [kind, scopeKey] of kindKeys) {
        const byTarget = byKind.get(kind);
        if (!byTarget) continue;

        lines.push(`${scopeKey}:`);
        for (const [target, bucket] of [...byTarget].sort((left, right) => left[0].localeCompare(right[0]))) {
            lines.push(`  ${target}`);
            for (const assignee of [...bucket.adds].sort()) lines.push(`    + ${assignee}`);
            for (const assignee of [...bucket.removes].sort()) lines.push(`    - ${assignee}`);
            for (const assignee of [...bucket.unchanged].sort()) lines.push(`    = ${assignee}`);
        }
    }
    return lines;
}
