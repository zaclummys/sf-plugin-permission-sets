// The assignments PS_TARGET_ORG is expected to hold. The fixtures that describe a diff
// name these values directly, so a test reads as the exact state it asserts on instead of
// deriving it at run time. Pointing the suite at another org means updating these and
// test/fixtures/undeclared-assignment.yml to match it.

/** A user the org holds an assignment for, and the permission set it is assigned. */
export const declaredUser = 'zaclummys@gmail.com.cicd';

/** declaredUser spelled in a case the org does not store it in, for the case-insensitive matching. */
export const declaredUserOtherCase = 'ZACLUMMYS@GMAIL.COM.CICD';
export const declaredPermissionSet = 'Experience_Profile_Manager';

/** The permission set undeclared-assignment.yml re-declares, and the user that really holds it. */
export const undeclaredPermissionSet = 'sfdc_scrt2';
export const undeclaredHolder = 'cloud@00dak00000mqgojeal';
