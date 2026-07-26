import { Findings } from './finding.js';
import { TargetName } from './target-name.js';
import { Username } from './username.js';

export type Kind = 'permissionSet' | 'permissionSetGroup' | 'permissionSetLicense';

/** Which half of the reconcile a run acts on. Shared by plan, apply, and the report. */
export type ReconcileMode = 'additive' | 'destructive' | 'sync';

/** Narrows which assignments a read pulls from the org. An absent field means no limit on it. */
export type AssignmentFilter = {
    usernames?: Username[];
    kinds?: Kind[];
};

export type DesiredAssignment = {
    assignee: Username;
    kind: Kind;
    target: TargetName;
    /** ISO 8601 datetime the grant should expire; null for no expiration. Only permission sets and groups support it. */
    expiration: string | null;
};

/** A user as it exists in the org, in domain terms (no SObject field names). */
export type OrgUser = {
    id: string;
    username: Username;
    isActive: boolean;
};

/** A target (permission set, group, or license) as it exists in the org. */
export type OrgTarget = {
    id: string;
    name: TargetName;
};

/** An assignment that currently exists in the org, carrying its record id for deletion. */
export type ActualAssignment = {
    recordId: string;
    assignee: Username;
    kind: Kind;
    target: TargetName;
    /** The expiration the org has on record; null for none. */
    expiration: string | null;
};

/** An existing assignment whose expiration should change. `expiration` null clears it. */
export type AssignmentUpdate = {
    recordId: string;
    assignee: Username;
    kind: Kind;
    target: TargetName;
    expiration: string | null;
    /** The expiration the org has now, before the update. Null means it had none. */
    previousExpiration: string | null;
};

/** A resolved managed target: its kind and the org id it resolved to. */
export type TargetRef = {
    kind: Kind;
    id: string;
};

/** A desired assignment resolved to the ids needed to insert it. */
export type ResolvedAddition = DesiredAssignment & {
    assigneeId: string;
    targetId: string;
};

/**
 * The per-record result of one add or remove, for partial-success reporting. A report
 * record rather than a model record: it is only ever displayed, so it carries the names
 * as plain text.
 */
export type AssignmentOutcome = {
    assignee: string;
    kind: Kind;
    target: string;
    operation: 'add' | 'update' | 'remove';
    success: boolean;
    message?: string;
};

export type LoadResult = {
    files: string[];
    assignments: DesiredAssignment[];
    findings: Findings;
};
