// The assignments PS_TARGET_ORG is expected to hold. The fixtures that describe a diff
// name these values directly, so a test reads as the exact state it asserts on instead of
// deriving it at run time. Pointing the suite at another org means updating these to match it.

/** A user the org holds assignments for. */
export const declaredUser = 'zaclummys@gmail.com.cicd';

/** declaredUser spelled in a case the org does not store it in, for the case-insensitive matching. */
export const declaredUserOtherCase = 'ZACLUMMYS@GMAIL.COM.CICD';

/**
 * The user a spec grants its own permission sets to (see test/helpers/org-state.js). It is
 * deliberately not declaredUser: those two names split the org in half so the specs that
 * build their own state and the specs that read a snapshot of the org cannot see each
 * other, however they interleave. A permission set a spec creates is therefore never in a
 * snapshot, which is what lets it be deleted mid-run without turning another spec red.
 *
 * The half declaredUser owns has one standing requirement: nobody else may hold the
 * permission sets it holds, or a snapshot of it would plan a removal for the other holder.
 */
export const islandUser = 'zaclummys@gmail.com.cicd.user';
