import {
    ActualAssignment,
    AssignmentFilter,
    AssignmentOutcome,
    AssignmentUpdate,
    DesiredAssignment,
    OrgTarget,
    OrgUser,
    ResolvedAddition,
    TargetRef,
} from '../../core/index.js';

/**
 * Port: the org operations a service needs, in domain terms. Declared here, by the
 * consumer, so services depend on the abstraction and the adapter implements it.
 */
export interface OrgClient {
    /** The users that exist in the org, among the given usernames. */
    findUsers(usernames: string[]): Promise<OrgUser[]>;
    /** The permission sets (with ids) that exist in the org, among the given names. */
    findPermissionSets(names: string[]): Promise<OrgTarget[]>;
    /** The permission set groups (with ids) that exist in the org, among the given developer names. */
    findPermissionSetGroups(names: string[]): Promise<OrgTarget[]>;
    /** The permission set licenses (with ids) that exist in the org, among the given developer names. */
    findPermissionSetLicenses(names: string[]): Promise<OrgTarget[]>;
    /** Every assignable permission set, group, and license assignment held by active users, narrowed by the filter. */
    listAssignments(filter?: AssignmentFilter): Promise<DesiredAssignment[]>;
    /** The current assignments of the given managed targets, with their record ids. */
    listCurrentAssignments(targets: TargetRef[]): Promise<ActualAssignment[]>;
    /** Insert the given assignments, reporting per-record success or failure. */
    addAssignments(additions: ResolvedAddition[]): Promise<AssignmentOutcome[]>;
    /** Update the expiration of the given assignments, reporting per-record success or failure. */
    updateAssignments(updates: AssignmentUpdate[]): Promise<AssignmentOutcome[]>;
    /** Delete the given assignments by record id, reporting per-record success or failure. */
    removeAssignments(removals: ActualAssignment[]): Promise<AssignmentOutcome[]>;
}
