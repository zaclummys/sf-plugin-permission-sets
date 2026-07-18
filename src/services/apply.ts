import {
    loadFiles,
    diffAssignments,
    ActualAssignment,
    AssignmentOutcome,
    AssignmentUpdate,
    DesiredAssignment,
    Diff,
    ResolvedAddition,
    Finding,
    countFindings,
} from '../core/index.js';
import { OrgClient } from './adapters/org-client.js';
import { Resolution, ResolutionService, managedTargets } from './resolution.js';

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
    drift: { adds: number; updates: number; removes: number };
    outcomes: AssignmentOutcome[];
    status: ApplyStatus;
    failed: boolean;
};

const emptyDiff: Diff = { toAdd: [], toUpdate: [], toRemove: [], unchanged: [] };

/** An aborted-before-any-change result, carrying the findings that explain why. */
function invalidResult(files: string[], findings: Finding[]): ApplyResult {
    return {
        files,
        findings,
        diff: emptyDiff,
        drift: { adds: 0, updates: 0, removes: 0 },
        outcomes: [],
        status: 'invalid',
        failed: true,
    };
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

        const resolutionService = new ResolutionService(this.org, loaded.assignments);
        const resolution = await resolutionService.run();
        const findings = [...loaded.findings, ...resolution.findings];
        if (countFindings(findings).errors > 0) {
            return invalidResult(loaded.files, findings);
        }

        const actual = await this.org.currentAssignments(managedTargets(resolution));
        const diff = diffAssignments(loaded.assignments, actual);

        const { mode, maxDeletes, dryRun } = this.input;
        const additions = mode === 'destructive' ? [] : diff.toAdd;
        const updates = mode === 'destructive' ? [] : diff.toUpdate;
        const removals = mode === 'additive' ? [] : diff.toRemove;
        const drift = {
            adds: mode === 'destructive' ? diff.toAdd.length : 0,
            updates: mode === 'destructive' ? diff.toUpdate.length : 0,
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

        const outcomes = await this.execute(additions, updates, removals, resolution);
        const failed = outcomes.some((outcome) => !outcome.success);

        return { files: loaded.files, findings, diff, drift, outcomes, status: 'applied', failed };
    }

    private async execute(
        additions: DesiredAssignment[],
        updates: AssignmentUpdate[],
        removals: ActualAssignment[],
        resolution: Resolution
    ): Promise<AssignmentOutcome[]> {
        const resolved: ResolvedAddition[] = additions.map((addition) => ({
            ...addition,
            assigneeId: resolution.userIds.get(addition.assignee.toLowerCase()) ?? '',
            targetId: resolution.targetIds[addition.kind].get(addition.target.toLowerCase()) ?? '',
        }));

        const [added, updated, removed] = await Promise.all([
            resolved.length > 0 ? this.org.addAssignments(resolved) : Promise.resolve<AssignmentOutcome[]>([]),
            updates.length > 0 ? this.org.updateAssignments(updates) : Promise.resolve<AssignmentOutcome[]>([]),
            removals.length > 0 ? this.org.removeAssignments(removals) : Promise.resolve<AssignmentOutcome[]>([]),
        ]);

        return [...added, ...updated, ...removed];
    }
}
