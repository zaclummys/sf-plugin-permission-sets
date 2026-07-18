import { Connection } from '@salesforce/core';
import {
    ActualAssignment,
    AssignmentFilter,
    AssignmentOutcome,
    AssignmentUpdate,
    DesiredAssignment,
    Kind,
    OrgTarget,
    OrgUser,
    ResolvedAddition,
    TargetRef,
} from '../core/index.js';
import { OrgClient } from '../services/adapters/index.js';

type TargetObject = { sobject: string; field: 'Name' | 'DeveloperName' };

/** SObject + id field per kind, for inserting and deleting assignments. */
type AssignmentObject = { sobject: string; idField: string };

/** Shapes of the assignment rows we read back, with relationship fields nested. */
type MembershipRecord = {
    Id: string;
    Assignee: { Username: string };
    PermissionSet: { Name: string };
    PermissionSetGroup: { DeveloperName: string } | null;
    PermissionSetGroupId: string | null;
    ExpirationDate: string | null;
};

type LicenseRecord = {
    Id: string;
    Assignee: { Username: string };
    PermissionSetLicense: { DeveloperName: string };
};

/** The slice of a DML save/delete result we report on. Structurally a jsforce SaveResult. */
type DmlResult = { success: boolean; errors: Array<{ message: string }> };

/** SObject + naming field per kind. The Salesforce schema knowledge lives here, not in core. */
const targetObjects: Record<Kind, TargetObject> = {
    permissionSet: { sobject: 'PermissionSet', field: 'Name' },
    permissionSetGroup: { sobject: 'PermissionSetGroup', field: 'DeveloperName' },
    permissionSetLicense: { sobject: 'PermissionSetLicense', field: 'DeveloperName' },
};

/** SObject + foreign-key field to set per kind when assigning. */
const assignmentObjects: Record<Kind, AssignmentObject> = {
    permissionSet: { sobject: 'PermissionSetAssignment', idField: 'PermissionSetId' },
    permissionSetGroup: { sobject: 'PermissionSetAssignment', idField: 'PermissionSetGroupId' },
    permissionSetLicense: { sobject: 'PermissionSetLicenseAssign', idField: 'PermissionSetLicenseId' },
};

/** The sObject Collections API caps each create/delete call at 200 records. */
const collectionBatchSize = 200;

/** Escape a value for safe inclusion in a SOQL string literal. */
function soqlLiteral(value: string): string {
    return value.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

/** Build a comma-separated, quoted IN list from the values. */
function inList(values: string[]): string {
    return values.map((value) => `'${soqlLiteral(value)}'`).join(', ');
}

/** Split items into chunks of at most `size`. */
function chunk<T>(items: T[], size: number): T[][] {
    const chunks: T[][] = [];
    for (let index = 0; index < items.length; index += size) {
        chunks.push(items.slice(index, index + size));
    }
    return chunks;
}

/** Turn a per-record DML result into a domain outcome, capturing the error message on failure. */
function outcomeOf(
    assignment: { assignee: string; kind: Kind; target: string },
    operation: 'add' | 'update' | 'remove',
    result: DmlResult | undefined
): AssignmentOutcome {
    const success = result?.success ?? false;
    const message = result && !result.success ? result.errors.map((error) => error.message).join('; ') : undefined;

    return {
        assignee: assignment.assignee,
        kind: assignment.kind,
        target: assignment.target,
        operation,
        success,
        message,
    };
}

/** A DML create record field map. ExpirationDate may be null to clear it. */
type DmlRecord = Record<string, string | null>;

/** A DML update record: the id to update, plus the expiration to set (null clears it). */
type UpdateRecord = { Id: string; ExpirationDate: string | null };

/** Group additions by sObject and chunk them for the Collections API, keeping each record's source. */
function additionBatches(
    additions: ResolvedAddition[]
): Array<{ sobject: string; additions: ResolvedAddition[]; records: DmlRecord[] }> {
    const bySobject = new Map<string, ResolvedAddition[]>();
    for (const addition of additions) {
        const { sobject } = assignmentObjects[addition.kind];
        const grouped = bySobject.get(sobject) ?? [];
        grouped.push(addition);
        bySobject.set(sobject, grouped);
    }

    const batches: Array<{ sobject: string; additions: ResolvedAddition[]; records: DmlRecord[] }> = [];
    for (const [sobject, grouped] of bySobject) {
        for (const batch of chunk(grouped, collectionBatchSize)) {
            const records = batch.map((addition) => ({
                AssigneeId: addition.assigneeId,
                [assignmentObjects[addition.kind].idField]: addition.targetId,
                ...(addition.expiration ? { ExpirationDate: addition.expiration } : {}),
            }));
            batches.push({ sobject, additions: batch, records });
        }
    }
    return batches;
}

/** Group expiration updates by sObject and chunk them, building the Id + ExpirationDate records. */
function updateBatches(
    updates: AssignmentUpdate[]
): Array<{ sobject: string; updates: AssignmentUpdate[]; records: UpdateRecord[] }> {
    const bySobject = new Map<string, AssignmentUpdate[]>();
    for (const update of updates) {
        const { sobject } = assignmentObjects[update.kind];
        const grouped = bySobject.get(sobject) ?? [];
        grouped.push(update);
        bySobject.set(sobject, grouped);
    }

    const batches: Array<{ sobject: string; updates: AssignmentUpdate[]; records: UpdateRecord[] }> = [];
    for (const [sobject, grouped] of bySobject) {
        for (const batch of chunk(grouped, collectionBatchSize)) {
            const records: UpdateRecord[] = batch.map((update) => ({
                Id: update.recordId,
                ExpirationDate: update.expiration ?? null,
            }));
            batches.push({ sobject, updates: batch, records });
        }
    }
    return batches;
}

/** Group removals by sObject and chunk them for the Collections API. */
function removalBatches(removals: ActualAssignment[]): Array<{ sobject: string; removals: ActualAssignment[] }> {
    const bySobject = new Map<string, ActualAssignment[]>();
    for (const removal of removals) {
        const { sobject } = assignmentObjects[removal.kind];
        const grouped = bySobject.get(sobject) ?? [];
        grouped.push(removal);
        bySobject.set(sobject, grouped);
    }

    const batches: Array<{ sobject: string; removals: ActualAssignment[] }> = [];
    for (const [sobject, grouped] of bySobject) {
        for (const batch of chunk(grouped, collectionBatchSize)) {
            batches.push({ sobject, removals: batch });
        }
    }
    return batches;
}

/** Adapter backing OrgClient with a Salesforce Connection. autoFetchQuery pages past 2000 rows. */
export class ConnectionOrgClient implements OrgClient {
    public constructor(private readonly connection: Connection) {}

    public async findUsers(usernames: string[]): Promise<OrgUser[]> {
        const records = await this.query<{ Id: string; Username: string; IsActive: boolean }>(
            `SELECT Id, Username, IsActive FROM User WHERE Username IN (${inList(usernames)})`
        );

        return records.map((record) => ({ id: record.Id, username: record.Username, isActive: record.IsActive }));
    }

    public async findTargets(kind: Kind, names: string[]): Promise<OrgTarget[]> {
        const { sobject, field } = targetObjects[kind];
        const records = await this.query<Record<string, string>>(
            `SELECT Id, ${field} FROM ${sobject} WHERE ${field} IN (${inList(names)})`
        );

        return records.map((record) => ({ id: record.Id, name: record[field] }));
    }

    public async listAssignments(filter?: AssignmentFilter): Promise<DesiredAssignment[]> {
        const kinds = filter?.kinds;
        const wantsPermissionSet = !kinds || kinds.includes('permissionSet');
        const wantsGroup = !kinds || kinds.includes('permissionSetGroup');
        const wantsLicense = !kinds || kinds.includes('permissionSetLicense');

        const tasks: Array<Promise<DesiredAssignment[]>> = [];
        if (wantsPermissionSet || wantsGroup) {
            tasks.push(this.listMemberships(filter?.usernames, wantsPermissionSet, wantsGroup));
        }
        if (wantsLicense) {
            tasks.push(this.listLicenses(filter?.usernames));
        }

        const results = await Promise.all(tasks);
        return results.flat();
    }

    private async listMemberships(
        usernames: string[] | undefined,
        wantsPermissionSet: boolean,
        wantsGroup: boolean
    ): Promise<DesiredAssignment[]> {
        const clauses = [
            'Assignee.IsActive = true',
            'PermissionSet.IsOwnedByProfile = false',
        ];
        if (usernames) clauses.push(`Assignee.Username IN (${inList(usernames)})`);
        if (!wantsGroup) clauses.push('PermissionSetGroupId = null');
        if (!wantsPermissionSet) clauses.push('PermissionSetGroupId != null');

        const soql =
            'SELECT Id, Assignee.Username, PermissionSet.Name, PermissionSetGroup.DeveloperName, PermissionSetGroupId, ExpirationDate ' +
            `FROM PermissionSetAssignment WHERE ${clauses.join(' AND ')}`;
        const records = await this.query<MembershipRecord>(soql);

        return records.map((record) => {
            const expiration = record.ExpirationDate ? { expiration: record.ExpirationDate } : {};
            return record.PermissionSetGroupId && record.PermissionSetGroup
                ? {
                      assignee: record.Assignee.Username,
                      kind: 'permissionSetGroup' as const,
                      target: record.PermissionSetGroup.DeveloperName,
                      ...expiration,
                  }
                : {
                      assignee: record.Assignee.Username,
                      kind: 'permissionSet' as const,
                      target: record.PermissionSet.Name,
                      ...expiration,
                  };
        });
    }

    private async listLicenses(usernames: string[] | undefined): Promise<DesiredAssignment[]> {
        const clauses = ['Assignee.IsActive = true'];
        if (usernames) clauses.push(`Assignee.Username IN (${inList(usernames)})`);

        const soql =
            'SELECT Id, Assignee.Username, PermissionSetLicense.DeveloperName ' +
            `FROM PermissionSetLicenseAssign WHERE ${clauses.join(' AND ')}`;
        const records = await this.query<LicenseRecord>(soql);

        return records.map((record) => ({
            assignee: record.Assignee.Username,
            kind: 'permissionSetLicense' as const,
            target: record.PermissionSetLicense.DeveloperName,
        }));
    }

    public async currentAssignments(targets: TargetRef[]): Promise<ActualAssignment[]> {
        const permissionSetIds = targets.filter((ref) => ref.kind === 'permissionSet').map((ref) => ref.id);
        const groupIds = targets.filter((ref) => ref.kind === 'permissionSetGroup').map((ref) => ref.id);
        const licenseIds = targets.filter((ref) => ref.kind === 'permissionSetLicense').map((ref) => ref.id);

        const tasks: Array<Promise<ActualAssignment[]>> = [];

        const memberClauses: string[] = [];
        if (permissionSetIds.length > 0) memberClauses.push(`PermissionSetId IN (${inList(permissionSetIds)})`);
        if (groupIds.length > 0) memberClauses.push(`PermissionSetGroupId IN (${inList(groupIds)})`);
        if (memberClauses.length > 0) {
            const soql =
                'SELECT Id, Assignee.Username, PermissionSet.Name, PermissionSetGroup.DeveloperName, PermissionSetGroupId, ExpirationDate ' +
                `FROM PermissionSetAssignment WHERE ${memberClauses.join(' OR ')}`;
            tasks.push(this.membershipAssignments(soql));
        }

        if (licenseIds.length > 0) {
            const soql =
                'SELECT Id, Assignee.Username, PermissionSetLicense.DeveloperName ' +
                `FROM PermissionSetLicenseAssign WHERE PermissionSetLicenseId IN (${inList(licenseIds)})`;
            tasks.push(this.licenseAssignments(soql));
        }

        const results = await Promise.all(tasks);
        return results.flat();
    }

    private async membershipAssignments(soql: string): Promise<ActualAssignment[]> {
        const records = await this.query<MembershipRecord>(soql);
        return records.map((record) => {
            const expiration = record.ExpirationDate ? { expiration: record.ExpirationDate } : {};
            return record.PermissionSetGroupId && record.PermissionSetGroup
                ? {
                      recordId: record.Id,
                      assignee: record.Assignee.Username,
                      kind: 'permissionSetGroup' as const,
                      target: record.PermissionSetGroup.DeveloperName,
                      ...expiration,
                  }
                : {
                      recordId: record.Id,
                      assignee: record.Assignee.Username,
                      kind: 'permissionSet' as const,
                      target: record.PermissionSet.Name,
                      ...expiration,
                  };
        });
    }

    private async licenseAssignments(soql: string): Promise<ActualAssignment[]> {
        const records = await this.query<LicenseRecord>(soql);
        return records.map((record) => ({
            recordId: record.Id,
            assignee: record.Assignee.Username,
            kind: 'permissionSetLicense' as const,
            target: record.PermissionSetLicense.DeveloperName,
        }));
    }

    public async addAssignments(additions: ResolvedAddition[]): Promise<AssignmentOutcome[]> {
        const batches = additionBatches(additions);
        const settled = await Promise.all(
            batches.map(async (batch) => {
                const results = await this.connection.create(batch.sobject, batch.records, { allOrNone: false });
                return { batch, results: results as DmlResult[] };
            })
        );

        const outcomes: AssignmentOutcome[] = [];
        for (const { batch, results } of settled) {
            batch.additions.forEach((addition, index) => {
                outcomes.push(outcomeOf(addition, 'add', results[index]));
            });
        }
        return outcomes;
    }

    public async updateAssignments(updates: AssignmentUpdate[]): Promise<AssignmentOutcome[]> {
        const batches = updateBatches(updates);
        const settled = await Promise.all(
            batches.map(async (batch) => {
                const results = await this.connection.update(batch.sobject, batch.records, { allOrNone: false });
                return { batch, results: results as DmlResult[] };
            })
        );

        const outcomes: AssignmentOutcome[] = [];
        for (const { batch, results } of settled) {
            batch.updates.forEach((update, index) => {
                outcomes.push(outcomeOf(update, 'update', results[index]));
            });
        }
        return outcomes;
    }

    public async removeAssignments(removals: ActualAssignment[]): Promise<AssignmentOutcome[]> {
        const batches = removalBatches(removals);
        const settled = await Promise.all(
            batches.map(async (batch) => {
                const recordIds = batch.removals.map((removal) => removal.recordId);
                const results = await this.connection.destroy(batch.sobject, recordIds, { allOrNone: false });
                return { batch, results: results as DmlResult[] };
            })
        );

        const outcomes: AssignmentOutcome[] = [];
        for (const { batch, results } of settled) {
            batch.removals.forEach((removal, index) => {
                outcomes.push(outcomeOf(removal, 'remove', results[index]));
            });
        }
        return outcomes;
    }

    private async query<T>(soql: string): Promise<T[]> {
        const result = await this.connection.autoFetchQuery(soql);
        return result.records as unknown as T[];
    }
}
