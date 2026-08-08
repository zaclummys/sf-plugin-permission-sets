import { expect } from 'chai';
import { CheckService } from '../../../lib/services/index.js';
import { jobFile } from '../job-file.ts';

describe('CheckService warnings', () => {
    it('warns that a file parsed to nothing', async () => {
        const service = new CheckService();
        const result = await service.run([jobFile('empty.yml')]);

        expect(result.findings.format()).to.deep.equal([`warning: ${jobFile('empty.yml')} file is empty`]);
    });

    it('warns about a scope key whose list is empty', async () => {
        const service = new CheckService();
        const result = await service.run([jobFile('empty-list.yml')]);

        expect(result.findings.format()).to.deep.equal([`warning: ${jobFile('empty-list.yml')} alice@example.com: permissionSets is empty`]);
    });

    it('still reads the scopes a file did declare', async () => {
        const service = new CheckService();
        const result = await service.run([jobFile('empty-list.yml')]);

        expect(result.assignments.length).to.equal(1);
    });

    it('warns about a user who declares no scope at all', async () => {
        const service = new CheckService();
        const result = await service.run([jobFile('empty-user.yml')]);

        expect(result.findings.format()).to.deep.equal([`warning: ${jobFile('empty-user.yml')} alice@example.com: no scopes declared`]);
    });

    it('points at the line malformed YAML broke on', async () => {
        const service = new CheckService();
        const result = await service.run([jobFile('malformed.yml')]);

        expect(result.findings.format()[0]).to.contain(`${jobFile('malformed.yml')}:2 `);
    });

    it('reports a document that is not a mapping at the root', async () => {
        const service = new CheckService();
        const result = await service.run([jobFile('scalar.yml')]);

        expect(result.findings.format()[0]).to.contain('(root): ');
    });
});
