import { Diff } from './diff.js';
import { Kind, ReconcileMode } from './model.js';
import { kindKeys } from './normalize.js';
import { TargetName } from './target-name.js';

/**
 * One target's lines, grouped by operation and keyed by the assignee as it is spelled.
 * Each group has a single source (adds come from the files, the rest from the org), so
 * within a group one user is spelled one way.
 */
type DiffBucket = {
    adds: Map<string, string | null>;
    updates: Map<string, { previous: string | null; next: string | null }>;
    removes: Set<string>;
    unchanged: Map<string, string | null>;
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

/**
 * A canonical, readable form of an expiration instant, so values from the org and from the
 * files display identically side by side. Falls back to the raw value if it cannot be parsed.
 */
function canonicalExpiration(value: string): string {
    const parsed = Date.parse(value);
    if (Number.isNaN(parsed)) return value;

    const instant = new Date(parsed);
    return instant.toISOString().replace(/\.\d{3}Z$/, 'Z');
}

/** An assignee line suffixed with its expiration when there is one. */
function withExpiry(assignee: string, expiration: string | null): string {
    if (!expiration) return assignee;

    return `${assignee}   expires ${canonicalExpiration(expiration)}`;
}

/** A canonical expiration for display, with `never` standing in for no expiration. */
function expiryOrNever(expiration: string | null): string {
    if (!expiration) return 'never';

    return canonicalExpiration(expiration);
}

/** An update line showing the expiration transition, with `never` standing in for no expiration. */
function withTransition(assignee: string, previous: string | null, next: string | null): string {
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

/** The `+`/`~`/`-`/`=` lines for one target, each group sorted by assignee. Empty when nothing shows. */
function renderBucket(bucket: DiffBucket): string[] {
    const entries: string[] = [];
    for (const assignee of [...bucket.adds.keys()].sort()) {
        entries.push(`    + ${withExpiry(assignee, bucket.adds.get(assignee) ?? null)}`);
    }
    for (const assignee of [...bucket.updates.keys()].sort()) {
        const change = bucket.updates.get(assignee)!;
        entries.push(`    ~ ${withTransition(assignee, change.previous, change.next)}`);
    }
    for (const assignee of [...bucket.removes].sort()) entries.push(`    - ${assignee}`);
    for (const assignee of [...bucket.unchanged.keys()].sort()) {
        entries.push(`    = ${withExpiry(assignee, bucket.unchanged.get(assignee) ?? null)}`);
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
        if (!byTarget) continue;

        const sorted = [...byTarget.values()].sort((left, right) =>
            left.target.toString().localeCompare(right.target.toString())
        );
        const targetLines: string[] = [];
        for (const { target, bucket } of sorted) {
            const entries = renderBucket(bucket);
            if (entries.length === 0) continue;
            targetLines.push(`  ${target.toString()}`, ...entries);
        }

        if (targetLines.length === 0) continue;
        lines.push(kindLabels[kind], ...targetLines);
    }
    return lines;
}
