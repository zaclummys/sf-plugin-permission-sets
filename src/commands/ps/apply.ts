import { readFile } from 'node:fs/promises';
import { SfCommand, Flags } from '@salesforce/sf-plugins-core';
import { Messages } from '@salesforce/core';

import { ConnectionOrgClient } from '../../adapters/index.js';
import { ApplyService, ConfirmDeletions, ApplyResult } from '../../services/index.js';
import { formatDiff, formatFindings, parsePlan, ReconcileMode, SavedPlan } from '../../core/index.js';

Messages.importMessagesDirectoryFromMetaUrl(import.meta.url);
const messages = Messages.loadMessages('sf-plugin-permission-sets', 'ps.apply');

export type PsApplyResult = {
    status: string;
    toAdd: number;
    toUpdate: number;
    toRemove: number;
    added: number;
    updated: number;
    removed: number;
    failures: number;
};

export default class Apply extends SfCommand<PsApplyResult> {
    public static readonly summary = messages.getMessage('summary');
    public static readonly description = messages.getMessage('description');
    public static readonly examples = messages.getMessages('examples');

    public static readonly flags = {
        'target-org': Flags.requiredOrg(),
        file: Flags.string({
            char: 'f',
            summary: messages.getMessage('flags.file.summary'),
            multiple: true,
        }),
        plan: Flags.string({
            summary: messages.getMessage('flags.plan.summary'),
        }),
        mode: Flags.option({
            summary: messages.getMessage('flags.mode.summary'),
            options: ['additive', 'destructive', 'sync'] as const,
            default: 'additive',
        })(),
        'max-deletes': Flags.integer({
            summary: messages.getMessage('flags.max-deletes.summary'),
            default: 50,
            min: 0,
        }),
        'dry-run': Flags.boolean({
            summary: messages.getMessage('flags.dry-run.summary'),
        }),
        'show-unchanged': Flags.boolean({
            summary: messages.getMessage('flags.show-unchanged.summary'),
        }),
        'no-prompt': Flags.boolean({
            summary: messages.getMessage('flags.no-prompt.summary'),
        }),
    };

    public async run(): Promise<PsApplyResult> {
        const { flags } = await this.parse(Apply);
        this.validateSource(flags);

        const targetOrg = flags['target-org'];
        const connection = targetOrg.getConnection();
        const orgClient = new ConnectionOrgClient(connection);
        const confirmDeletions: ConfirmDeletions = async (count) => {
            if (flags['no-prompt']) return true;
            if (this.jsonEnabled()) throw messages.createError('error.promptInJson');
            return this.confirmDelete(count);
        };
        const service = new ApplyService(orgClient, confirmDeletions);

        const outcome = flags.plan
            ? await this.runFromPlan(service, flags, targetOrg)
            : await this.runFromFiles(service, flags);

        return this.report(outcome.result, outcome.mode, flags['max-deletes'], flags['show-unchanged']);
    }

    /** Enforce exactly one source (--file or --plan), and that --mode is not paired with a plan. */
    private validateSource(flags: { file?: string[]; plan?: string }): void {
        const hasFile = !!flags.file;
        const hasPlan = !!flags.plan;
        if (hasFile && hasPlan) this.errorSourceConflict();
        if (!hasFile && !hasPlan) this.errorSourceMissing();

        const modeProvided = this.argv.some((arg) => arg === '--mode' || arg.startsWith('--mode='));
        if (hasPlan && modeProvided) this.errorModeWithPlan();
    }

    private async runFromFiles(
        service: ApplyService,
        flags: { file?: string[]; mode: ReconcileMode; 'max-deletes': number; 'dry-run': boolean }
    ): Promise<{ result: ApplyResult; mode: ReconcileMode }> {
        const result = await service.run(flags.file ?? [], {
            mode: flags.mode,
            maxDeletes: flags['max-deletes'],
            dryRun: flags['dry-run'],
        });

        return { result, mode: flags.mode };
    }

    private async runFromPlan(
        service: ApplyService,
        flags: { plan?: string; 'max-deletes': number; 'dry-run': boolean },
        targetOrg: { getOrgId(): string }
    ): Promise<{ result: ApplyResult; mode: ReconcileMode }> {
        const plan = await this.readPlan(flags.plan ?? '');
        const orgId = targetOrg.getOrgId();
        if (plan.org !== orgId) this.errorPlanOrg(plan.org, orgId);

        this.logApplyingPlan(plan.generatedAt, plan.mode);
        const result = await service.runPlan(plan, {
            maxDeletes: flags['max-deletes'],
            dryRun: flags['dry-run'],
        });

        return { result, mode: plan.mode };
    }

    /** Read and validate the plan file, erroring out (never returning) if it cannot be used. */
    private async readPlan(planFile: string): Promise<SavedPlan> {
        const text = await readFile(planFile, 'utf8').catch(() => undefined);
        if (text == null) this.errorPlanRead(planFile);

        const parsed = parsePlan(text);
        if (!parsed.plan) this.errorPlanInvalid(planFile, parsed.error ?? 'unknown');

        return parsed.plan;
    }

    /** Log findings, print the diff body, and report the outcome. Shared by both sources. */
    private report(
        result: ApplyResult,
        mode: ReconcileMode,
        maxDeletes: number,
        showUnchanged: boolean
    ): PsApplyResult {
        for (const line of formatFindings(result.findings)) {
            this.log(line);
        }

        const added = result.outcomes.filter((outcome) => outcome.operation === 'add' && outcome.success).length;
        const updated = result.outcomes.filter((outcome) => outcome.operation === 'update' && outcome.success).length;
        const removed = result.outcomes.filter((outcome) => outcome.operation === 'remove' && outcome.success).length;
        const failures = result.outcomes.filter((outcome) => !outcome.success);

        const summary: PsApplyResult = {
            status: result.status,
            toAdd: result.diff.toAdd.length,
            toUpdate: result.diff.toUpdate.length,
            toRemove: result.diff.toRemove.length,
            added,
            updated,
            removed,
            failures: failures.length,
        };

        if (result.status === 'invalid') {
            process.exitCode = 1;
            if (!this.jsonEnabled()) this.errorInvalid();
            return summary;
        }

        this.log('');
        for (const line of formatDiff(result.diff, { mode, showUnchanged })) {
            this.log(line);
        }
        this.log('');

        this.reportOutcome(result, summary, mode, maxDeletes);

        return summary;
    }

    /** Report the outcome of a completed (non-invalid) apply, setting the exit code as needed. */
    private reportOutcome(result: ApplyResult, summary: PsApplyResult, mode: string, maxDeletes: number): void {
        if (result.status === 'max-deletes-exceeded') {
            process.exitCode = 1;
            if (!this.jsonEnabled()) this.errorMaxDeletes(result.diff.toRemove.length, maxDeletes);
            return;
        }

        this.reportDrift(result.drift, mode);

        if (result.status === 'dry-run') {
            // Report what this mode would actually do, matching the mode-scoped body: the full
            // diff minus whatever the mode leaves as drift. Otherwise the counts contradict it.
            this.logSummaryDryRun(
                summary.toAdd - result.drift.adds,
                summary.toUpdate - result.drift.updates,
                summary.toRemove - result.drift.removes
            );
            return;
        }

        if (result.status === 'declined') {
            this.logSummaryDeclined();
            return;
        }

        this.logSummaryApplied(summary.added, summary.updated, summary.removed);
        const failures = result.outcomes.filter((outcome) => !outcome.success);
        for (const failure of failures) {
            this.logFailureLine(failure.operation, failure.assignee, failure.target, failure.message ?? '');
        }

        if (result.failed) {
            process.exitCode = 1;
            if (!this.jsonEnabled()) this.errorFailed();
        }
    }

    private reportDrift(drift: { adds: number; updates: number; removes: number }, mode: string): void {
        if (drift.adds > 0) this.logDriftNote(drift.adds, mode);
        if (drift.updates > 0) this.logDriftNote(drift.updates, mode);
        if (drift.removes > 0) this.logDriftNote(drift.removes, mode);
    }

    private logSummaryDryRun(toAdd: number, toUpdate: number, toRemove: number): void {
        this.log(
            messages.getMessage('summary.dryRun', [
                toAdd,
                toUpdate,
                toRemove,
            ])
        );
    }

    private logSummaryDeclined(): void {
        this.log(messages.getMessage('summary.declined'));
    }

    private logSummaryApplied(added: number, updated: number, removed: number): void {
        this.log(
            messages.getMessage('summary.applied', [
                added,
                updated,
                removed,
            ])
        );
    }

    private logFailureLine(operation: string, assignee: string, target: string, message: string): void {
        this.log(
            messages.getMessage('failure.line', [
                operation,
                assignee,
                target,
                message,
            ])
        );
    }

    private logDriftNote(count: number, mode: string): void {
        this.log(
            messages.getMessage('drift.note', [
                count,
                mode,
            ])
        );
    }

    private confirmDelete(count: number): Promise<boolean> {
        return this.confirm({ message: messages.getMessage('confirm.delete', [count]) });
    }

    private logApplyingPlan(generatedAt: string, mode: string): void {
        this.log(
            messages.getMessage('info.applyingPlan', [
                generatedAt,
                mode,
            ])
        );
    }

    private errorSourceConflict(): never {
        this.error(messages.getMessage('error.sourceConflict'), { exit: 1 });
    }

    private errorSourceMissing(): never {
        this.error(messages.getMessage('error.sourceMissing'), { exit: 1 });
    }

    private errorModeWithPlan(): never {
        this.error(messages.getMessage('error.modeWithPlan'), { exit: 1 });
    }

    private errorPlanRead(planFile: string): never {
        this.error(messages.getMessage('error.planRead', [planFile]), { exit: 1 });
    }

    private errorPlanInvalid(planFile: string, detail: string): never {
        this.error(
            messages.getMessage('error.planInvalid', [
                planFile,
                detail,
            ]),
            { exit: 1 }
        );
    }

    private errorPlanOrg(planOrg: string, targetOrg: string): never {
        this.error(
            messages.getMessage('error.planOrg', [
                planOrg,
                targetOrg,
            ]),
            { exit: 1 }
        );
    }

    private errorInvalid(): void {
        this.error(messages.getMessage('error.invalid'), { exit: 1 });
    }

    private errorMaxDeletes(removeCount: number, maxDeletes: number): void {
        this.error(
            messages.getMessage('error.maxDeletes', [
                removeCount,
                maxDeletes,
            ]),
            { exit: 1 }
        );
    }

    private errorFailed(): void {
        this.error(messages.getMessage('error.failed'), { exit: 1 });
    }
}
