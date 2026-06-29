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

/**
 * Turn a validated file into canonical (assignee, kind, target) tuples, and
 * emit the structural findings: duplicate targets, empty lists, empty users.
 */
export function normalize(data: FileShape, file: string): { assignments: DesiredAssignment[]; findings: Finding[] } {
    const assignments: DesiredAssignment[] = [];
    const findings: Finding[] = [];

    for (const [username, entry] of Object.entries(data.users)) {
        let scopeCount = 0;

        for (const [kind, key] of kindKeys) {
            const list = entry[key];
            if (list === undefined) continue;
            if (list.length === 0) {
                findings.push(emptyListWarning(username, key, file));
                continue;
            }

            scopeCount += 1;
            const seen = new Set<string>();
            for (const item of list) {
                const target = typeof item === 'string' ? item : item.name;
                const expiration = typeof item === 'string' ? undefined : item.expiration;
                if (seen.has(target)) {
                    findings.push(dupTargetWarning(username, target, key, file));
                    continue;
                }
                seen.add(target);
                assignments.push({ assignee: username, kind, target, ...(expiration ? { expiration } : {}) });
            }
        }

        if (scopeCount === 0) {
            findings.push(emptyUserWarning(username, file));
        }
    }

    return { assignments, findings };
}
