import {
    loadFiles,
    kinds,
    distinctAssignees,
    distinctTargets,
    evaluateUsers,
    evaluateTargets,
    DesiredAssignment,
    Finding,
    countFindings,
} from '../core/index.js';
import { OrgClient } from './adapters/org-client.js';

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
    public constructor(private readonly org: OrgClient, private readonly files: string[]) {}

    public async run(): Promise<ValidateResult> {
        const loaded = await loadFiles(this.files);
        const online = await this.resolve(loaded.assignments);

        const findings = [...loaded.findings, ...online];
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

    /** Look every reference up in the org (in parallel) and evaluate the results. */
    private async resolve(assignments: DesiredAssignment[]): Promise<Finding[]> {
        const tasks: Array<Promise<Finding[]>> = [];

        const usernames = distinctAssignees(assignments);
        if (usernames.length > 0) {
            tasks.push(this.org.findUsers(usernames).then((found) => evaluateUsers(usernames, found)));
        }

        for (const kind of kinds) {
            const targets = distinctTargets(assignments, kind);
            if (targets.length > 0) {
                tasks.push(
                    this.org.findTargets(kind, targets).then((found) =>
                        evaluateTargets(
                            kind,
                            targets,
                            found.map((target) => target.name)
                        )
                    )
                );
            }
        }

        const results = await Promise.all(tasks);
        return results.flat();
    }
}
