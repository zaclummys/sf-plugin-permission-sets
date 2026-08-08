import {
    Expiration,
    TargetName,
    Username,
    type ActualAssignment,
    type AssigneeRef,
    type AssignmentFilter,
    type AssignmentOperation,
    type AssignmentOutcome,
    type AssignmentUpdate,
    type DesiredAssignment,
    type Kind,
    type OrgTarget,
    type OrgUser,
    type ResolvedAddition,
    type TargetRef,
} from '../../lib/core/index.js';
import type { OrgClient } from '../../lib/services/adapters/index.js';

/** What the org answers with. Every field defaults to nothing found and nothing written. */
export type OrgState = {
    users: OrgUser[];
    permissionSets: OrgTarget[];
    permissionSetGroups: OrgTarget[];
    permissionSetLicenses: OrgTarget[];
    listed: DesiredAssignment[];
    current: ActualAssignment[];
    added: AssignmentOutcome[];
    updated: AssignmentOutcome[];
    removed: AssignmentOutcome[];
};

type CurrentQuery = {
    targets: TargetRef[];
    assignees: AssigneeRef[]
};

/** Every argument the port received, so a spec can assert what the org was asked to do. */
export type OrgCalls = {
    findUsers: Username[][];
    findPermissionSets: TargetName[][];
    findPermissionSetGroups: TargetName[][];
    findPermissionSetLicenses: TargetName[][];
    listAssignments: (AssignmentFilter | undefined)[];
    listCurrentAssignments: CurrentQuery[];
    addAssignments: ResolvedAddition[][];
    updateAssignments: AssignmentUpdate[][];
    removeAssignments: ActualAssignment[][];
};

/**
 * The org port, answering from data and recording what it was asked. Deliberately dumb: it
 * never filters by the argument it was handed, so what a spec puts in the state is exactly
 * what the service sees, and a count in an assertion is exact rather than derived.
 */
export class FakeOrgClient implements OrgClient {
    public readonly calls: OrgCalls = {
        findUsers: [],
        findPermissionSets: [],
        findPermissionSetGroups: [],
        findPermissionSetLicenses: [],
        listAssignments: [],
        listCurrentAssignments: [],
        addAssignments: [],
        updateAssignments: [],
        removeAssignments: [],
    };

    private readonly state: Partial<OrgState>;

    public constructor(state: Partial<OrgState> = {}) {
        this.state = state;
    }

    public findUsers(usernames: Username[]): Promise<OrgUser[]> {
        this.calls.findUsers.push(usernames);

        return Promise.resolve(this.state.users ?? []);
    }

    public findPermissionSets(names: TargetName[]): Promise<OrgTarget[]> {
        this.calls.findPermissionSets.push(names);

        return Promise.resolve(this.state.permissionSets ?? []);
    }

    public findPermissionSetGroups(names: TargetName[]): Promise<OrgTarget[]> {
        this.calls.findPermissionSetGroups.push(names);

        return Promise.resolve(this.state.permissionSetGroups ?? []);
    }

    public findPermissionSetLicenses(names: TargetName[]): Promise<OrgTarget[]> {
        this.calls.findPermissionSetLicenses.push(names);

        return Promise.resolve(this.state.permissionSetLicenses ?? []);
    }

    public listAssignments(filter?: AssignmentFilter): Promise<DesiredAssignment[]> {
        this.calls.listAssignments.push(filter);

        return Promise.resolve(this.state.listed ?? []);
    }

    public listCurrentAssignments(targets: TargetRef[], assignees: AssigneeRef[]): Promise<ActualAssignment[]> {
        this.calls.listCurrentAssignments.push({
            targets,
            assignees,
        });

        return Promise.resolve(this.state.current ?? []);
    }

    public addAssignments(additions: ResolvedAddition[]): Promise<AssignmentOutcome[]> {
        this.calls.addAssignments.push(additions);

        return Promise.resolve(this.state.added ?? []);
    }

    public updateAssignments(updates: AssignmentUpdate[]): Promise<AssignmentOutcome[]> {
        this.calls.updateAssignments.push(updates);

        return Promise.resolve(this.state.updated ?? []);
    }

    public removeAssignments(removals: ActualAssignment[]): Promise<AssignmentOutcome[]> {
        this.calls.removeAssignments.push(removals);

        return Promise.resolve(this.state.removed ?? []);
    }
}

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

type AssignmentInput = {
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
