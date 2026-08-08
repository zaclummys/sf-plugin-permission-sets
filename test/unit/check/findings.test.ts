import { expect } from 'chai';
import { CheckService } from '../../../lib/services/index.js';
import { jobFile } from '../job-file.ts';

describe('CheckService findings', () => {
    it('reports nothing for a file that declares one target', async () => {
        const service = new CheckService();
        const result = await service.run([jobFile('one-assignment.yml')]);

        expect(result.findings.toJSON()).to.deep.equal([]);
    });

    it('reports a repeated target as a warning', async () => {
        const service = new CheckService();
        const result = await service.run([jobFile('same-target-twice.yml')]);

        expect(result.findings.warnings()).to.equal(1);
    });

    it('does not fail on a warning by default', async () => {
        const service = new CheckService();
        const result = await service.run([jobFile('same-target-twice.yml')]);

        expect(result.failed).to.equal(false);
    });

    it('keeps the assignment the repeated target declared once', async () => {
        const service = new CheckService();
        const result = await service.run([jobFile('same-target-twice.yml')]);

        expect(result.assignments.length).to.equal(1);
    });

    it('reports a schema violation as an error', async () => {
        const service = new CheckService();
        const result = await service.run([jobFile('schema-violation.yml')]);

        expect(result.findings.errors()).to.equal(1);
    });

    it('reads no assignment from a file that violates the schema', async () => {
        const service = new CheckService();
        const result = await service.run([jobFile('schema-violation.yml')]);

        expect(result.assignments).to.deep.equal([]);
    });
});
