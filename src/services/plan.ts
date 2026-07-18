import { loadFiles, diffAssignments, Diff, Finding, Kind, countFindings } from '../core/index.js';
import { OrgClient } from './adapters/index.js';
import { Resolution, ResolutionService, managedTargets } from './resolution.js';

export type PlanMode = 'additive' | 'destructive' | 'sync';

/** How a run ended, so the command can report and set the exit code. */
export type PlanStatus = 'planned' | 'invalid';

export type PlanResult = {
    files: string[];
    findings: Finding[];
    diff: Diff;
    /** What the chosen mode would not act on (surfaced as drift). */
    drift: { adds: number; updates: number; removes: number };
    /** The resolved id maps, so callers can freeze a plan without re-resolving. */
    resolution: Resolution;
    status: PlanStatus;
};

const emptyDiff: Diff = { toAdd: [], toUpdate: [], toRemove: [], unchanged: [] };

const emptyResolution: Resolution = {
    findings: [],
    userIds: new Map(),
    targetIds: {} as Record<Kind, Map<string, string>>,
};

/** An aborted-before-the-diff result, carrying the findings that explain why. */
function invalidResult(files: string[], findings: Finding[]): PlanResult {
    return {
        files,
        findings,
        diff: emptyDiff,
        drift: { adds: 0, updates: 0, removes: 0 },
        resolution: emptyResolution,
        status: 'invalid',
    };
}

/**
 * Read-only preview: load the files, resolve every reference to an org id, fetch the
 * current state, and diff. The full diff (adds and would-be removes) is always returned
 * regardless of mode; drift is whatever the chosen mode would not act on. Never changes
 * the org. This is the apply pipeline stopping before any DML.
 */
export class PlanService {
    public constructor(private readonly org: OrgClient) {}

    public async run(files: string[], mode: PlanMode): Promise<PlanResult> {
        const loaded = await loadFiles(files);
        const loadCounts = countFindings(loaded.findings);
        if (loadCounts.errors > 0) {
            return invalidResult(loaded.files, loaded.findings);
        }

        const resolutionService = new ResolutionService(this.org);
        const resolution = await resolutionService.run(loaded.assignments);
        const findings = [
            ...loaded.findings,
            ...resolution.findings,
        ];
        const findingCounts = countFindings(findings);
        if (findingCounts.errors > 0) {
            return invalidResult(loaded.files, findings);
        }

        const actual = await this.org.currentAssignments(managedTargets(resolution));
        const diff = diffAssignments(loaded.assignments, actual);
        const drift = {
            adds: mode === 'destructive' ? diff.toAdd.length : 0,
            updates: mode === 'destructive' ? diff.toUpdate.length : 0,
            removes: mode === 'additive' ? diff.toRemove.length : 0,
        };

        return { files: loaded.files, findings, diff, drift, resolution, status: 'planned' };
    }
}
