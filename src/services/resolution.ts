import {
    DesiredAssignment,
    Kind,
    OrgTarget,
    OrgUser,
    ResolvedAddition,
    TargetName,
    TargetRef,
    Finding,
    Findings,
    kinds,
    distinctAssignees,
    distinctTargets,
    evaluateUsers,
    evaluateTargets,
    indexUsersById,
    indexTargetsById,
} from '../core/index.js';
import { OrgClient } from './adapters/index.js';

/**
 * What the org answered for every declared reference: the findings, plus the org ids of
 * the references that did resolve. The indexes stay private because they are keyed by the
 * identifiers' comparison key, and that rule belongs here rather than at every lookup.
 */
export class Resolution {
    public constructor(
        public readonly findings: Findings,
        private readonly userIds: Map<string, string>,
        private readonly targetIds: Record<Kind, Map<string, string>>,
    ) {}

    /** Every target that resolved, as the managed set to compare the org's state against. */
    public managedTargets(): TargetRef[] {
        const refs: TargetRef[] = [];

        for (const kind of kinds) {
            for (const id of this.targetIds[kind].values()) {
                refs.push({ kind, id });
            }
        }
        return refs;
    }

    /** Attach the resolved assignee and target ids to each addition, so it can be inserted. */
    public resolveAdditions(additions: DesiredAssignment[]): ResolvedAddition[] {
        return additions.map((addition) => ({
            ...addition,
            assigneeId: this.userIds.get(addition.assignee.asKey()) ?? '',
            targetId: this.targetIds[addition.kind].get(addition.target.asKey()) ?? '',
        }));
    }
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
                if (targets.length === 0) {
                    return { kind, targets, found: [] as OrgTarget[] };
                }

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
                    found.map((target) => target.name),
                )
            );
        }

        const targetIds = {} as Record<Kind, Map<string, string>>;

        for (const { kind, found } of perKind) {
            targetIds[kind] = indexTargetsById(found);
        }

        return new Resolution(Findings.of(findings), indexUsersById(foundUsers), targetIds);
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
