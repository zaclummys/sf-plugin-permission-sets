import {
    ActualAssignment,
    AssignmentOperation,
    AssignmentOutcome,
    AssignmentUpdate,
    Kind,
    ResolvedAddition,
    TargetName,
    Username,
} from '../../core/index.js';

/** SObject + id field per kind, for inserting and deleting assignments. */
type AssignmentObject = {
    sobject: string;
    idField: string
};

/** The slice of a DML save/delete result we report on. Structurally a jsforce SaveResult. */
type DmlResult = {
    success: boolean;
    errors: { message: string }[]
};

/** A DML create record field map. ExpirationDate may be null to clear it. */
type DmlRecord = Record<string, string | null>;

/** A DML update record: the id to update, plus the expiration to set (null clears it). */
type UpdateRecord = {
    Id: string;
    ExpirationDate: string | null
};

type AdditionBatch = {
    sobject: string;
    additions: ResolvedAddition[];
    records: DmlRecord[]
};

type UpdateBatch = {
    sobject: string;
    updates: AssignmentUpdate[];
    records: UpdateRecord[]
};

type RemovalBatch = {
    sobject: string;
    removals: ActualAssignment[]
};

/** What an outcome needs to name the record it reports on. Every DML input carries these. */
type AssignmentRef = {
    assignee: Username;
    kind: Kind;
    target: TargetName
};

/**
 * One DML call: the assignments it sends, and the call itself as a thunk. The adapter
 * supplies the thunk because the Connection is its business, and the pairing of a result
 * back to the assignment that produced it is this module's.
 */
export type DmlJob<Item extends AssignmentRef> = {
    items: Item[];
    send: () => Promise<DmlResult[]>
};

/** SObject + foreign-key field to set per kind when assigning. */
const assignmentObjects: Record<Kind, AssignmentObject> = {
    permissionSet: {
        sobject: 'PermissionSetAssignment',
        idField: 'PermissionSetId',
    },
    permissionSetGroup: {
        sobject: 'PermissionSetAssignment',
        idField: 'PermissionSetGroupId',
    },
    permissionSetLicense: {
        sobject: 'PermissionSetLicenseAssign',
        idField: 'PermissionSetLicenseId',
    },
};

/** The sObject Collections API caps each create/delete call at 200 records. */
const collectionBatchSize = 200;

/** Split items into chunks of at most `size`. */
function chunk<T>(items: T[], size: number): T[][] {
    const chunks: T[][] = [];

    for (let index = 0; index < items.length; index += size) {
        chunks.push(items.slice(index, index + size));
    }
    return chunks;
}

/** Group items by the sObject their kind maps to, keeping the input order within each group. */
function groupBySobject<T extends { kind: Kind }>(items: T[]): Map<string, T[]> {
    const bySobject = new Map<string, T[]>();

    for (const item of items) {
        const { sobject } = assignmentObjects[item.kind];
        const grouped = bySobject.get(sobject) ?? [];

        grouped.push(item);
        bySobject.set(sobject, grouped);
    }
    return bySobject;
}

/** Turn a per-record DML result into a domain outcome, capturing the error message on failure. */
function deriveOutcome(
    assignment: AssignmentRef,
    operation: AssignmentOperation,
    result: DmlResult | undefined,
): AssignmentOutcome {
    const success = result?.success ?? false;
    const message = result && !result.success ? result.errors.map((error) => error.message).join('; ') : undefined;

    return {
        assignee: assignment.assignee.toString(),
        kind: assignment.kind,
        target: assignment.target.toString(),
        operation,
        success,
        message,
    };
}

/**
 * Run every job in parallel and pair each record's result back to the assignment it came
 * from, by position: the Collections API answers in the order it was sent, which is what
 * lets a partial success name the records the org rejected rather than just count them.
 */
export async function runJobs<Item extends AssignmentRef>(
    jobs: DmlJob<Item>[],
    operation: AssignmentOperation,
): Promise<AssignmentOutcome[]> {
    const settled = await Promise.all(
        jobs.map(async (job) => {
            const results = await job.send();

            return {
                job,
                results,
            };
        }),
    );

    const outcomes: AssignmentOutcome[] = [];

    for (const {
        job,
        results,
    } of settled) {
        job.items.forEach((item, index) => {
            outcomes.push(deriveOutcome(item, operation, results[index]));
        });
    }
    return outcomes;
}

/** Group additions by sObject and chunk them for the Collections API, keeping each record's source. */
export function buildAdditionBatches(additions: ResolvedAddition[]): AdditionBatch[] {
    const bySobject = groupBySobject(additions);
    const batches: AdditionBatch[] = [];

    for (const [
        sobject,
        grouped,
    ] of bySobject) {
        for (const batch of chunk(grouped, collectionBatchSize)) {
            const records = batch.map((addition) => ({
                AssigneeId: addition.assigneeId,
                [assignmentObjects[addition.kind].idField]: addition.targetId,
                ...(addition.expiration ? { ExpirationDate: addition.expiration.toString() } : {}),
            }));

            batches.push({
                sobject,
                additions: batch,
                records,
            });
        }
    }
    return batches;
}

/** Group expiration updates by sObject and chunk them, building the Id + ExpirationDate records. */
export function buildUpdateBatches(updates: AssignmentUpdate[]): UpdateBatch[] {
    const bySobject = groupBySobject(updates);
    const batches: UpdateBatch[] = [];

    for (const [
        sobject,
        grouped,
    ] of bySobject) {
        for (const batch of chunk(grouped, collectionBatchSize)) {
            const records: UpdateRecord[] = batch.map((update) => ({
                Id: update.recordId,
                ExpirationDate: update.expiration?.toString() ?? null,
            }));

            batches.push({
                sobject,
                updates: batch,
                records,
            });
        }
    }
    return batches;
}

/** Group removals by sObject and chunk them for the Collections API. */
export function buildRemovalBatches(removals: ActualAssignment[]): RemovalBatch[] {
    const bySobject = groupBySobject(removals);
    const batches: RemovalBatch[] = [];

    for (const [
        sobject,
        grouped,
    ] of bySobject) {
        for (const batch of chunk(grouped, collectionBatchSize)) {
            batches.push({
                sobject,
                removals: batch,
            });
        }
    }
    return batches;
}
