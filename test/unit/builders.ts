import {
    Expiration,
    TargetName,
    Username,
    type ActualAssignment,
    type AssignmentOperation,
    type AssignmentOutcome,
    type AssignmentUpdate,
    type DesiredAssignment,
    type Kind,
    type OrgTarget,
    type OrgUser,
} from '../../lib/core/index.js';

export function orgUser(id: string, username: string, isActive = true): OrgUser {
    return {
        id,
        username: Username.of(username),
        isActive,
    };
}

export function orgTarget(id: string, name: string): OrgTarget {
    return {
        id,
        name: TargetName.of(name),
    };
}

export type AssignmentInput = {
    assignee: string;
    kind: Kind;
    target: string;
    expiration?: string
};

export function desiredAssignment(input: AssignmentInput): DesiredAssignment {
    return {
        assignee: Username.of(input.assignee),
        kind: input.kind,
        target: TargetName.of(input.target),
        expiration: input.expiration ? Expiration.of(input.expiration) : null,
    };
}

export function actualAssignment(recordId: string, input: AssignmentInput): ActualAssignment {
    const desired = desiredAssignment(input);

    return {
        recordId,
        ...desired,
    };
}

type UpdateInput = AssignmentInput & { previousExpiration?: string };

export function assignmentUpdate(recordId: string, input: UpdateInput): AssignmentUpdate {
    const desired = desiredAssignment(input);

    return {
        recordId,
        ...desired,
        previousExpiration: input.previousExpiration ? Expiration.of(input.previousExpiration) : null,
    };
}

/** A record the org accepted. The names are display-only, so one spelling serves every spec. */
export function accepted(operation: AssignmentOperation): AssignmentOutcome {
    return {
        assignee: 'alice@example.com',
        kind: 'permissionSet',
        target: 'PS_Alpha',
        operation,
        success: true,
    };
}

/** A record the org rejected, which is what fails an otherwise applied run. */
export function rejected(operation: AssignmentOperation): AssignmentOutcome {
    return {
        assignee: 'alice@example.com',
        kind: 'permissionSet',
        target: 'PS_Alpha',
        operation,
        success: false,
        message: 'insufficient access rights on cross-reference id',
    };
}
