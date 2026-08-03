import { Connection } from '@salesforce/core';
import {
    ActualAssignment,
    AssigneeRef,
    AssignmentFilter,
    AssignmentOutcome,
    AssignmentUpdate,
    DesiredAssignment,
    Expiration,
    Kind,
    OrgTarget,
    OrgUser,
    ResolvedAddition,
    TargetName,
    TargetRef,
    Username,
} from '../../core/index.js';
import { OrgClient } from '../../services/adapters/index.js';
import { buildAdditionBatches, buildRemovalBatches, buildUpdateBatches, runJobs } from './dml.js';
import {
    MembershipScope,
    buildCurrentLicenseQuery,
    buildCurrentMembershipQuery,
    buildLicenseQuery,
    buildMembershipQuery,
    buildPermissionSetGroupQuery,
    buildPermissionSetLicenseQuery,
    buildPermissionSetQuery,
    buildUserQuery,
} from './soql.js';

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

/**
 * The org's ExpirationDate as an instant. The API serializes datetimes with a basic-format
 * offset (`2026-12-31T23:59:59.000+0000`), so converting here is what keeps that spelling
 * from reaching a comparison, a plan line, or an exported file.
 */
function toExpiration(value: string | null): Expiration | null {
    if (!value) {
        return null;
    }

    return Expiration.of(value);
}

/** Classify a membership row: a group grant when it carries a group id, otherwise a plain permission set. */
function classifyMembership(record: MembershipRecord): {
    kind: 'permissionSet' | 'permissionSetGroup';
    target: TargetName;
} {
    if (record.PermissionSetGroupId && record.PermissionSetGroup) {
        return {
            kind: 'permissionSetGroup',
            target: TargetName.of(record.PermissionSetGroup.DeveloperName),
        };
    }

    return {
        kind: 'permissionSet',
        target: TargetName.of(record.PermissionSet.Name),
    };
}

/** The org ids of one kind, from a list of refs that mixes all three. */
function idsOfKind(refs: {
    kind: Kind;
    id: string;
}[], kind: Kind): string[] {
    const matching = refs.filter((ref) => ref.kind === kind);

    return matching.map((ref) => ref.id);
}

/** Adapter backing OrgClient with a Salesforce Connection. autoFetchQuery pages past 2000 rows. */
export class ConnectionOrgClient implements OrgClient {
    public constructor(private readonly connection: Connection) { }

    public async findUsers(usernames: Username[]): Promise<OrgUser[]> {
        const records = await this.query<{
            Id: string;
            Username: string;
            IsActive: boolean
        }>(buildUserQuery(usernames));

        return records.map((record) => ({
            id: record.Id,
            username: Username.of(record.Username),
            isActive: record.IsActive,
        }));
    }

    public async findPermissionSets(names: TargetName[]): Promise<OrgTarget[]> {
        const records = await this.query<{
            Id: string;
            Name: string
        }>(buildPermissionSetQuery(names));

        return records.map((record) => ({
            id: record.Id,
            name: TargetName.of(record.Name),
        }));
    }

    public async findPermissionSetGroups(names: TargetName[]): Promise<OrgTarget[]> {
        const records = await this.query<{
            Id: string;
            DeveloperName: string
        }>(buildPermissionSetGroupQuery(names));

        return records.map((record) => ({
            id: record.Id,
            name: TargetName.of(record.DeveloperName),
        }));
    }

    public async findPermissionSetLicenses(names: TargetName[]): Promise<OrgTarget[]> {
        const records = await this.query<{
            Id: string;
            DeveloperName: string
        }>(buildPermissionSetLicenseQuery(names));

        return records.map((record) => ({
            id: record.Id,
            name: TargetName.of(record.DeveloperName),
        }));
    }

    public async listAssignments(filter?: AssignmentFilter): Promise<DesiredAssignment[]> {
        const kinds = filter?.kinds;
        const wantsPermissionSet = !kinds || kinds.includes('permissionSet');
        const wantsGroup = !kinds || kinds.includes('permissionSetGroup');
        const wantsLicense = !kinds || kinds.includes('permissionSetLicense');

        const tasks: Promise<DesiredAssignment[]>[] = [];

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
        usernames: Username[] | undefined,
        wantsPermissionSet: boolean,
        wantsGroup: boolean,
    ): Promise<DesiredAssignment[]> {
        const soql = buildMembershipQuery(usernames, wantsPermissionSet, wantsGroup);
        const records = await this.query<MembershipRecord>(soql);

        return records.map((record) => {
            const {
                kind,
                target,
            } = classifyMembership(record);

            return {
                kind,
                target,
                assignee: Username.of(record.Assignee.Username),
                expiration: toExpiration(record.ExpirationDate),
            };
        });
    }

    private async listLicenses(usernames: Username[] | undefined): Promise<DesiredAssignment[]> {
        const soql = buildLicenseQuery(usernames);
        const records = await this.query<LicenseRecord>(soql);

        return records.map((record) => ({
            assignee: Username.of(record.Assignee.Username),
            kind: 'permissionSetLicense' as const,
            target: TargetName.of(record.PermissionSetLicense.DeveloperName),
            expiration: null,
        }));
    }

    public async listCurrentAssignments(targets: TargetRef[], assignees: AssigneeRef[]): Promise<ActualAssignment[]> {
        const scope: MembershipScope = {
            permissionSetIds: idsOfKind(targets, 'permissionSet'),
            groupIds: idsOfKind(targets, 'permissionSetGroup'),
            permissionSetAssigneeIds: idsOfKind(assignees, 'permissionSet'),
            groupAssigneeIds: idsOfKind(assignees, 'permissionSetGroup'),
        };
        const membershipIds = [
            ...scope.permissionSetIds,
            ...scope.groupIds,
            ...scope.permissionSetAssigneeIds,
            ...scope.groupAssigneeIds,
        ];
        const licenseIds = idsOfKind(targets, 'permissionSetLicense');
        const licenseAssigneeIds = idsOfKind(assignees, 'permissionSetLicense');

        const tasks: Promise<ActualAssignment[]>[] = [];

        if (membershipIds.length > 0) {
            const soql = buildCurrentMembershipQuery(scope);

            tasks.push(this.listMembershipAssignments(soql));
        }

        if (licenseIds.length + licenseAssigneeIds.length > 0) {
            const soql = buildCurrentLicenseQuery(licenseIds, licenseAssigneeIds);

            tasks.push(this.listLicenseAssignments(soql));
        }

        const results = await Promise.all(tasks);

        return results.flat();
    }

    private async listMembershipAssignments(soql: string): Promise<ActualAssignment[]> {
        const records = await this.query<MembershipRecord>(soql);

        return records.map((record) => {
            const {
                kind,
                target,
            } = classifyMembership(record);

            return {
                kind,
                target,
                recordId: record.Id,
                assignee: Username.of(record.Assignee.Username),
                expiration: toExpiration(record.ExpirationDate),
            };
        });
    }

    private async listLicenseAssignments(soql: string): Promise<ActualAssignment[]> {
        const records = await this.query<LicenseRecord>(soql);

        return records.map((record) => ({
            recordId: record.Id,
            assignee: Username.of(record.Assignee.Username),
            kind: 'permissionSetLicense' as const,
            target: TargetName.of(record.PermissionSetLicense.DeveloperName),
            expiration: null,
        }));
    }

    public addAssignments(additions: ResolvedAddition[]): Promise<AssignmentOutcome[]> {
        const batches = buildAdditionBatches(additions);
        const jobs = batches.map((batch) => ({
            items: batch.additions,
            send: () => this.connection.create(batch.sobject, batch.records, { allOrNone: false }),
        }));

        return runJobs(jobs, 'add');
    }

    public updateAssignments(updates: AssignmentUpdate[]): Promise<AssignmentOutcome[]> {
        const batches = buildUpdateBatches(updates);
        const jobs = batches.map((batch) => ({
            items: batch.updates,
            send: () => this.connection.update(batch.sobject, batch.records, { allOrNone: false }),
        }));

        return runJobs(jobs, 'update');
    }

    public removeAssignments(removals: ActualAssignment[]): Promise<AssignmentOutcome[]> {
        const batches = buildRemovalBatches(removals);
        const jobs = batches.map((batch) => ({
            items: batch.removals,
            send: () => {
                const recordIds = batch.removals.map((removal) => removal.recordId);

                return this.connection.destroy(batch.sobject, recordIds, { allOrNone: false });
            },
        }));

        return runJobs(jobs, 'remove');
    }

    private async query<T>(soql: string): Promise<T[]> {
        const result = await this.connection.autoFetchQuery(soql);

        return result.records as unknown as T[];
    }
}
