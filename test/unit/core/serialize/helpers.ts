import type { DesiredAssignment } from '../../../../lib/core/index.js';
import { desiredAssignment } from '../../builders.ts';

/** A permission set grant, which is the only kind these specs need to vary. */
export function grant(assignee: string, target: string, expiration?: string): DesiredAssignment {
    return desiredAssignment({
        assignee,
        kind: 'permissionSet',
        target,
        expiration,
    });
}
