import type { DesiredAssignment } from '../../../../lib/core/index.js';
import { desiredAssignment } from '../../builders.ts';

/** The report options a spec that is not about scoping wants: every operation, no unchanged. */
export const sync = {
    mode: 'sync',
    showUnchanged: false,
} as const;

/** A permission set grant, which is the only kind most of these specs need to vary. */
export function grant(assignee: string, target: string, expiration?: string): DesiredAssignment {
    return desiredAssignment({
        assignee,
        kind: 'permissionSet',
        target,
        expiration,
    });
}
