import {
    loadFiles,
    kinds,
    distinctAssignees,
    distinctTargets,
    evaluateUsers,
    evaluateTargets,
    DesiredAssignment,
    Finding,
    Findings,
    Kind,
    OrgTarget,
    TargetName,
    Username,
} from '../core/index.js';
import { OrgClient } from './adapters/index.js';

type ValidateResult = {
    files: string[];
    assignments: DesiredAssignment[];
    findings: Findings;
    failed: boolean;
};

/** Load the files, then resolve every reference against the org. */
export class ValidateService {
    public constructor(private readonly org: OrgClient) { }

    public async run(files: string[]): Promise<ValidateResult> {
        const loaded = await loadFiles(files);
        const resolved = await this.resolve(loaded.assignments);
        const findings = loaded.findings.concat(resolved);

        return {
            files: loaded.files,
            assignments: loaded.assignments,
            findings,
            failed: findings.hasErrors(),
        };
    }

    /** Look every reference up in the org (in parallel) and evaluate the results. */
    private async resolve(assignments: DesiredAssignment[]): Promise<Findings> {
        const tasks: Promise<Finding[]>[] = [];

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

        return Findings.of(results.flat());
    }

    private async evaluateUserRefs(usernames: Username[]): Promise<Finding[]> {
        const found = await this.org.findUsers(usernames);

        return evaluateUsers(usernames, found);
    }

    private async evaluateTargetRefs(kind: Kind, targets: TargetName[]): Promise<Finding[]> {
        const found = await this.findTargetsOfKind(kind, targets);

        return evaluateTargets(
            kind,
            targets,
            found.map((target) => target.name),
        );
    }

    // No default case on purpose: a new Kind then fails to compile here, which is a
    // better guard than a runtime throw the type system already proves unreachable.
    findTargetsOfKind(kind: Kind, names: TargetName[]): Promise<OrgTarget[]> {
        switch (kind) {
            case 'permissionSet':
                return this.org.findPermissionSets(names);
            case 'permissionSetGroup':
                return this.org.findPermissionSetGroups(names);
            case 'permissionSetLicense':
                return this.org.findPermissionSetLicenses(names);
        }
    }
}
