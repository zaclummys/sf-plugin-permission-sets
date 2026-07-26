import { Diff } from './diff.js';
import { Expiration } from './expiration.js';
import { Kind, ReconcileMode } from './model.js';
import { kindKeys } from './normalize.js';
import { TargetName } from './target-name.js';

/**
 * One target's lines, grouped by operation and keyed by the assignee as it is spelled.
 * Each group has a single source (adds come from the files, the rest from the org), so
 * within a group one user is spelled one way.
 */
type DiffBucket = {
    adds: Map<string, Expiration | null>;
    updates: Map<string, { previous: Expiration | null; next: Expiration | null }>;
    removes: Set<string>;
    unchanged: Map<string, Expiration | null>;
};

/** A target's bucket plus the name to print it under, since the map is keyed by comparison key. */
type TargetBucket = { target: TargetName; bucket: DiffBucket };

/** Human labels for the section headers, so the plan reads as prose, not YAML keys. */
const kindLabels: Record<Kind, string> = {
    permissionSet: 'Permission Sets',
    permissionSetGroup: 'Permission Set Groups',
    permissionSetLicense: 'Permission Set Licenses',
};

/** What the report shows: the mode selects which operations, plus whether to list unchanged. */
type ReportOptions = {
    mode: ReconcileMode;
    showUnchanged: boolean;
};

function bucketFor(byKind: Map<Kind, Map<string, TargetBucket>>, kind: Kind, target: TargetName): DiffBucket {
    let byTarget = byKind.get(kind);
    if (!byTarget) {
        byTarget = new Map();
        byKind.set(kind, byTarget);
    }

    let entry = byTarget.get(target.asKey());
    if (!entry) {
        const bucket = { adds: new Map(), updates: new Map(), removes: new Set<string>(), unchanged: new Map() };

        entry = { target, bucket };
        byTarget.set(target.asKey(), entry);
    }
    return entry.bucket;
}

/** An assignee line suffixed with its expiration when there is one. */
function withExpiry(assignee: string, expiration: Expiration | null): string {
    if (!expiration) {
        return assignee;
    }

    return `${assignee}   expires ${expiration.toString()}`;
}

/**
 * An expiration for display, with `never` standing in for no expiration. Both sides of a
 * transition print through Expiration, so a value from the org and one from a file read
 * identically side by side however each was spelled.
 */
function expiryOrNever(expiration: Expiration | null): string {
    if (!expiration) {
        return 'never';
    }

    return expiration.toString();
}

/** An update line showing the expiration transition, with `never` standing in for no expiration. */
function withTransition(assignee: string, previous: Expiration | null, next: Expiration | null): string {
    const from = expiryOrNever(previous);
    const to = expiryOrNever(next);

    return `${assignee}   expires ${from} → ${to}`;
}

/** Group a diff into per-kind, per-target buckets, keeping only the operations the mode shows. */
function collectBuckets(diff: Diff, options: ReportOptions): Map<Kind, Map<string, TargetBucket>> {
    const showAdditive = options.mode !== 'destructive';
    const showDestructive = options.mode !== 'additive';

    const byKind = new Map<Kind, Map<string, TargetBucket>>();

    if (showAdditive) {
        for (const assignment of diff.toAdd) {
            const bucket = bucketFor(byKind, assignment.kind, assignment.target);

            bucket.adds.set(assignment.assignee.toString(), assignment.expiration);
        }
        for (const update of diff.toUpdate) {
            const bucket = bucketFor(byKind, update.kind, update.target);

            bucket.updates.set(update.assignee.toString(), {
                previous: update.previousExpiration,
                next: update.expiration,
            });
        }
    }
    if (showDestructive) {
        for (const assignment of diff.toRemove) {
            const bucket = bucketFor(byKind, assignment.kind, assignment.target);

            bucket.removes.add(assignment.assignee.toString());
        }
    }
    if (options.showUnchanged) {
        for (const assignment of diff.unchanged) {
            const bucket = bucketFor(byKind, assignment.kind, assignment.target);

            bucket.unchanged.set(assignment.assignee.toString(), assignment.expiration);
        }
    }
    return byKind;
}

/**
 * A group's entries ordered by assignee. Comparing the keys directly matches how `.sort()`
 * with no comparator orders the removes, so every group keeps the one ordering.
 */
function sortedByAssignee<Value>(group: Map<string, Value>): [string, Value][] {
    const rows = [...group];

    return rows.sort(([leftAssignee], [rightAssignee]) => {
        if (leftAssignee < rightAssignee) {
            return -1;
        }

        return leftAssignee > rightAssignee ? 1 : 0;
    });
}

/** The `+`/`~`/`-`/`=` lines for one target, each group sorted by assignee. Empty when nothing shows. */
function renderBucket(bucket: DiffBucket): string[] {
    const entries: string[] = [];

    for (const [assignee, expiration] of sortedByAssignee(bucket.adds)) {
        entries.push(`    + ${withExpiry(assignee, expiration)}`);
    }
    for (const [assignee, change] of sortedByAssignee(bucket.updates)) {
        entries.push(`    ~ ${withTransition(assignee, change.previous, change.next)}`);
    }
    for (const assignee of [...bucket.removes].sort()) {
        entries.push(`    - ${assignee}`);
    }
    for (const [assignee, expiration] of sortedByAssignee(bucket.unchanged)) {
        entries.push(`    = ${withExpiry(assignee, expiration)}`);
    }
    return entries;
}

/**
 * Render a diff as a plan body, grouped by kind then target, with `+` adds, `~` expiration
 * updates, `-` removes, and `=` unchanged. The mode scopes which operations appear (additive
 * hides removes, destructive hides adds and updates), unchanged lines appear only when asked,
 * and targets with nothing to show are omitted. Shared by plan and apply.
 */
export function formatDiff(diff: Diff, options: ReportOptions): string[] {
    const byKind = collectBuckets(diff, options);

    const lines: string[] = [];

    for (const [kind] of kindKeys) {
        const byTarget = byKind.get(kind);

        if (!byTarget) {
            continue;
        }

        const sorted = [...byTarget.values()].sort((left, right) =>
            left.target.toString().localeCompare(right.target.toString())
        );
        const targetLines: string[] = [];

        for (const { target, bucket } of sorted) {
            const entries = renderBucket(bucket);

            if (entries.length === 0) {
                continue;
            }
            targetLines.push(`  ${target.toString()}`, ...entries);
        }

        if (targetLines.length === 0) {
            continue;
        }
        lines.push(kindLabels[kind], ...targetLines);
    }
    return lines;
}
