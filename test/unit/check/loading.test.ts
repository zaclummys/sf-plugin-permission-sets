import { expect } from 'chai';
import { CheckService } from '../../../lib/services/index.js';
import { jobFile } from '../job-file.ts';

describe('CheckService loading', () => {
    it('reports the file the pattern matched', async () => {
        const file = jobFile('one-assignment.yml');
        const service = new CheckService();
        const result = await service.run([file]);

        expect(result.files).to.deep.equal([file]);
    });

    it('reads one assignment per declared target', async () => {
        const service = new CheckService();
        const result = await service.run([jobFile('two-users.yml')]);

        expect(result.assignments.length).to.equal(2);
    });

    it('carries the target through as it was written', async () => {
        const service = new CheckService();
        const result = await service.run([jobFile('one-assignment.yml')]);

        expect(result.assignments[0].target.toString()).to.equal('PS_Alpha');
    });

    it('carries the expiration through as an instant', async () => {
        const service = new CheckService();
        const result = await service.run([jobFile('expiring.yml')]);

        expect(result.assignments[0].expiration?.toString()).to.equal('2027-12-31T23:59:59Z');
    });

    it('fails when no file matches the patterns', async () => {
        const service = new CheckService();
        const result = await service.run([jobFile('nowhere/*.yml')]);

        expect(result.failed).to.equal(true);
    });

    it('reports no files when none matched', async () => {
        const service = new CheckService();
        const result = await service.run([jobFile('nowhere/*.yml')]);

        expect(result.files).to.deep.equal([]);
    });

    it('fails on malformed YAML', async () => {
        const service = new CheckService();
        const result = await service.run([jobFile('malformed.yml')]);

        expect(result.failed).to.equal(true);
    });
});
