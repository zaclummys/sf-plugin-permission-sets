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

/**
 * The pairing again, indexed the other way. Derived rather than written out, so adding a
 * scope is still one row above, and a lookup rather than a search so there is no missing
 * case to answer for: `ScopeKey` is closed, so every key has a row.
 */
const kindByScopeKey = Object.fromEntries(
    kindKeys.map(([
        kind,
        scopeKey,
    ]) => [
        scopeKey,
        kind,
    ]),
) as Record<ScopeKey, Kind>;

/** Map a file scope key back to its internal kind, so the CLI never leaks SObject names. */
export function kindForScopeKey(key: ScopeKey): Kind {
    return kindByScopeKey[key];
}
