import { SfCommand, Flags } from '@salesforce/sf-plugins-core';
import { Messages } from '@salesforce/core';

import { ConnectionOrgClient } from '../../adapters/index.js';
import { AssignmentFilter, kindForScopeKey } from '../../core/index.js';
import { ExportService } from '../../services/index.js';

Messages.importMessagesDirectoryFromMetaUrl(import.meta.url);
const messages = Messages.loadMessages('sf-plugin-permission-sets', 'ps.export');

export type PsExportResult = {
    outputFile: string;
    users: number;
    assignments: number;
    unmatchedUsers: string[];
};

export default class Export extends SfCommand<PsExportResult> {
    public static readonly summary = messages.getMessage('summary');
    public static readonly description = messages.getMessage('description');
    public static readonly examples = messages.getMessages('examples');

    public static readonly flags = {
        'target-org': Flags.requiredOrg(),
        'output-file': Flags.string({
            char: 'f',
            summary: messages.getMessage('flags.output-file.summary'),
            required: true,
        }),
        user: Flags.string({
            summary: messages.getMessage('flags.user.summary'),
            multiple: true,
        }),
        kind: Flags.option({
            summary: messages.getMessage('flags.kind.summary'),
            options: ['permissionSets', 'permissionSetGroups', 'permissionSetLicenses'] as const,
            multiple: true,
        })(),
    };

    public async run(): Promise<PsExportResult> {
        const { flags } = await this.parse(Export);
        const filter: AssignmentFilter = {
            usernames: flags.user,
            kinds: flags.kind?.map(kindForScopeKey),
        };

        const connection = flags['target-org'].getConnection();
        const orgClient = new ConnectionOrgClient(connection);
        const service = new ExportService(orgClient);
        const result = await service.run(flags['output-file'], filter);

        this.warnUnmatchedUsers(result.unmatchedUsers);
        this.logExportSuccess(result.assignments, result.users, result.outputFile);

        return result;
    }

    private warnUnmatchedUsers(unmatchedUsers: string[]): void {
        for (const username of unmatchedUsers) {
            this.warn(messages.getMessage('warnNoAssignments', [username]));
        }
    }

    private logExportSuccess(assignments: number, users: number, outputFile: string): void {
        this.log(
            messages.getMessage('success', [
                assignments,
                users,
                outputFile,
            ])
        );
    }
}
