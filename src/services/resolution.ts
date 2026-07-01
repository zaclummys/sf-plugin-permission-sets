import { DesiredAssignment, Kind, OrgTarget, OrgUser, TargetRef } from '../core/model.js';
import { Finding } from '../core/finding.js';
import {
    kinds,
    distinctAssignees,
    distinctTargets,
    evaluateUsers,
    evaluateTargets,
    indexUsersById,
    indexTargetsById,
} from '../core/resolve.js';
import { OrgClient } from './adapters/org-client.js';

export type Resolution = {
    findings: Finding[];
    userIds: Map<string, string>;
    targetIds: Record<Kind, Map<string, string>>;
};

export function managedTargets(resolution: Resolution): TargetRef[] {
    const refs: TargetRef[] = [];
    for (const kind of kinds) {
        for (const id of resolution.targetIds[kind].values()) {
            refs.push({ kind, id });
        }
    }
    return refs;
}

/** Look every declared reference up in the org, returning findings and the resolved id maps. */
export class ResolutionService {
    public constructor(private readonly org: OrgClient, private readonly assignments: DesiredAssignment[]) {}

    public async run(): Promise<Resolution> {
        const usernames = distinctAssignees(this.assignments);
        const targetsByKind = kinds.map((kind) => ({ kind, targets: distinctTargets(this.assignments, kind) }));

        const usersTask: Promise<OrgUser[]> =
            usernames.length > 0 ? this.org.findUsers(usernames) : Promise.resolve([]);
        const targetsTask = Promise.all(
            targetsByKind.map(({ kind, targets }) =>
                (targets.length > 0 ? this.org.findTargets(kind, targets) : Promise.resolve<OrgTarget[]>([])).then(
                    (found) => ({ kind, targets, found })
                )
            )
        );

        const [foundUsers, perKind] = await Promise.all([usersTask, targetsTask]);

        const findings: Finding[] = [...evaluateUsers(usernames, foundUsers)];
        for (const { kind, targets, found } of perKind) {
            findings.push(
                ...evaluateTargets(
                    kind,
                    targets,
                    found.map((target) => target.name)
                )
            );
        }

        const targetIds = {} as Record<Kind, Map<string, string>>;
        for (const { kind, found } of perKind) {
            targetIds[kind] = indexTargetsById(found);
        }

        return { findings, userIds: indexUsersById(foundUsers), targetIds };
    }
}
