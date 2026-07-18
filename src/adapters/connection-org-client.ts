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

/** SObject + foreign-key field to set per kind when assigning. */
const assignmentObjects: Record<Kind, AssignmentObject> = {
    permissionSet: { sobject: 'PermissionSetAssignment', idField: 'PermissionSetId' },
    permissionSetGroup: { sobject: 'PermissionSetAssignment', idField: 'PermissionSetGroupId' },
    permissionSetLicense: { sobject: 'PermissionSetLicenseAssign', idField: 'PermissionSetLicenseId' },
};

/** The sObject Collections API caps each create/delete call at 200 records. */
const collectionBatchSize = 200;

/** Escape a value for safe inclusion in a SOQL string literal. */
function escapeSoqlLiteral(value: string): string {
    return value.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

/** Build a comma-separated, quoted IN list from the values. */
function buildInList(values: string[]): string {
    return values.map((value) => `'${escapeSoqlLiteral(value)}'`).join(', ');
}

/** Full membership SOQL for the active, non-profile-owned assignments matching the filter. */
function buildMembershipQuery(usernames: string[] | undefined, wantsPermissionSet: boolean, wantsGroup: boolean): string {
    const clauses = [
        'Assignee.IsActive = true',
        'PermissionSet.IsOwnedByProfile = false',
    ];
    if (usernames) clauses.push(`Assignee.Username IN(${buildInList(usernames)})`);
    if (!wantsGroup) clauses.push('PermissionSetGroupId = null');
    if (!wantsPermissionSet) clauses.push('PermissionSetGroupId != null');

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
function buildCurrentMembershipQuery(permissionSetIds: string[], groupIds: string[]): string {
    const clauses: string[] = [];
    if (permissionSetIds.length > 0) clauses.push(`PermissionSetId IN(${buildInList(permissionSetIds)})`);
    if (groupIds.length > 0) clauses.push(`PermissionSetGroupId IN(${buildInList(groupIds)})`);

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
function buildLicenseQuery(usernames: string[] | undefined): string {
    const clauses = ['Assignee.IsActive = true'];
    if (usernames) clauses.push(`Assignee.Username IN(${buildInList(usernames)})`);

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
function buildCurrentLicenseQuery(licenseIds: string[]): string {
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
function buildUserQuery(usernames: string[]): string {
    return `
        SELECT
            Id,
            Username,
            IsActive
        FROM User
        WHERE Username IN(${buildInList(usernames)})
    `;
}

/** Full SOQL for the permission sets with the given names. */
function buildPermissionSetQuery(names: string[]): string {
    return `
        SELECT
            Id,
            Name
        FROM PermissionSet
        WHERE Name IN(${buildInList(names)})
    `;
}

/** Full SOQL for the permission set groups with the given developer names. */
function buildPermissionSetGroupQuery(names: string[]): string {
    return `
        SELECT
            Id,
            DeveloperName
        FROM PermissionSetGroup
        WHERE DeveloperName IN(${buildInList(names)})
    `;
}

/** Full SOQL for the permission set licenses with the given developer names. */
function buildPermissionSetLicenseQuery(names: string[]): string {
    return `
        SELECT
            Id,
            DeveloperName
        FROM PermissionSetLicense
        WHERE DeveloperName IN(${buildInList(names)})
    `;
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
function deriveOutcome(
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
function buildAdditionBatches(
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
function buildUpdateBatches(
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
function buildRemovalBatches(removals: ActualAssignment[]): Array<{ sobject: string; removals: ActualAssignment[] }> {
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

/** Classify a membership row: a group grant when it carries a group id, otherwise a plain permission set. */
function classifyMembership(record: MembershipRecord): { kind: 'permissionSet' | 'permissionSetGroup'; target: string } {
    if (record.PermissionSetGroupId && record.PermissionSetGroup) {
        return { kind: 'permissionSetGroup', target: record.PermissionSetGroup.DeveloperName };
    }

    return { kind: 'permissionSet', target: record.PermissionSet.Name };
}

/** Adapter backing OrgClient with a Salesforce Connection. autoFetchQuery pages past 2000 rows. */
export class ConnectionOrgClient implements OrgClient {
    public constructor(private readonly connection: Connection) { }

    public async findUsers(usernames: string[]): Promise<OrgUser[]> {
        const records = await this.query<{ Id: string; Username: string; IsActive: boolean }>(buildUserQuery(usernames));

        return records.map((record) => ({ id: record.Id, username: record.Username, isActive: record.IsActive }));
    }

    public async findPermissionSets(names: string[]): Promise<OrgTarget[]> {
        const records = await this.query<{ Id: string; Name: string }>(buildPermissionSetQuery(names));

        return records.map((record) => ({ id: record.Id, name: record.Name }));
    }

    public async findPermissionSetGroups(names: string[]): Promise<OrgTarget[]> {
        const records = await this.query<{ Id: string; DeveloperName: string }>(buildPermissionSetGroupQuery(names));

        return records.map((record) => ({ id: record.Id, name: record.DeveloperName }));
    }

    public async findPermissionSetLicenses(names: string[]): Promise<OrgTarget[]> {
        const records = await this.query<{ Id: string; DeveloperName: string }>(buildPermissionSetLicenseQuery(names));

        return records.map((record) => ({ id: record.Id, name: record.DeveloperName }));
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
        const soql = buildMembershipQuery(usernames, wantsPermissionSet, wantsGroup);
        const records = await this.query<MembershipRecord>(soql);

        return records.map((record) => {
            const { kind, target } = classifyMembership(record);

            return {
                kind,
                target,
                assignee: record.Assignee.Username,
                expiration: record.ExpirationDate,
            };
        });
    }

    private async listLicenses(usernames: string[] | undefined): Promise<DesiredAssignment[]> {
        const soql = buildLicenseQuery(usernames);
        const records = await this.query<LicenseRecord>(soql);

        return records.map((record) => ({
            assignee: record.Assignee.Username,
            kind: 'permissionSetLicense' as const,
            target: record.PermissionSetLicense.DeveloperName,
            expiration: null,
        }));
    }

    public async listCurrentAssignments(targets: TargetRef[]): Promise<ActualAssignment[]> {
        const permissionSetIds = targets.filter((ref) => ref.kind === 'permissionSet').map((ref) => ref.id);
        const groupIds = targets.filter((ref) => ref.kind === 'permissionSetGroup').map((ref) => ref.id);
        const licenseIds = targets.filter((ref) => ref.kind === 'permissionSetLicense').map((ref) => ref.id);

        const tasks: Array<Promise<ActualAssignment[]>> = [];

        if (permissionSetIds.length > 0 || groupIds.length > 0) {
            const soql = buildCurrentMembershipQuery(permissionSetIds, groupIds);
            tasks.push(this.listMembershipAssignments(soql));
        }

        if (licenseIds.length > 0) {
            const soql = buildCurrentLicenseQuery(licenseIds);
            tasks.push(this.listLicenseAssignments(soql));
        }

        const results = await Promise.all(tasks);
        return results.flat();
    }

    private async listMembershipAssignments(soql: string): Promise<ActualAssignment[]> {
        const records = await this.query<MembershipRecord>(soql);
        return records.map((record) => {
            const { kind, target } = classifyMembership(record);

            return {
                kind,
                target,
                recordId: record.Id,
                assignee: record.Assignee.Username,
                expiration: record.ExpirationDate,
            };
        });
    }

    private async listLicenseAssignments(soql: string): Promise<ActualAssignment[]> {
        const records = await this.query<LicenseRecord>(soql);
        return records.map((record) => ({
            recordId: record.Id,
            assignee: record.Assignee.Username,
            kind: 'permissionSetLicense' as const,
            target: record.PermissionSetLicense.DeveloperName,
            expiration: null,
        }));
    }

    public async addAssignments(additions: ResolvedAddition[]): Promise<AssignmentOutcome[]> {
        const batches = buildAdditionBatches(additions);
        const settled = await Promise.all(
            batches.map(async (batch) => {
                const results = await this.connection.create(batch.sobject, batch.records, { allOrNone: false });
                return { batch, results: results as DmlResult[] };
            })
        );

        const outcomes: AssignmentOutcome[] = [];
        for (const { batch, results } of settled) {
            batch.additions.forEach((addition, index) => {
                outcomes.push(deriveOutcome(addition, 'add', results[index]));
            });
        }
        return outcomes;
    }

    public async updateAssignments(updates: AssignmentUpdate[]): Promise<AssignmentOutcome[]> {
        const batches = buildUpdateBatches(updates);
        const settled = await Promise.all(
            batches.map(async (batch) => {
                const results = await this.connection.update(batch.sobject, batch.records, { allOrNone: false });
                return { batch, results: results as DmlResult[] };
            })
        );

        const outcomes: AssignmentOutcome[] = [];
        for (const { batch, results } of settled) {
            batch.updates.forEach((update, index) => {
                outcomes.push(deriveOutcome(update, 'update', results[index]));
            });
        }
        return outcomes;
    }

    public async removeAssignments(removals: ActualAssignment[]): Promise<AssignmentOutcome[]> {
        const batches = buildRemovalBatches(removals);
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
                outcomes.push(deriveOutcome(removal, 'remove', results[index]));
            });
        }
        return outcomes;
    }

    private async query<T>(soql: string): Promise<T[]> {
        const result = await this.connection.autoFetchQuery(soql);
        return result.records as unknown as T[];
    }
}
