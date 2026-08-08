import type { ReconcileMode } from '../../../lib/core/index.js';
import type { OrgState } from '../fake-org-client.ts';
import { heldAlpha, heldBeta, resolvedOrg } from '../org-fixtures.ts';

/**
 * The per-run input ApplyService takes. Spelled out here because the services barrel does
 * not export it, so a caller builds the object structurally.
 */
type ApplyInput = {
    mode: ReconcileMode;
    maxDeletes: number;
    dryRun: boolean;
    strict: boolean
};

/** A sync run with a cap high enough not to trip, which each spec narrows to its case. */
export function applyInput(overrides: Partial<ApplyInput> = {}): ApplyInput {
    return {
        mode: 'sync',
        maxDeletes: 10,
        dryRun: false,
        strict: false,
        ...overrides,
    };
}

/** Resolves one-assignment.yml and holds none of it, so a plan finds one addition. */
export const holdingNothing: Partial<OrgState> = {
    ...resolvedOrg,
    current: [],
};

/** Holds exactly what one-assignment.yml declares, so a plan finds nothing to do. */
export const holdingAlpha: Partial<OrgState> = {
    ...resolvedOrg,
    current: [heldAlpha],
};

/** Holds only a grant no file declares, so a plan finds one addition and one removal. */
export const holdingBeta: Partial<OrgState> = {
    ...resolvedOrg,
    current: [heldBeta],
};

/** Holds the declared grant and an undeclared one, so a plan finds one removal alone. */
export const holdingBoth: Partial<OrgState> = {
    ...resolvedOrg,
    current: [
        heldAlpha,
        heldBeta,
    ],
};
