import { Expiration } from './expiration.js';
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
    /** The instant the grant should expire; null for no expiration. Only permission sets and groups support it. */
    expiration: Expiration | null;
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
    expiration: Expiration | null;
};

/** An existing assignment whose expiration should change. `expiration` null clears it. */
export type AssignmentUpdate = {
    recordId: string;
    assignee: Username;
    kind: Kind;
    target: TargetName;
    expiration: Expiration | null;
    /** The expiration the org has now, before the update. Null means it had none. */
    previousExpiration: Expiration | null;
};

/** A resolved managed target: its kind and the org id it resolved to. */
export type TargetRef = {
    kind: Kind;
    id: string;
};

/**
 * A user the files manage one kind for, resolved to the org id of the user.
 *
 * Scoped by kind rather than by user alone, because a file declaring `permissionSets` for
 * someone says nothing about their licences: managing every kind of a user the moment one
 * kind is declared would read an omission as "remove them all".
 */
export type AssigneeRef = {
    kind: Kind;
    id: string;
};

/** A desired assignment resolved to the ids needed to insert it. */
export type ResolvedAddition = DesiredAssignment & {
    assigneeId: string;
    targetId: string;
};
