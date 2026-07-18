import { FileShape } from './schema.js';
import { DesiredAssignment, Kind } from './model.js';
import { Finding, emptyListWarning, dupTargetWarning, emptyUserWarning } from './finding.js';

export type ScopeKey = 'permissionSets' | 'permissionSetGroups' | 'permissionSetLicenses';

/** The (kind, file scope key) pairing, in canonical order. Shared with serialize. */
export const kindKeys: Array<[Kind, ScopeKey]> = [
    ['permissionSet', 'permissionSets'],
    ['permissionSetGroup', 'permissionSetGroups'],
    ['permissionSetLicense', 'permissionSetLicenses'],
];

/** Map a file scope key back to its internal kind, so the CLI never leaks SObject names. */
export function kindForScopeKey(key: ScopeKey): Kind {
    const pair = kindKeys.find(([, scopeKey]) => scopeKey === key);
    if (!pair) throw new Error(`Unknown scope key: ${key}`);

    return pair[0];
}

type ScopeItem = string | { name: string; expiration: string };

function normalizeScope(
    username: string,
    kind: Kind,
    key: ScopeKey,
    list: ScopeItem[],
    file: string,
): { assignments: DesiredAssignment[]; findings: Finding[] } {
    const items = list.map((item) => ({
        target: typeof item === 'string' ? item : item.name,
        expiration: typeof item === 'string' ? undefined : item.expiration,
    }));

    const assignments: DesiredAssignment[] = [];
    const findings: Finding[] = [];
    const seen = new Set<string>();

    for (const { target, expiration } of items) {
        if (seen.has(target)) {
            findings.push(dupTargetWarning(username, target, key, file));
            continue;
        }
        seen.add(target);
        assignments.push({ assignee: username, kind, target, ...(expiration ? { expiration } : {}) });
    }

    return { assignments, findings };
}

function normalizeUser(
    username: string,
    entry: FileShape['users'][string],
    file: string,
): { assignments: DesiredAssignment[]; findings: Finding[] } {
    const assignments: DesiredAssignment[] = [];
    const findings: Finding[] = [];
    let scopeCount = 0;

    for (const [kind, key] of kindKeys) {
        const list = entry[key];
        if (!list) continue;
        if (list.length === 0) {
            findings.push(emptyListWarning(username, key, file));
            continue;
        }

        scopeCount += 1;
        const scope = normalizeScope(username, kind, key, list, file);
        assignments.push(...scope.assignments);
        findings.push(...scope.findings);
    }

    if (scopeCount === 0) {
        findings.push(emptyUserWarning(username, file));
    }

    return { assignments, findings };
}

/**
 * Turn a validated file into canonical (assignee, kind, target) tuples, and
 * emit the structural findings: duplicate targets, empty lists, empty users.
 */
export function normalize(data: FileShape, file: string): { assignments: DesiredAssignment[]; findings: Finding[] } {
    const assignments: DesiredAssignment[] = [];
    const findings: Finding[] = [];

    for (const [username, entry] of Object.entries(data.users)) {
        const user = normalizeUser(username, entry, file);
        assignments.push(...user.assignments);
        findings.push(...user.findings);
    }

    return { assignments, findings };
}
