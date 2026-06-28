import { FileShape } from './schema.js';
import { DesiredAssignment, Finding, Kind } from './model.js';

type ScopeKey = 'permissionSets' | 'permissionSetGroups' | 'permissionSetLicenses';

const kindKeys: Array<[Kind, ScopeKey]> = [
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
                findings.push({ level: 'warning', code: 'EMPTY_LIST', message: `${username}: ${key} is empty`, file });
                continue;
            }

            scopeCount += 1;
            const seen = new Set<string>();
            for (const target of list) {
                if (seen.has(target)) {
                    findings.push({
                        level: 'warning',
                        code: 'DUP_TARGET',
                        message: `${username}: ${target} is listed twice under ${key}`,
                        file,
                    });
                    continue;
                }
                seen.add(target);
                assignments.push({ assignee: username, kind, target });
            }
        }

        if (scopeCount === 0) {
            findings.push({ level: 'warning', code: 'EMPTY_USER', message: `${username}: no scopes declared`, file });
        }
    }

    return { assignments, findings };
}
