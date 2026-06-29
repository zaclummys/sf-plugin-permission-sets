import { SfCommand, Flags } from '@salesforce/sf-plugins-core';
import { Messages } from '@salesforce/core';
import { ConnectionOrgClient } from '../../adapters/connection-org-client.js';
import { ApplyService } from '../../services/apply.js';
import { formatDiff } from '../../core/report.js';
import { formatFindings } from '../../core/finding.js';

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
        'api-version': Flags.orgApiVersion(),
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
        'max-deletes': Flags.integer({
            summary: messages.getMessage('flags.max-deletes.summary'),
            default: 50,
            min: 0,
        }),
        'dry-run': Flags.boolean({
            summary: messages.getMessage('flags.dry-run.summary'),
        }),
        'no-prompt': Flags.boolean({
            summary: messages.getMessage('flags.no-prompt.summary'),
        }),
    };

    public async run(): Promise<PsApplyResult> {
        const { flags } = await this.parse(Apply);

        const connection = flags['target-org'].getConnection(flags['api-version']);
        const orgClient = new ConnectionOrgClient(connection);

        const confirmDeletions = async (count: number): Promise<boolean> => {
            if (flags['no-prompt']) return true;
            if (this.jsonEnabled()) throw messages.createError('error.promptInJson');
            return this.confirm({ message: messages.getMessage('confirm.delete', [String(count)]) });
        };

        const service = new ApplyService(
            orgClient,
            flags.file,
            { mode: flags.mode, maxDeletes: flags['max-deletes'], dryRun: flags['dry-run'] },
            confirmDeletions
        );
        const result = await service.run();

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
            if (!this.jsonEnabled()) this.error(messages.getMessage('error.invalid'), { exit: 1 });
            return summary;
        }

        this.log('');
        for (const line of formatDiff(result.diff)) {
            this.log(line);
        }
        this.log('');

        if (result.status === 'max-deletes-exceeded') {
            process.exitCode = 1;
            const tokens = [String(result.diff.toRemove.length), String(flags['max-deletes'])];
            if (!this.jsonEnabled()) this.error(messages.getMessage('error.maxDeletes', tokens), { exit: 1 });
            return summary;
        }

        this.reportDrift(result.drift, flags.mode);

        if (result.status === 'dry-run') {
            this.log(
                messages.getMessage('summary.dryRun', [
                    String(summary.toAdd),
                    String(summary.toUpdate),
                    String(summary.toRemove),
                ])
            );
            return summary;
        }

        if (result.status === 'declined') {
            this.log(messages.getMessage('summary.declined'));
            return summary;
        }

        this.log(messages.getMessage('summary.applied', [String(added), String(updated), String(removed)]));
        for (const failure of failures) {
            this.log(
                messages.getMessage('failure.line', [
                    failure.operation,
                    failure.assignee,
                    failure.target,
                    failure.message ?? '',
                ])
            );
        }

        if (result.failed) {
            process.exitCode = 1;
            if (!this.jsonEnabled()) this.error(messages.getMessage('error.failed'), { exit: 1 });
        }

        return summary;
    }

    private reportDrift(drift: { adds: number; updates: number; removes: number }, mode: string): void {
        if (drift.adds > 0) this.log(messages.getMessage('drift.note', [String(drift.adds), mode]));
        if (drift.updates > 0) this.log(messages.getMessage('drift.note', [String(drift.updates), mode]));
        if (drift.removes > 0) this.log(messages.getMessage('drift.note', [String(drift.removes), mode]));
    }
}
