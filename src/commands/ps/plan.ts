import { SfCommand, Flags } from '@salesforce/sf-plugins-core';
import { Messages } from '@salesforce/core';
import { ConnectionOrgClient } from '../../adapters/connection-org-client.js';
import { PlanService } from '../../services/plan.js';
import { formatDiff } from '../../core/report.js';
import { formatFindings } from '../../core/finding.js';

Messages.importMessagesDirectoryFromMetaUrl(import.meta.url);
const messages = Messages.loadMessages('sf-plugin-permission-sets', 'ps.plan');

export type PsPlanResult = {
    status: string;
    toAdd: number;
    toUpdate: number;
    toRemove: number;
    unchanged: number;
    drift: number;
};

export default class Plan extends SfCommand<PsPlanResult> {
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
    };

    public async run(): Promise<PsPlanResult> {
        const { flags } = await this.parse(Plan);

        const connection = flags['target-org'].getConnection(flags['api-version']);
        const orgClient = new ConnectionOrgClient(connection);
        const service = new PlanService(orgClient, flags.file, { mode: flags.mode });
        const result = await service.run();

        for (const line of formatFindings(result.findings)) {
            this.log(line);
        }

        const summary: PsPlanResult = {
            status: result.status,
            toAdd: result.diff.toAdd.length,
            toUpdate: result.diff.toUpdate.length,
            toRemove: result.diff.toRemove.length,
            unchanged: result.diff.unchanged.length,
            drift: result.drift.adds + result.drift.updates + result.drift.removes,
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

        this.reportDrift(result.drift, flags.mode);
        this.log(
            messages.getMessage('summary.counts', [
                String(summary.toAdd),
                String(summary.toUpdate),
                String(summary.toRemove),
                String(summary.unchanged),
            ])
        );

        const pending = summary.toAdd + summary.toUpdate + summary.toRemove;
        if (pending > 0) {
            this.log(messages.getMessage('summary.next', [flags.mode]));
        }

        return summary;
    }

    private reportDrift(drift: { adds: number; updates: number; removes: number }, mode: string): void {
        if (drift.adds > 0) this.log(messages.getMessage('drift.note', [String(drift.adds), mode]));
        if (drift.updates > 0) this.log(messages.getMessage('drift.note', [String(drift.updates), mode]));
        if (drift.removes > 0) this.log(messages.getMessage('drift.note', [String(drift.removes), mode]));
    }
}
