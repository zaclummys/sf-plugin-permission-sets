import { Connection } from '@salesforce/core';
import { DesiredAssignment, Kind, OrgUser } from '../core/model.js';
import { OrgClient } from '../services/org-client.js';

type TargetObject = { sobject: string; field: 'Name' | 'DeveloperName' };

/** Shapes of the assignment rows we read back, with relationship fields nested. */
type MembershipRecord = {
    Assignee: { Username: string };
    PermissionSet: { Name: string };
    PermissionSetGroup: { DeveloperName: string } | null;
    PermissionSetGroupId: string | null;
};

type LicenseRecord = {
    Assignee: { Username: string };
    PermissionSetLicense: { DeveloperName: string };
};

/** SObject + naming field per kind. The Salesforce schema knowledge lives here, not in core. */
const targetObjects: Record<Kind, TargetObject> = {
    permissionSet: { sobject: 'PermissionSet', field: 'Name' },
    permissionSetGroup: { sobject: 'PermissionSetGroup', field: 'DeveloperName' },
    permissionSetLicense: { sobject: 'PermissionSetLicense', field: 'DeveloperName' },
};

/** Escape a value for safe inclusion in a SOQL string literal. */
function soqlLiteral(value: string): string {
    return value.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

/** Build a comma-separated, quoted IN list from the values. */
function inList(values: string[]): string {
    return values.map((value) => `'${soqlLiteral(value)}'`).join(', ');
}

/** Adapter backing OrgClient with a Salesforce Connection. autoFetchQuery pages past 2000 rows. */
export class ConnectionOrgClient implements OrgClient {
    public constructor(private readonly connection: Connection) {}

    public async findUsers(usernames: string[]): Promise<OrgUser[]> {
        const records = await this.query<{ Username: string; IsActive: boolean }>(
            `SELECT Username, IsActive FROM User WHERE Username IN (${inList(usernames)})`
        );

        return records.map((record) => ({ username: record.Username, isActive: record.IsActive }));
    }

    public async findTargets(kind: Kind, names: string[]): Promise<string[]> {
        const { sobject, field } = targetObjects[kind];
        const records = await this.query<Record<string, string>>(
            `SELECT ${field} FROM ${sobject} WHERE ${field} IN (${inList(names)})`
        );

        return records.map((record) => record[field]);
    }

    public async listAssignments(): Promise<DesiredAssignment[]> {
        const [memberships, licenses] = await Promise.all([
            this.query<MembershipRecord>(
                'SELECT Assignee.Username, PermissionSet.Name, PermissionSetGroup.DeveloperName, PermissionSetGroupId ' +
                    'FROM PermissionSetAssignment ' +
                    'WHERE Assignee.IsActive = true AND PermissionSet.IsOwnedByProfile = false'
            ),
            this.query<LicenseRecord>(
                'SELECT Assignee.Username, PermissionSetLicense.DeveloperName ' +
                    'FROM PermissionSetLicenseAssign ' +
                    'WHERE Assignee.IsActive = true'
            ),
        ]);

        const assignments: DesiredAssignment[] = [];

        for (const record of memberships) {
            if (record.PermissionSetGroupId && record.PermissionSetGroup) {
                assignments.push({
                    assignee: record.Assignee.Username,
                    kind: 'permissionSetGroup',
                    target: record.PermissionSetGroup.DeveloperName,
                });
            } else {
                assignments.push({
                    assignee: record.Assignee.Username,
                    kind: 'permissionSet',
                    target: record.PermissionSet.Name,
                });
            }
        }

        for (const record of licenses) {
            assignments.push({
                assignee: record.Assignee.Username,
                kind: 'permissionSetLicense',
                target: record.PermissionSetLicense.DeveloperName,
            });
        }

        return assignments;
    }

    private async query<T>(soql: string): Promise<T[]> {
        const result = await this.connection.autoFetchQuery(soql);
        return result.records as unknown as T[];
    }
}
