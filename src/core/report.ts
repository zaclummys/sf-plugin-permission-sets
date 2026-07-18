import { Diff, Kind, ReconcileMode } from './model.js';
import { kindKeys } from './normalize.js';

type DiffBucket = {
    adds: Map<string, string | undefined>;
    updates: Map<string, { previous: string | undefined; next: string | undefined }>;
    removes: Set<string>;
    unchanged: Map<string, string | undefined>;
};

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
function withExpiry(assignee: string, expiration: string | undefined): string {
    return expiration ? `${assignee}   expires ${canonicalExpiration(expiration)}` : assignee;
}

/** An update line showing the expiration transition, with `never` standing in for no expiration. */
function withTransition(assignee: string, previous: string | undefined, next: string | undefined): string {
    const from = previous ? canonicalExpiration(previous) : 'never';
    const to = next ? canonicalExpiration(next) : 'never';
    return `${assignee}   expires ${from} → ${to}`;
}

/** Group a diff into per-kind, per-target buckets, keeping only the operations the mode shows. */
function collectBuckets(diff: Diff, options: ReportOptions): Map<Kind, Map<string, DiffBucket>> {
    const showAdditive = options.mode !== 'destructive';
    const showDestructive = options.mode !== 'additive';

    const byKind = new Map<Kind, Map<string, DiffBucket>>();
    if (showAdditive) {
        for (const assignment of diff.toAdd) {
            bucketFor(byKind, assignment.kind, assignment.target).adds.set(assignment.assignee, assignment.expiration);
        }
        for (const update of diff.toUpdate) {
            bucketFor(byKind, update.kind, update.target).updates.set(update.assignee, {
                previous: update.previousExpiration,
                next: update.expiration,
            });
        }
    }
    if (showDestructive) {
        for (const assignment of diff.toRemove) {
            bucketFor(byKind, assignment.kind, assignment.target).removes.add(assignment.assignee);
        }
    }
    if (options.showUnchanged) {
        for (const assignment of diff.unchanged) {
            bucketFor(byKind, assignment.kind, assignment.target).unchanged.set(
                assignment.assignee,
                assignment.expiration
            );
        }
    }
    return byKind;
}

/** The `+`/`~`/`-`/`=` lines for one target, each group sorted by assignee. Empty when nothing shows. */
function renderBucket(bucket: DiffBucket): string[] {
    const entries: string[] = [];
    for (const assignee of [...bucket.adds.keys()].sort()) {
        entries.push(`    + ${withExpiry(assignee, bucket.adds.get(assignee))}`);
    }
    for (const assignee of [...bucket.updates.keys()].sort()) {
        const change = bucket.updates.get(assignee)!;
        entries.push(`    ~ ${withTransition(assignee, change.previous, change.next)}`);
    }
    for (const assignee of [...bucket.removes].sort()) entries.push(`    - ${assignee}`);
    for (const assignee of [...bucket.unchanged.keys()].sort()) {
        entries.push(`    = ${withExpiry(assignee, bucket.unchanged.get(assignee))}`);
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

        const sorted = [...byTarget].sort((left, right) => left[0].localeCompare(right[0]));
        const targetLines: string[] = [];
        for (const [target, bucket] of sorted) {
            const entries = renderBucket(bucket);
            if (entries.length === 0) continue;
            targetLines.push(`  ${target}`, ...entries);
        }

        if (targetLines.length === 0) continue;
        lines.push(kindLabels[kind], ...targetLines);
    }
    return lines;
}
