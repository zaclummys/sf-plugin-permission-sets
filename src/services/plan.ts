import { loadFiles } from '../core/load.js';
import { diffAssignments } from '../core/diff.js';
import {
    kinds,
    distinctAssignees,
    distinctTargets,
    evaluateUsers,
    evaluateTargets,
    indexTargetsById,
} from '../core/resolve.js';
import { DesiredAssignment, Diff, Kind, OrgTarget, OrgUser, TargetRef } from '../core/model.js';
import { Finding, countFindings } from '../core/finding.js';
import { OrgClient } from './adapters/org-client.js';

export type PlanMode = 'additive' | 'destructive' | 'sync';

export type PlanInput = {
    mode: PlanMode;
};

/** How a run ended, so the command can report and set the exit code. */
export type PlanStatus = 'planned' | 'invalid';

export type PlanResult = {
    files: string[];
    findings: Finding[];
    diff: Diff;
    /** What the chosen mode would not act on (surfaced as drift). */
    drift: { adds: number; updates: number; removes: number };
    status: PlanStatus;
};

/** The resolved target ids, enough to fetch the current memberships. No user ids: plan never assigns. */
type Resolution = {
    findings: Finding[];
    targetIds: Record<Kind, Map<string, string>>;
};

const emptyDiff: Diff = { toAdd: [], toUpdate: [], toRemove: [], unchanged: [] };

/** An aborted-before-the-diff result, carrying the findings that explain why. */
function invalidResult(files: string[], findings: Finding[]): PlanResult {
    return { files, findings, diff: emptyDiff, drift: { adds: 0, updates: 0, removes: 0 }, status: 'invalid' };
}

/**
 * Read-only preview: load the files, resolve every reference to an org id, fetch the
 * current state, and diff. The full diff (adds and would-be removes) is always returned
 * regardless of mode; drift is whatever the chosen mode would not act on. Never changes
 * the org. This is the apply pipeline stopping before any DML.
 */
export class PlanService {
    public constructor(
        private readonly org: OrgClient,
        private readonly files: string[],
        private readonly input: PlanInput
    ) {}

    public async run(): Promise<PlanResult> {
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
        const { mode } = this.input;
        const drift = {
            adds: mode === 'destructive' ? diff.toAdd.length : 0,
            updates: mode === 'destructive' ? diff.toUpdate.length : 0,
            removes: mode === 'additive' ? diff.toRemove.length : 0,
        };

        return { files: loaded.files, findings, diff, drift, status: 'planned' };
    }

    /** Look every declared reference up in the org, returning findings and the target id maps. */
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

        return { findings, targetIds };
    }
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
