import { Kind, OrgUser } from '../core/model.js';

/**
 * Port: the org lookups a service needs, in domain terms. Declared here, by the
 * consumer, so services depend on the abstraction and the adapter implements it.
 */
export interface OrgClient {
    /** The users that exist in the org, among the given usernames. */
    findUsers(usernames: string[]): Promise<OrgUser[]>;
    /** The identifiers that exist in the org, among the given targets of one kind. */
    findTargets(kind: Kind, names: string[]): Promise<string[]>;
}
