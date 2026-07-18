import { writeFile, mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';
import { SfCommand, Flags } from '@salesforce/sf-plugins-core';
import { Messages } from '@salesforce/core';

import { ConnectionOrgClient } from '../../adapters/index.js';
import { PlanService, Resolution, resolveAdditions } from '../../services/index.js';
import {
    formatDiff,
    formatFindings,
    scopeToMode,
    serializePlan,
    savedPlanVersion,
    ActualAssignment,
    AssignmentUpdate,
    DesiredAssignment,
    Diff,
    ReconcileMode,
    SavedPlan,
} from '../../core/index.js';

Messages.importMessagesDirectoryFromMetaUrl(import.meta.url);
const messages = Messages.loadMessages('sf-plugin-permission-sets', 'ps.plan');

export type PsPlanResult = {
    org: { username: string; id: string };
    mode: string;
    counts: { toAdd: number; toUpdate: number; toRemove: number; unchanged: number; usersAffected: number };
    /** What the chosen mode would not act on (surfaced as drift). */
    drift: { adds: number; updates: number; removes: number };
    /** The full diff, regardless of mode, so machine consumers see everything the text scopes away. */
    changes: {
        toAdd: DesiredAssignment[];
        toUpdate: AssignmentUpdate[];
        toRemove: ActualAssignment[];
        unchanged: ActualAssignment[];
    };
    /** The plan file written, when --out was given. */
    outFile?: string;
};

export default class Plan extends SfCommand<PsPlanResult> {
    public static readonly summary = messages.getMessage('summary');
    public static readonly description = messages.getMessage('description');
    public static readonly examples = messages.getMessages('examples');

    public static readonly flags = {
        'target-org': Flags.requiredOrg(),
        file: Flags.string({
            char: 'f',
            summary: messages.getMessage('flags.file.summary'),
            required: true,
            multiple: true,
        }),
        mode: Flags.option({
            summary: messages.getMessage('flags.mode.summary'),
            options: ['additive', 'destructive', 'sync'] as const,
            default: 'additive',
        })(),
        'show-unchanged': Flags.boolean({
            summary: messages.getMessage('flags.show-unchanged.summary'),
        }),
        out: Flags.string({
            summary: messages.getMessage('flags.out.summary'),
        }),
    };

    public async run(): Promise<PsPlanResult> {
        const { flags } = await this.parse(Plan);
        const mode = flags.mode;
        const targetOrg = flags['target-org'];

        const connection = targetOrg.getConnection();
        const orgClient = new ConnectionOrgClient(connection);
        const service = new PlanService(orgClient);
        const result = await service.run(flags.file, mode);

        for (const line of formatFindings(result.findings)) {
            this.log(line);
        }

        const diff = result.diff;
        const orgId = targetOrg.getOrgId();
        const username = targetOrg.getUsername() ?? '';
        const orgName = username || orgId;

        const actionable = this.actionable(diff, mode);
        const usersAffected = new Set(actionable.map((assignment) => assignment.assignee.toLowerCase())).size;

        const summary: PsPlanResult = {
            org: { username, id: orgId },
            mode,
            counts: {
                toAdd: diff.toAdd.length,
                toUpdate: diff.toUpdate.length,
                toRemove: diff.toRemove.length,
                unchanged: diff.unchanged.length,
                usersAffected,
            },
            drift: result.drift,
            changes: {
                toAdd: diff.toAdd,
                toUpdate: diff.toUpdate,
                toRemove: diff.toRemove,
                unchanged: diff.unchanged,
            },
        };

        if (result.status === 'invalid') {
            process.exitCode = 1;
            if (!this.jsonEnabled()) this.errorInvalid();
            return summary;
        }

        this.logPlan({
            diff,
            mode,
            orgName,
            orgId,
            files: flags.file,
            showUnchanged: flags['show-unchanged'],
            actionable,
            usersAffected,
        });

        if (flags.out) {
            await this.writePlanFile(flags.out, { diff, mode, orgId, resolution: result.resolution });
            summary.outFile = flags.out;
        }

        return summary;
    }

    /** Freeze the resolved, mode-scoped change set to a plan file that `apply --plan` runs verbatim. */
    private async writePlanFile(
        outFile: string,
        args: { diff: Diff; mode: ReconcileMode; orgId: string; resolution: Resolution }
    ): Promise<void> {
        const scoped = scopeToMode(args.diff, args.mode);
        const add = resolveAdditions(scoped.additions, args.resolution);
        const plan: SavedPlan = {
            version: savedPlanVersion,
            org: args.orgId,
            mode: args.mode,
            generatedAt: new Date().toISOString(),
            add,
            update: scoped.updates,
            remove: scoped.removals,
        };
        const content = serializePlan(plan);
        const total = add.length + scoped.updates.length + scoped.removals.length;

        await mkdir(dirname(outFile), { recursive: true });
        await writeFile(outFile, content, 'utf8');
        this.logWrotePlan(total, outFile);
    }

    private logWrotePlan(changes: number, outFile: string): void {
        this.log(
            messages.getMessage('summary.wrotePlan', [
                changes,
                outFile,
                outFile,
            ])
        );
    }

    /** Render the human-readable plan body once the run is known to be valid. */
    private logPlan(args: {
        diff: Diff;
        mode: ReconcileMode;
        orgName: string;
        orgId: string;
        files: string[];
        showUnchanged: boolean;
        actionable: Array<{ assignee: string }>;
        usersAffected: number;
    }): void {
        const { diff, mode, orgName, orgId, files, showUnchanged, actionable, usersAffected } = args;

        this.logHeaderTitle();
        this.logHeaderOrg(orgName, orgId, mode);

        const totalChanges = diff.toAdd.length + diff.toUpdate.length + diff.toRemove.length;
        if (totalChanges === 0) {
            if (showUnchanged && diff.unchanged.length > 0) {
                this.logBody(formatDiff(diff, { mode, showUnchanged: true }));
            } else {
                this.log('');
            }
            this.logEmptyNoChanges(orgName);
            return;
        }

        this.logBody(formatDiff(diff, { mode, showUnchanged }));

        if (actionable.length === 0) {
            this.logEmptyNothingToApply(mode);
        } else {
            this.log(this.countsLine(diff, mode, usersAffected));
        }

        this.reportDrift(diff, mode);
        this.reportUnchanged(diff.unchanged.length, showUnchanged);

        if (actionable.length > 0) {
            this.logSummaryNext(this.applyCommand(orgName, files, mode));
        }
    }

    /** The assignments the chosen mode would actually act on. */
    private actionable(diff: Diff, mode: ReconcileMode): Array<{ assignee: string }> {
        if (mode === 'destructive') return diff.toRemove;
        if (mode === 'additive')
            return [
                ...diff.toAdd,
                ...diff.toUpdate,
            ];
        return [
            ...diff.toAdd,
            ...diff.toUpdate,
            ...diff.toRemove,
        ];
    }

    private logBody(body: string[]): void {
        this.log('');
        for (const line of body) this.log(line);
        if (body.length > 0) this.log('');
    }

    private countsLine(diff: Diff, mode: ReconcileMode, usersAffected: number): string {
        if (mode === 'destructive') {
            return messages.getMessage('summary.counts.destructive', [
                diff.toRemove.length,
                usersAffected,
            ]);
        }
        if (mode === 'additive') {
            return messages.getMessage('summary.counts.additive', [
                diff.toAdd.length,
                diff.toUpdate.length,
                usersAffected,
            ]);
        }
        return messages.getMessage('summary.counts.sync', [
            diff.toAdd.length,
            diff.toUpdate.length,
            diff.toRemove.length,
            usersAffected,
        ]);
    }

    private reportDrift(diff: Diff, mode: ReconcileMode): void {
        if (mode === 'additive' && diff.toRemove.length > 0) {
            this.logDriftAdditive(diff.toRemove.length);
        }
        if (mode === 'destructive') {
            const skipped = diff.toAdd.length + diff.toUpdate.length;
            if (skipped > 0) this.logDriftDestructive(skipped);
        }
    }

    private reportUnchanged(count: number, showUnchanged: boolean): void {
        if (count === 0) return;
        if (showUnchanged) this.logSummaryUnchangedListed(count);
        else this.logSummaryUnchanged(count);
    }

    private applyCommand(orgName: string, files: string[], mode: ReconcileMode): string {
        const fileArgs = files.map((file) => `-f "${file}"`).join(' ');
        const modeArg = mode === 'additive' ? '' : ` --mode ${mode}`;
        return `${this.config.bin} ps apply -o ${orgName} ${fileArgs}${modeArg}`;
    }

    private errorInvalid(): void {
        this.error(messages.getMessage('error.invalid'), { exit: 1 });
    }

    private logHeaderTitle(): void {
        this.log(messages.getMessage('header.title'));
    }

    private logHeaderOrg(orgName: string, orgId: string, mode: string): void {
        this.log(
            messages.getMessage('header.org', [
                orgName,
                orgId,
                mode,
            ])
        );
    }

    private logEmptyNoChanges(orgName: string): void {
        this.log(messages.getMessage('empty.noChanges', [orgName]));
    }

    private logEmptyNothingToApply(mode: string): void {
        this.log(messages.getMessage('empty.nothingToApply', [mode]));
    }

    private logSummaryNext(applyCommand: string): void {
        this.log(messages.getMessage('summary.next', [applyCommand]));
    }

    private logDriftAdditive(count: number): void {
        this.log(messages.getMessage('drift.additive', [count]));
    }

    private logDriftDestructive(count: number): void {
        this.log(messages.getMessage('drift.destructive', [count]));
    }

    private logSummaryUnchanged(count: number): void {
        this.log(messages.getMessage('summary.unchanged', [count]));
    }

    private logSummaryUnchangedListed(count: number): void {
        this.log(messages.getMessage('summary.unchangedListed', [count]));
    }
}
