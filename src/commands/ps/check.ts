import { SfCommand, Flags } from '@salesforce/sf-plugins-core';
import { Messages } from '@salesforce/core';
import { check } from '../../services/check.js';
import { formatFindings } from '../../core/report.js';
import { Finding } from '../../core/model.js';

Messages.importMessagesDirectoryFromMetaUrl(import.meta.url);
const messages = Messages.loadMessages('sf-plugin-permission-sets', 'ps.check');

export type PsCheckResult = {
    files: number;
    users: number;
    assignments: number;
    findings: Finding[];
};

export default class Check extends SfCommand<PsCheckResult> {
    public static readonly summary = messages.getMessage('summary');
    public static readonly description = messages.getMessage('description');
    public static readonly examples = messages.getMessages('examples');

    public static readonly flags = {
        file: Flags.string({
            char: 'f',
            summary: messages.getMessage('flags.file.summary'),
            required: true,
            multiple: true,
        }),
        strict: Flags.boolean({
            summary: messages.getMessage('flags.strict.summary'),
        }),
    };

    public async run(): Promise<PsCheckResult> {
        const { flags } = await this.parse(Check);
        const result = await check({ files: flags.file, strict: flags.strict });

        for (const line of formatFindings(result.findings)) {
            this.log(line);
        }

        const assignees = new Set(result.assignments.map((a) => a.assignee));
        this.log('');
        this.log(messages.getMessage('summary.counts', [String(result.errors), String(result.warnings)]));

        if (result.failed) {
            process.exitCode = 1;
            if (!this.jsonEnabled()) {
                this.error(messages.getMessage('error.failed'), { exit: 1 });
            }
        }

        return {
            files: result.files.length,
            users: assignees.size,
            assignments: result.assignments.length,
            findings: result.findings,
        };
    }
}
