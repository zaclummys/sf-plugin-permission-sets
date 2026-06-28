import { SfCommand } from '@salesforce/sf-plugins-core';
import { Messages } from '@salesforce/core';

Messages.importMessagesDirectoryFromMetaUrl(import.meta.url);
const messages = Messages.loadMessages('sf-plugin-permission-sets', 'ps.info');

export type PsInfoResult = {
    name: string;
    description: string;
};

export default class Info extends SfCommand<PsInfoResult> {
    public static readonly summary = messages.getMessage('summary');
    public static readonly description = messages.getMessage('description');
    public static readonly examples = messages.getMessages('examples');

    public async run(): Promise<PsInfoResult> {
        await this.parse(Info);
        const name = 'sf-plugin-permission-sets';
        const description = 'Declarative, GitOps-style management of permission set assignments.';
        this.log(messages.getMessage('info.summary', [name, description]));
        return { name, description };
    }
}
