import {
    loadFiles,
    kinds,
    distinctAssignees,
    distinctTargets,
    evaluateUsers,
    evaluateTargets,
    DesiredAssignment,
    Finding,
    Kind,
    countFindings,
} from '../core/index.js';
import { OrgClient } from './adapters/index.js';

export type ValidateResult = {
    files: string[];
    assignments: DesiredAssignment[];
    findings: Finding[];
    errors: number;
    warnings: number;
    failed: boolean;
};

/** Load the files, then resolve every reference against the org. */
export class ValidateService {
    public constructor(private readonly org: OrgClient) {}

    public async run(files: string[]): Promise<ValidateResult> {
        const loaded = await loadFiles(files);
        const resolved = await this.resolve(loaded.assignments);

        const findings = [
            ...loaded.findings,
            ...resolved,
        ];
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
            tasks.push(this.evaluateUserRefs(usernames));
        }

        for (const kind of kinds) {
            const targets = distinctTargets(assignments, kind);
            if (targets.length > 0) {
                tasks.push(this.evaluateTargetRefs(kind, targets));
            }
        }

        const results = await Promise.all(tasks);
        return results.flat();
    }

    private async evaluateUserRefs(usernames: string[]): Promise<Finding[]> {
        const found = await this.org.findUsers(usernames);
        return evaluateUsers(usernames, found);
    }

    private async evaluateTargetRefs(kind: Kind, targets: string[]): Promise<Finding[]> {
        const found = await this.org.findTargets(kind, targets);
        return evaluateTargets(
            kind,
            targets,
            found.map((target) => target.name)
        );
    }
}
