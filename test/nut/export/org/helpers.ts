import { org } from '../../org-session.ts';
import type { PsExportResult } from '../../../../src/commands/ps/export.js';

/**
 * An export scoped to islandUser, who holds Zeta and an expiring Eta and nothing else. That
 * is what makes the counts exact rather than "whatever the org happens to have", and what
 * keeps the apply specs from moving them.
 */
export function exportIsland(args: string, ensureExitCode: number | 'nonZero') {
    const island = org.getIslandUser();

    return org.runPs<PsExportResult>(`export --user ${island} ${args}`, ensureExitCode);
}
