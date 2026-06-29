import { Finding } from './finding.js';

export type Kind = 'permissionSet' | 'permissionSetGroup' | 'permissionSetLicense';

export type DesiredAssignment = {
    assignee: string;
    kind: Kind;
    target: string;
};

/** A user as it exists in the org, in domain terms (no SObject field names). */
export type OrgUser = {
    id: string;
    username: string;
    isActive: boolean;
};

/** A target (permission set, group, or license) as it exists in the org. */
export type OrgTarget = {
    id: string;
    name: string;
};

/** An assignment that currently exists in the org, carrying its record id for deletion. */
export type ActualAssignment = {
    recordId: string;
    assignee: string;
    kind: Kind;
    target: string;
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

/** The change set between the desired model and the org's current state. */
export type Diff = {
    toAdd: DesiredAssignment[];
    toRemove: ActualAssignment[];
    unchanged: ActualAssignment[];
};

/** The per-record result of one add or remove, for partial-success reporting. */
export type AssignmentOutcome = {
    assignee: string;
    kind: Kind;
    target: string;
    operation: 'add' | 'remove';
    success: boolean;
    message?: string;
};

export type LoadResult = {
    files: string[];
    assignments: DesiredAssignment[];
    findings: Finding[];
};
