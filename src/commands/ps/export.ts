import { SfCommand, Flags } from '@salesforce/sf-plugins-core';
import { Messages } from '@salesforce/core';
import { ConnectionOrgClient } from '../../adapters/connection-org-client.js';
import { ExportService } from '../../services/index.js';

Messages.importMessagesDirectoryFromMetaUrl(import.meta.url);
const messages = Messages.loadMessages('sf-plugin-permission-sets', 'ps.export');

export type PsExportResult = {
    outputFile: string;
    users: number;
    assignments: number;
};

export default class Export extends SfCommand<PsExportResult> {
    public static readonly summary = messages.getMessage('summary');
    public static readonly description = messages.getMessage('description');
    public static readonly examples = messages.getMessages('examples');

    public static readonly flags = {
        'target-org': Flags.requiredOrg(),
        'output-file': Flags.string({
            summary: messages.getMessage('flags.output-file.summary'),
            required: true,
        }),
    };

    public async run(): Promise<PsExportResult> {
        const { flags } = await this.parse(Export);

        const connection = flags['target-org'].getConnection();
        const orgClient = new ConnectionOrgClient(connection);
        const service = new ExportService(orgClient, flags['output-file']);
        const result = await service.run();

        this.log(messages.getMessage('success', [String(result.assignments), String(result.users), result.outputFile]));

        return result;
    }
}
