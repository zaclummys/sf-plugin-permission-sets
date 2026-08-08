import { expect } from 'chai';
import { CheckService } from '../../../lib/services/index.js';
import { jobFile } from '../job-file.ts';

describe('CheckService strict', () => {
    it('fails on a warning when strict is on', async () => {
        const service = new CheckService();
        const result = await service.run([jobFile('same-target-twice.yml')], true);

        expect(result.failed).to.equal(true);
    });

    it('passes the same file when strict is off', async () => {
        const service = new CheckService();
        const result = await service.run([jobFile('same-target-twice.yml')], false);

        expect(result.failed).to.equal(false);
    });

    it('still reports the warning when strict is off', async () => {
        const service = new CheckService();
        const result = await service.run([jobFile('same-target-twice.yml')], false);

        expect(result.findings.warnings()).to.equal(1);
    });

    it('fails on an error when strict is off', async () => {
        const service = new CheckService();
        const result = await service.run([jobFile('schema-violation.yml')], false);

        expect(result.failed).to.equal(true);
    });
});
