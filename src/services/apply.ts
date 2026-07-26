import {
    ActualAssignment,
    AssignmentOutcome,
    AssignmentUpdate,
    Diff,
    ResolvedAddition,
    Findings,
} from '../core/index.js';
import { OrgClient } from './adapters/index.js';
import { PlanService } from './plan.js';

export type ApplyMode = 'additive' | 'destructive' | 'sync';

/** How the service asks its caller to approve a destructive batch before applying it. */
export type ConfirmDeletions = (count: number) => Promise<boolean>;

export type ApplyInput = {
    mode: ApplyMode;
    maxDeletes: number;
    dryRun: boolean;
};

/** How a run ended, so the command can report and set the exit code. */
export type ApplyStatus = 'applied' | 'dry-run' | 'declined' | 'max-deletes-exceeded' | 'invalid';

export type ApplyResult = {
    files: string[];
    findings: Findings;
    diff: Diff;
    outcomes: AssignmentOutcome[];
    status: ApplyStatus;
    failed: boolean;
};

/** An aborted-before-any-change result, carrying the findings that explain why. */
function invalidResult(files: string[], findings: Findings): ApplyResult {
    return {
        files,
        findings,
        diff: Diff.empty(),
        outcomes: [],
        status: 'invalid',
        failed: true,
    };
}

/**
 * Plan the run, then add and/or remove per the mode. The whole read-only half is
 * PlanService: apply is that plan carried through to the DML, so the two can never
 * disagree about what a set of files means. Deletions are capped by maxDeletes and
 * gated by an injected confirmation.
 */
export class ApplyService {
    public constructor(
        private readonly org: OrgClient,
        private readonly confirmDeletions: ConfirmDeletions
    ) {}

    public async run(files: string[], input: ApplyInput): Promise<ApplyResult> {
        const planService = new PlanService(this.org);
        const plan = await planService.run(files);

        if (plan.status === 'invalid') {
            return invalidResult(plan.files, plan.findings);
        }

        const { files: planned, findings, diff } = plan;
        const { mode, maxDeletes, dryRun } = input;
        const { additions, updates, removals } = diff.scopeTo(mode);

        if (removals.length > maxDeletes) {
            return {
                files: planned,
                findings,
                diff,
                outcomes: [],
                status: 'max-deletes-exceeded',
                failed: true,
            };
        }

        if (dryRun) {
            return { files: planned, findings, diff, outcomes: [], status: 'dry-run', failed: false };
        }

        if (removals.length > 0) {
            const confirmed = await this.confirmDeletions(removals.length);
            if (!confirmed) {
                return { files: planned, findings, diff, outcomes: [], status: 'declined', failed: false };
            }
        }

        const outcomes = await this.executeResolved(plan.resolution.resolveAdditions(additions), updates, removals);
        const failed = outcomes.some((outcome) => !outcome.success);

        return { files: planned, findings, diff, outcomes, status: 'applied', failed };
    }

    private async executeResolved(
        additions: ResolvedAddition[],
        updates: AssignmentUpdate[],
        removals: ActualAssignment[]
    ): Promise<AssignmentOutcome[]> {
        const [added, updated, removed] = await Promise.all([
            additions.length > 0 ? this.org.addAssignments(additions) : Promise.resolve<AssignmentOutcome[]>([]),
            updates.length > 0 ? this.org.updateAssignments(updates) : Promise.resolve<AssignmentOutcome[]>([]),
            removals.length > 0 ? this.org.removeAssignments(removals) : Promise.resolve<AssignmentOutcome[]>([]),
        ]);

        return [
            ...added,
            ...updated,
            ...removed,
        ];
    }
}
