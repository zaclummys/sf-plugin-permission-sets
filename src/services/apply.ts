import { loadFiles } from '../core/load.js';
import { diffAssignments } from '../core/diff.js';
import {
    kinds,
    distinctAssignees,
    distinctTargets,
    evaluateUsers,
    evaluateTargets,
    indexUsersById,
    indexTargetsById,
} from '../core/resolve.js';
import {
    ActualAssignment,
    AssignmentOutcome,
    DesiredAssignment,
    Diff,
    Kind,
    OrgTarget,
    OrgUser,
    ResolvedAddition,
    TargetRef,
} from '../core/model.js';
import { Finding, countFindings } from '../core/finding.js';
import { OrgClient } from './adapters/org-client.js';

export type ApplyMode = 'additive' | 'destructive' | 'sync';

export type ApplyInput = {
    mode: ApplyMode;
    maxDeletes: number;
    dryRun: boolean;
};

/** How a run ended, so the command can report and set the exit code. */
export type ApplyStatus = 'applied' | 'dry-run' | 'declined' | 'max-deletes-exceeded' | 'invalid';

export type ApplyResult = {
    files: string[];
    findings: Finding[];
    diff: Diff;
    /** What the chosen mode did not act on (surfaced as drift). */
    drift: { adds: number; removes: number };
    outcomes: AssignmentOutcome[];
    status: ApplyStatus;
    failed: boolean;
};

type Resolution = {
    findings: Finding[];
    userIds: Map<string, string>;
    targetIds: Record<Kind, Map<string, string>>;
};

const emptyDiff: Diff = { toAdd: [], toRemove: [], unchanged: [] };

/** An aborted-before-any-change result, carrying the findings that explain why. */
function invalidResult(files: string[], findings: Finding[]): ApplyResult {
    return {
        files,
        findings,
        diff: emptyDiff,
        drift: { adds: 0, removes: 0 },
        outcomes: [],
        status: 'invalid',
        failed: true,
    };
}

/** The resolved ids of every declared target, to fetch their current memberships. */
function managedTargets(resolution: Resolution): TargetRef[] {
    const refs: TargetRef[] = [];
    for (const kind of kinds) {
        for (const id of resolution.targetIds[kind].values()) {
            refs.push({ kind, id });
        }
    }
    return refs;
}

/**
 * Online apply: load the files, resolve every reference to an org id, diff against
 * the org's current state, then add and/or remove per the mode. Deletions are
 * capped by maxDeletes and gated by an injected confirmation.
 */
export class ApplyService {
    public constructor(
        private readonly org: OrgClient,
        private readonly files: string[],
        private readonly input: ApplyInput,
        private readonly confirmDeletions: (count: number) => Promise<boolean>
    ) {}

    public async run(): Promise<ApplyResult> {
        const loaded = await loadFiles(this.files);
        if (countFindings(loaded.findings).errors > 0) {
            return invalidResult(loaded.files, loaded.findings);
        }

        const resolution = await this.resolve(loaded.assignments);
        const findings = [...loaded.findings, ...resolution.findings];
        if (countFindings(findings).errors > 0) {
            return invalidResult(loaded.files, findings);
        }

        const actual = await this.org.currentAssignments(managedTargets(resolution));
        const diff = diffAssignments(loaded.assignments, actual);

        const { mode, maxDeletes, dryRun } = this.input;
        const additions = mode === 'destructive' ? [] : diff.toAdd;
        const removals = mode === 'additive' ? [] : diff.toRemove;
        const drift = {
            adds: mode === 'destructive' ? diff.toAdd.length : 0,
            removes: mode === 'additive' ? diff.toRemove.length : 0,
        };

        if (removals.length > maxDeletes) {
            return {
                files: loaded.files,
                findings,
                diff,
                drift,
                outcomes: [],
                status: 'max-deletes-exceeded',
                failed: true,
            };
        }

        if (dryRun) {
            return { files: loaded.files, findings, diff, drift, outcomes: [], status: 'dry-run', failed: false };
        }

        if (removals.length > 0) {
            const confirmed = await this.confirmDeletions(removals.length);
            if (!confirmed) {
                return { files: loaded.files, findings, diff, drift, outcomes: [], status: 'declined', failed: false };
            }
        }

        const outcomes = await this.execute(additions, removals, resolution);
        const failed = outcomes.some((outcome) => !outcome.success);

        return { files: loaded.files, findings, diff, drift, outcomes, status: 'applied', failed };
    }

    /** Look every declared reference up in the org, returning findings and the id maps. */
    private async resolve(assignments: DesiredAssignment[]): Promise<Resolution> {
        const usernames = distinctAssignees(assignments);
        const targetsByKind = kinds.map((kind) => ({ kind, targets: distinctTargets(assignments, kind) }));

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
        const targetIds = {} as Record<Kind, Map<string, string>>;
        for (const { kind, targets, found } of perKind) {
            findings.push(
                ...evaluateTargets(
                    kind,
                    targets,
                    found.map((target) => target.name)
                )
            );
            targetIds[kind] = indexTargetsById(found);
        }

        return { findings, userIds: indexUsersById(foundUsers), targetIds };
    }

    private async execute(
        additions: DesiredAssignment[],
        removals: ActualAssignment[],
        resolution: Resolution
    ): Promise<AssignmentOutcome[]> {
        const resolved: ResolvedAddition[] = additions.map((addition) => ({
            ...addition,
            assigneeId: resolution.userIds.get(addition.assignee.toLowerCase()) ?? '',
            targetId: resolution.targetIds[addition.kind].get(addition.target.toLowerCase()) ?? '',
        }));

        const [added, removed] = await Promise.all([
            resolved.length > 0 ? this.org.addAssignments(resolved) : Promise.resolve<AssignmentOutcome[]>([]),
            removals.length > 0 ? this.org.removeAssignments(removals) : Promise.resolve<AssignmentOutcome[]>([]),
        ]);

        return [...added, ...removed];
    }
}
