import { SfCommand, Flags } from '@salesforce/sf-plugins-core';
import { Messages } from '@salesforce/core';

import { ConnectionOrgClient } from '../../adapters/index.js';
import { PlanService } from '../../services/index.js';
import { colourDiff, colourFindings } from '../../ui/index.js';
import {
    formatDiff,
    ActualAssignment,
    AssignmentUpdate,
    DesiredAssignment,
    Diff,
    Drift,
    Findings,
    ReconcileMode,
    ScopedChange,
} from '../../core/index.js';

Messages.importMessagesDirectoryFromMetaUrl(import.meta.url);
const messages = Messages.loadMessages('sf-plugin-permission-sets', 'ps.plan');

export type PsPlanResult = {
    org: {
        username: string;
        id: string
    };
    mode: string;
    counts: {
        toAdd: number;
        toUpdate: number;
        toRemove: number;
        unchanged: number;
        usersAffected: number
    };
    /** What the chosen mode would not act on (surfaced as drift). */
    drift: Drift;
    /** The full diff, regardless of mode, so machine consumers see everything the text scopes away. */
    changes: {
        toAdd: DesiredAssignment[];
        toUpdate: AssignmentUpdate[];
        toRemove: ActualAssignment[];
        unchanged: ActualAssignment[];
    };
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
            options: [
                'additive',
                'destructive',
                'sync',
            ] as const,
            default: 'additive',
        })(),
        'show-unchanged': Flags.boolean({ summary: messages.getMessage('flags.show-unchanged.summary') }),
        strict: Flags.boolean({ summary: messages.getMessage('flags.strict.summary') }),
    };

    public async run(): Promise<PsPlanResult> {
        const { flags } = await this.parse(Plan);
        const mode = flags.mode;
        const targetOrg = flags['target-org'];

        const connection = targetOrg.getConnection();
        const orgClient = new ConnectionOrgClient(connection);
        const service = new PlanService(orgClient);
        const result = await service.run(flags.file, flags.strict);

        this.logFindings(result.findings);

        const diff = result.diff;
        const scoped = diff.scopeTo(mode);
        const orgId = targetOrg.getOrgId();
        const username = targetOrg.getUsername() ?? '';
        const orgName = username || orgId;

        const summary: PsPlanResult = {
            org: {
                username,
                id: orgId,
            },
            mode,
            counts: {
                toAdd: diff.toAdd.length,
                toUpdate: diff.toUpdate.length,
                toRemove: diff.toRemove.length,
                unchanged: diff.unchanged.length,
                usersAffected: scoped.usersAffected(),
            },
            drift: scoped.drift,
            changes: {
                toAdd: diff.toAdd,
                toUpdate: diff.toUpdate,
                toRemove: diff.toRemove,
                unchanged: diff.unchanged,
            },
        };

        if (result.status === 'invalid') {
            process.exitCode = 1;
            if (!this.jsonEnabled()) {
                this.reportInvalid(result.findings);
            }
            return summary;
        }

        this.logPlan({
            diff,
            scoped,
            mode,
            orgName,
            orgId,
            files: flags.file,
            showUnchanged: flags['show-unchanged'],
        });

        return summary;
    }

    /** Render the human-readable plan body once the run is known to be valid. */
    private logPlan(args: {
        diff: Diff;
        scoped: ScopedChange;
        mode: ReconcileMode;
        orgName: string;
        orgId: string;
        files: string[];
        showUnchanged: boolean;
    }): void {
        const {
            diff,
            scoped,
            mode,
            orgName,
            orgId,
            files,
            showUnchanged,
        } = args;

        this.logHeaderTitle();
        this.logHeaderOrg(orgName, orgId, mode);

        if (diff.changeCount() === 0) {
            if (showUnchanged && diff.unchanged.length > 0) {
                this.logDiffBody(diff, mode, true);
            } else {
                this.log('');
            }
            this.logEmptyNoChanges(orgName);
            return;
        }

        this.logDiffBody(diff, mode, showUnchanged);

        if (scoped.count() === 0) {
            this.logEmptyNothingToApply(mode);
        } else {
            this.log(this.countsLine(scoped, mode));
        }

        this.reportDrift(scoped.drift);
        this.reportUnchanged(diff.unchanged.length, showUnchanged);

        if (scoped.count() > 0) {
            this.logSummaryNext(this.applyCommand(orgName, files, mode));
        }
    }

    /** Every finding the run raised, with the level label coloured by how loud it is. */
    private logFindings(findings: Findings): void {
        const lines = colourFindings(findings.format());

        for (const line of lines) {
            this.log(line);
        }
    }

    /** The diff itself, scoped to the mode and coloured by operation. */
    private logDiffBody(diff: Diff, mode: ReconcileMode, showUnchanged: boolean): void {
        const body = colourDiff(formatDiff(diff, {
            mode,
            showUnchanged,
        }));

        this.log('');
        for (const line of body) {
            this.log(line);
        }
        if (body.length > 0) {
            this.log('');
        }
    }

    /** The counts line reports what the mode acts on, so it never contradicts the body above it. */
    private countsLine(scoped: ScopedChange, mode: ReconcileMode): string {
        if (mode === 'destructive') {
            return messages.getMessage('summary.counts.destructive', [
                scoped.removals.length,
                scoped.usersAffected(),
            ]);
        }
        if (mode === 'additive') {
            return messages.getMessage('summary.counts.additive', [
                scoped.additions.length,
                scoped.updates.length,
                scoped.usersAffected(),
            ]);
        }
        return messages.getMessage('summary.counts.sync', [
            scoped.additions.length,
            scoped.updates.length,
            scoped.removals.length,
            scoped.usersAffected(),
        ]);
    }

    /** Drift is already mode-scoped: only additive leaves removes, only destructive leaves adds. */
    private reportDrift(drift: Drift): void {
        if (drift.removes > 0) {
            this.logDriftAdditive(drift.removes);
        }

        const skipped = drift.adds + drift.updates;

        if (skipped > 0) {
            this.logDriftDestructive(skipped);
        }
    }

    private reportUnchanged(count: number, showUnchanged: boolean): void {
        if (count === 0) {
            return;
        }
        if (showUnchanged) {
            this.logSummaryUnchangedListed(count);
        } else {
            this.logSummaryUnchanged(count);
        }
    }

    private applyCommand(orgName: string, files: string[], mode: ReconcileMode): string {
        const fileArgs = files.map((file) => `-f "${file}"`).join(' ');
        const modeArg = mode === 'additive' ? '' : ` --mode ${mode}`;

        return `${this.config.bin} ps apply -o ${orgName} ${fileArgs}${modeArg}`;
    }

    /** An error and a strict warning both stop the plan, for reasons worth telling apart. */
    private reportInvalid(findings: Findings): void {
        if (findings.hasErrors()) {
            this.errorInvalid();
        } else {
            this.errorStrict();
        }
    }

    private errorInvalid(): void {
        this.error(messages.getMessage('error.invalid'), { exit: 1 });
    }

    private errorStrict(): void {
        this.error(messages.getMessage('error.strict'), { exit: 1 });
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
            ]),
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
