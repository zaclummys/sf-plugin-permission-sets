import {
    ActualAssignment,
    AssignmentOutcome,
    AssignmentUpdate,
    DesiredAssignment,
    Kind,
    OrgTarget,
    OrgUser,
    ResolvedAddition,
    TargetRef,
} from '../../core/model.js';

/**
 * Port: the org operations a service needs, in domain terms. Declared here, by the
 * consumer, so services depend on the abstraction and the adapter implements it.
 */
export interface OrgClient {
    /** The users that exist in the org, among the given usernames. */
    findUsers(usernames: string[]): Promise<OrgUser[]>;
    /** The targets (with ids) that exist in the org, among the given names of one kind. */
    findTargets(kind: Kind, names: string[]): Promise<OrgTarget[]>;
    /** Every assignable permission set, group, and license assignment held by active users. */
    listAssignments(): Promise<DesiredAssignment[]>;
    /** The current assignments of the given managed targets, with their record ids. */
    currentAssignments(targets: TargetRef[]): Promise<ActualAssignment[]>;
    /** Insert the given assignments, reporting per-record success or failure. */
    addAssignments(additions: ResolvedAddition[]): Promise<AssignmentOutcome[]>;
    /** Update the expiration of the given assignments, reporting per-record success or failure. */
    updateAssignments(updates: AssignmentUpdate[]): Promise<AssignmentOutcome[]>;
    /** Delete the given assignments by record id, reporting per-record success or failure. */
    removeAssignments(removals: ActualAssignment[]): Promise<AssignmentOutcome[]>;
}
