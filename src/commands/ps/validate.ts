import { SfCommand, Flags } from '@salesforce/sf-plugins-core';
import { Messages } from '@salesforce/core';

import { ConnectionOrgClient } from '../../adapters/index.js';
import { ValidateService } from '../../services/index.js';
import { formatFindings, Finding } from '../../core/index.js';

Messages.importMessagesDirectoryFromMetaUrl(import.meta.url);
const messages = Messages.loadMessages('sf-plugin-permission-sets', 'ps.validate');

export type PsValidateResult = {
    files: number;
    users: number;
    assignments: number;
    findings: Finding[];
};

export default class Validate extends SfCommand<PsValidateResult> {
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
    };

    public async run(): Promise<PsValidateResult> {
        const { flags } = await this.parse(Validate);

        const connection = flags['target-org'].getConnection();
        const orgClient = new ConnectionOrgClient(connection);
        const service = new ValidateService(orgClient, flags.file);
        const result = await service.run();

        for (const line of formatFindings(result.findings)) {
            this.log(line);
        }

        const assignees = new Set(result.assignments.map((assignment) => assignment.assignee));

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
