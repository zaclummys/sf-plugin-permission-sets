import { Kind } from './model.js';

/** What a scope is called in a file, as against the internal `Kind` it maps to. */
export type ScopeKey = 'permissionSets' | 'permissionSetGroups' | 'permissionSetLicenses';

/**
 * The (kind, file scope key) pairing, in canonical order, and the single place that pairing
 * is written down. It lives here rather than in any one of its callers because three of them
 * depend on it equally: `normalize` reads a file through it, `serialize` writes one back
 * through it, and `report` orders the diff body by it. Adding a scope means adding a row.
 */
export const kindKeys: [Kind, ScopeKey][] = [
    [
        'permissionSet',
        'permissionSets',
    ],
    [
        'permissionSetGroup',
        'permissionSetGroups',
    ],
    [
        'permissionSetLicense',
        'permissionSetLicenses',
    ],
];

/**
 * Every kind, in canonical order. Derived from the pairing above rather than written out
 * again, so adding a scope is still one row and no second list can fall out of step with it.
 */
export const kinds: Kind[] = kindKeys.map(([kind]) => kind);

/** Map a file scope key back to its internal kind, so the CLI never leaks SObject names. */
export function kindForScopeKey(key: ScopeKey): Kind {
    const pair = kindKeys.find(([
        , scopeKey,
    ]) => scopeKey === key);

    if (!pair) {
        throw new Error(`Unknown scope key: ${key}`);
    }

    return pair[0];
}
