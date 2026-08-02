import { TargetName, Username } from '../core/index.js';

/** Escape a value for safe inclusion in a SOQL string literal. */
function escapeSoqlLiteral(value: string): string {
    return value.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

/** Build a comma-separated, quoted IN list from the values. */
function buildInList(values: string[]): string {
    return values.map((value) => `'${escapeSoqlLiteral(value)}'`).join(', ');
}

/** The same, for the identifiers the port speaks in. The org compares them case-insensitively. */
function buildNameList(values: { toString(): string }[]): string {
    return buildInList(values.map((value) => value.toString()));
}

/** Full membership SOQL for the active, non-profile-owned assignments matching the filter. */
export function buildMembershipQuery(
    usernames: Username[] | undefined,
    wantsPermissionSet: boolean,
    wantsGroup: boolean,
): string {
    const clauses = [
        'Assignee.IsActive = true',
        'PermissionSet.IsOwnedByProfile = false',
    ];

    if (usernames) {
        clauses.push(`Assignee.Username IN(${buildNameList(usernames)})`);
    }
    if (!wantsGroup) {
        clauses.push('PermissionSetGroupId = null');
    }
    if (!wantsPermissionSet) {
        clauses.push('PermissionSetGroupId != null');
    }

    return `
        SELECT
            Id,
            Assignee.Username,
            PermissionSet.Name,
            PermissionSetGroup.DeveloperName,
            PermissionSetGroupId,
            ExpirationDate
        FROM PermissionSetAssignment
        WHERE ${clauses.join(' AND ')}
    `;
}

/** Full membership SOQL for the current assignments of the given permission set and group ids. */
export function buildCurrentMembershipQuery(permissionSetIds: string[], groupIds: string[]): string {
    const clauses: string[] = [];

    if (permissionSetIds.length > 0) {
        clauses.push(`PermissionSetId IN(${buildInList(permissionSetIds)})`);
    }
    if (groupIds.length > 0) {
        clauses.push(`PermissionSetGroupId IN(${buildInList(groupIds)})`);
    }

    return `
        SELECT
            Id,
            Assignee.Username,
            PermissionSet.Name,
            PermissionSetGroup.DeveloperName,
            PermissionSetGroupId,
            ExpirationDate
        FROM PermissionSetAssignment
        WHERE ${clauses.join(' OR ')}
    `;
}

/** Full license SOQL for the active assignments matching the filter. */
export function buildLicenseQuery(usernames: Username[] | undefined): string {
    const clauses = ['Assignee.IsActive = true'];

    if (usernames) {
        clauses.push(`Assignee.Username IN(${buildNameList(usernames)})`);
    }

    return `
        SELECT
            Id,
            Assignee.Username,
            PermissionSetLicense.DeveloperName
        FROM PermissionSetLicenseAssign
        WHERE ${clauses.join(' AND ')}
    `;
}

/** Full license SOQL for the current assignments of the given license ids. */
export function buildCurrentLicenseQuery(licenseIds: string[]): string {
    return `
        SELECT
            Id,
            Assignee.Username,
            PermissionSetLicense.DeveloperName
        FROM PermissionSetLicenseAssign
        WHERE PermissionSetLicenseId IN(${buildInList(licenseIds)})
    `;
}

/** Full SOQL for the users with the given usernames. */
export function buildUserQuery(usernames: Username[]): string {
    return `
        SELECT
            Id,
            Username,
            IsActive
        FROM User
        WHERE Username IN(${buildNameList(usernames)})
    `;
}

/** Full SOQL for the permission sets with the given names. */
export function buildPermissionSetQuery(names: TargetName[]): string {
    return `
        SELECT
            Id,
            Name
        FROM PermissionSet
        WHERE Name IN(${buildNameList(names)})
    `;
}

/** Full SOQL for the permission set groups with the given developer names. */
export function buildPermissionSetGroupQuery(names: TargetName[]): string {
    return `
        SELECT
            Id,
            DeveloperName
        FROM PermissionSetGroup
        WHERE DeveloperName IN(${buildNameList(names)})
    `;
}

/** Full SOQL for the permission set licenses with the given developer names. */
export function buildPermissionSetLicenseQuery(names: TargetName[]): string {
    return `
        SELECT
            Id,
            DeveloperName
        FROM PermissionSetLicense
        WHERE DeveloperName IN(${buildNameList(names)})
    `;
}
