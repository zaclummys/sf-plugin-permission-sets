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

/**
 * The managed set for the membership sObject: the declared targets, plus the users a file
 * declares that kind for. Ids rather than names, because this runs after resolution.
 */
export type MembershipScope = {
    permissionSetIds: string[];
    groupIds: string[];
    permissionSetAssigneeIds: string[];
    groupAssigneeIds: string[];
};

/** Full membership SOQL for the current assignments of the given permission set and group ids. */
export function buildCurrentMembershipQuery(scope: MembershipScope): string {
    const clauses: string[] = [];

    if (scope.permissionSetIds.length > 0) {
        clauses.push(`PermissionSetId IN(${buildInList(scope.permissionSetIds)})`);
    }
    if (scope.groupIds.length > 0) {
        clauses.push(`PermissionSetGroupId IN(${buildInList(scope.groupIds)})`);
    }
    // A user managed for one kind is not managed for the other, and one sObject holds both:
    // the null test on the group id is what tells a permission set row from a group row.
    if (scope.permissionSetAssigneeIds.length > 0) {
        clauses.push(
            `(AssigneeId IN(${buildInList(scope.permissionSetAssigneeIds)}) AND PermissionSetGroupId = null)`,
        );
    }
    if (scope.groupAssigneeIds.length > 0) {
        clauses.push(`(AssigneeId IN(${buildInList(scope.groupAssigneeIds)}) AND PermissionSetGroupId != null)`);
    }

    // Every user carries the permission set behind their profile, and it is not assignable:
    // reading a user's rows without excluding it would offer to remove their profile.
    return `
        SELECT
            Id,
            Assignee.Username,
            PermissionSet.Name,
            PermissionSetGroup.DeveloperName,
            PermissionSetGroupId,
            ExpirationDate
        FROM PermissionSetAssignment
        WHERE PermissionSet.IsOwnedByProfile = false
        AND (${clauses.join(' OR ')})
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
export function buildCurrentLicenseQuery(licenseIds: string[], assigneeIds: string[]): string {
    const clauses: string[] = [];

    if (licenseIds.length > 0) {
        clauses.push(`PermissionSetLicenseId IN(${buildInList(licenseIds)})`);
    }
    if (assigneeIds.length > 0) {
        clauses.push(`AssigneeId IN(${buildInList(assigneeIds)})`);
    }

    return `
        SELECT
            Id,
            Assignee.Username,
            PermissionSetLicense.DeveloperName
        FROM PermissionSetLicenseAssign
        WHERE ${clauses.join(' OR ')}
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
