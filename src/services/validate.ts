import { DesiredAssignment, Findings } from '../core/index.js';
import { OrgClient } from './adapters/index.js';
import { CheckService } from './check.js';
import { ResolutionService } from './resolution.js';

type ValidateResult = {
    files: string[];
    assignments: DesiredAssignment[];
    findings: Findings;
    failed: boolean;
};

/**
 * Load the files, then resolve every reference against the org. This is the plan pipeline
 * stopping before the diff: the same CheckService and the same ResolutionService, so a rule
 * added to either is one validate reports on too, and the two can never disagree about what
 * a file means. The resolved ids are discarded, because validate never writes.
 */
export class ValidateService {
    public constructor(private readonly org: OrgClient) { }

    public async run(files: string[]): Promise<ValidateResult> {
        const checkService = new CheckService();
        const checked = await checkService.run(files);
        const resolutionService = new ResolutionService(this.org);
        const resolution = await resolutionService.run(checked.assignments);
        const findings = Findings
            .empty()
            .concat(checked.findings)
            .concat(resolution.findings);

        return {
            files: checked.files,
            assignments: checked.assignments,
            findings,
            failed: findings.hasErrors(),
        };
    }
}
