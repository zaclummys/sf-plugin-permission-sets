import { loadFiles, DesiredAssignment, Finding, countFindings } from '../core/index.js';

export type CheckResult = {
    files: string[];
    assignments: DesiredAssignment[];
    findings: Finding[];
    errors: number;
    warnings: number;
    failed: boolean;
};

/** Offline check: load the files, validate them, and summarize the findings. */
export class CheckService {
    public async run(files: string[], strict: boolean): Promise<CheckResult> {
        const loaded = await loadFiles(files);
        const { errors, warnings } = countFindings(loaded.findings);
        const failed = errors > 0 || (strict && warnings > 0);

        return {
            files: loaded.files,
            assignments: loaded.assignments,
            findings: loaded.findings,
            errors,
            warnings,
            failed,
        };
    }
}
