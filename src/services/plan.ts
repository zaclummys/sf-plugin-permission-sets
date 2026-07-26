import { loadFiles, diffAssignments, Diff, Findings } from '../core/index.js';
import { OrgClient } from './adapters/index.js';
import { Resolution, ResolutionService } from './resolution.js';

/** What every plan reports, however it ended, so the caller can set the exit code. */
type PlannedFiles = {
    files: string[];
    findings: Findings;
    diff: Diff;
};

/**
 * A plan, discriminated by status so that only a plan the org answered carries the
 * Resolution. Apply needs the resolved ids to insert with, and the discriminant is what
 * proves it can reach them only on the path where every reference did resolve.
 */
export type PlanResult =
    | (PlannedFiles & { status: 'invalid' })
    | (PlannedFiles & { status: 'planned'; resolution: Resolution });

/** An aborted-before-the-diff result, carrying the findings that explain why. */
function invalidResult(files: string[], findings: Findings): PlanResult {
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
        if (loaded.findings.hasErrors()) {
            return invalidResult(loaded.files, loaded.findings);
        }

        const resolutionService = new ResolutionService(this.org);
        const resolution = await resolutionService.run(loaded.assignments);
        const findings = loaded.findings.concat(resolution.findings);

        if (findings.hasErrors()) {
            return invalidResult(loaded.files, findings);
        }

        const actual = await this.org.listCurrentAssignments(resolution.managedTargets());
        const diff = diffAssignments(loaded.assignments, actual);

        return { files: loaded.files, findings, diff, resolution, status: 'planned' };
    }
}
