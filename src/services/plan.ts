import { loadFiles, diffAssignments, Diff, Finding, countFindings } from '../core/index.js';
import { OrgClient } from './adapters/index.js';
import { ResolutionService, managedTargets } from './resolution.js';

/** How a run ended, so the command can report and set the exit code. */
export type PlanStatus = 'planned' | 'invalid';

export type PlanResult = {
    files: string[];
    findings: Finding[];
    diff: Diff;
    status: PlanStatus;
};

/** An aborted-before-the-diff result, carrying the findings that explain why. */
function invalidResult(files: string[], findings: Finding[]): PlanResult {
    return {
        files,
        findings,
        diff: Diff.empty(),
        status: 'invalid',
    };
}

/**
 * Read-only preview: load the files, resolve every reference to an org id, fetch the
 * current state, and diff. The whole diff comes back, adds and would-be removes alike:
 * narrowing it to a mode is the caller's call, through Diff.scopeTo. Never changes the
 * org. This is the apply pipeline stopping before any DML.
 */
export class PlanService {
    public constructor(private readonly org: OrgClient) {}

    public async run(files: string[]): Promise<PlanResult> {
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

        const actual = await this.org.listCurrentAssignments(managedTargets(resolution));
        const diff = diffAssignments(loaded.assignments, actual);

        return { files: loaded.files, findings, diff, status: 'planned' };
    }
}
