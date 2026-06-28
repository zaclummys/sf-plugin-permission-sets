import { Connection } from '@salesforce/core';
import { Kind, OrgUser } from '../core/model.js';
import { OrgClient } from '../services/org-client.js';

type TargetObject = { sobject: string; field: 'Name' | 'DeveloperName' };

/** SObject + naming field per kind. The Salesforce schema knowledge lives here, not in core. */
const TARGET_OBJECTS: Record<Kind, TargetObject> = {
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
        const { sobject, field } = TARGET_OBJECTS[kind];
        const records = await this.query<Record<string, string>>(
            `SELECT ${field} FROM ${sobject} WHERE ${field} IN (${inList(names)})`
        );

        return records.map((record) => record[field]);
    }

    private async query<T>(soql: string): Promise<T[]> {
        const result = await this.connection.autoFetchQuery(soql);
        return result.records as unknown as T[];
    }
}
