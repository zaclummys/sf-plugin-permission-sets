import { loadFiles, DesiredAssignment, Findings } from '../core/index.js';

type CheckResult = {
    files: string[];
    assignments: DesiredAssignment[];
    findings: Findings;
    failed: boolean;
};

/**
 * Load the files, validate them, and summarize the findings. No org needed. Every command
 * that reads files starts here, so a rule added to the load is one every one of them gets.
 * `strict` is this service's own policy and defaults off: callers that only want the
 * findings ask them directly rather than inheriting a verdict they did not choose.
 */
export class CheckService {
    public async run(files: string[], strict = false): Promise<CheckResult> {
        const loaded = await loadFiles(files);
        const findings = loaded.findings;

        return {
            files: loaded.files,
            assignments: loaded.assignments,
            findings,
            failed: findings.blocks(strict),
        };
    }
}
