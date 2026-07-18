import {
    DesiredAssignment,
    Kind,
    OrgTarget,
    OrgUser,
    ResolvedAddition,
    TargetRef,
    Finding,
    kinds,
    distinctAssignees,
    distinctTargets,
    evaluateUsers,
    evaluateTargets,
    indexUsersById,
    indexTargetsById,
} from '../core/index.js';
import { OrgClient } from './adapters/index.js';

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

/** Attach the resolved assignee and target ids to each addition, so it can be inserted. */
export function resolveAdditions(additions: DesiredAssignment[], resolution: Resolution): ResolvedAddition[] {
    return additions.map((addition) => ({
        ...addition,
        assigneeId: resolution.userIds.get(addition.assignee.toLowerCase()) ?? '',
        targetId: resolution.targetIds[addition.kind].get(addition.target.toLowerCase()) ?? '',
    }));
}

/** Look every declared reference up in the org, returning findings and the resolved id maps. */
export class ResolutionService {
    public constructor(private readonly org: OrgClient) { }

    public async run(assignments: DesiredAssignment[]): Promise<Resolution> {
        const usernames = distinctAssignees(assignments);
        const targetsByKind = kinds.map((kind) => ({ kind, targets: distinctTargets(assignments, kind) }));

        const usersTask: Promise<OrgUser[]> =
            usernames.length > 0 ? this.org.findUsers(usernames) : Promise.resolve([]);
        const targetsTask = Promise.all(
            targetsByKind.map(async ({ kind, targets }) => {
                if (targets.length === 0) return { kind, targets, found: [] as OrgTarget[] };

                const found = await this.findTargetsOfKind(kind, targets);
                return { kind, targets, found };
            })
        );

        const [foundUsers, perKind] = await Promise.all([
            usersTask,
            targetsTask,
        ]);

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

    findTargetsOfKind(kind: Kind, names: string[]): Promise<OrgTarget[]> {
        if (kind === 'permissionSet') return this.org.findPermissionSets(names);
        if (kind === 'permissionSetGroup') return this.org.findPermissionSetGroups(names);
        if (kind === 'permissionSetLicense') return this.org.findPermissionSetLicenses(names);

        throw new Error(`Unsupported kind: ${kind}`);
    }
}
