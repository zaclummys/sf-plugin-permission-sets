import { loadFiles, DesiredAssignment, Findings } from '../core/index.js';

export type CheckResult = {
    files: string[];
    assignments: DesiredAssignment[];
    findings: Findings;
    failed: boolean;
};

/** Load the files, validate them, and summarize the findings. No org needed. */
export class CheckService {
    public async run(files: string[], strict: boolean): Promise<CheckResult> {
        const loaded = await loadFiles(files);
        const findings = loaded.findings;

        return {
            files: loaded.files,
            assignments: loaded.assignments,
            findings,
            failed: findings.hasErrors() || (strict && findings.hasWarnings()),
        };
    }
}
