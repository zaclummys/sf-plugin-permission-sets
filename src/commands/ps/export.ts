import { SfCommand, Flags } from '@salesforce/sf-plugins-core';
import { Messages } from '@salesforce/core';

import { ConnectionOrgClient } from '../../adapters/index.js';
import { AssignmentFilter, kindForScopeKey } from '../../core/index.js';
import { ExportService } from '../../services/index.js';

Messages.importMessagesDirectoryFromMetaUrl(import.meta.url);
const messages = Messages.loadMessages('sf-plugin-permission-sets', 'ps.export');

export type PsExportResult = {
    outputFile: string | null;
    users: number;
    assignments: number;
    unmatchedUsers: string[];
    /** The YAML document, present only when it was written to stdout rather than a file. */
    content?: string;
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
        if (result.outputFile) {
            this.logExportSuccess(result.assignments, result.users, result.outputFile);

            return {
                outputFile: result.outputFile,
                users: result.users,
                assignments: result.assignments,
                unmatchedUsers: result.unmatchedUsers,
            };
        }

        this.logDocument(result.content);

        return {
            outputFile: null,
            users: result.users,
            assignments: result.assignments,
            unmatchedUsers: result.unmatchedUsers,
            content: result.content,
        };
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

    /** Write the document to stdout with no extra trailing newline, so it is byte-identical to the file. */
    private logDocument(content: string): void {
        this.log(content.endsWith('\n') ? content.slice(0, -1) : content);
    }
}
