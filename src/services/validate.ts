import { Connection } from '@salesforce/core';
import { loadFiles } from '../core/load.js';
import { countFindings } from '../core/report.js';
import { planResolution } from '../core/resolve.js';
import { DesiredAssignment, Finding } from '../core/model.js';

export type ValidateResult = {
    files: string[];
    assignments: DesiredAssignment[];
    findings: Finding[];
    errors: number;
    warnings: number;
    failed: boolean;
};

/** Online validate: run the offline load, then resolve every reference against the org. */
export class ValidateService {
    public constructor(private readonly connection: Connection, private readonly files: string[]) {}

    public async run(): Promise<ValidateResult> {
        const loaded = await loadFiles(this.files);

        const steps = planResolution(loaded.assignments);
        const resolved = await Promise.all(
            steps.map(async (step) => {
                const result = await this.connection.autoFetchQuery(step.soql);
                return step.evaluate(result.records);
            })
        );

        const findings = [...loaded.findings, ...resolved.flat()];
        const { errors, warnings } = countFindings(findings);

        return {
            files: loaded.files,
            assignments: loaded.assignments,
            findings,
            errors,
            warnings,
            failed: errors > 0,
        };
    }
}
