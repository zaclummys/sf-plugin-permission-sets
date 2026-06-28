import { loadFiles } from '../core/load.js';
import { countFindings } from '../core/report.js';
import { DesiredAssignment, Finding } from '../core/model.js';

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
    public constructor(private readonly files: string[], private readonly strict: boolean) {}

    public async run(): Promise<CheckResult> {
        const loaded = await loadFiles(this.files);
        const { errors, warnings } = countFindings(loaded.findings);
        const failed = errors > 0 || (this.strict && warnings > 0);

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
