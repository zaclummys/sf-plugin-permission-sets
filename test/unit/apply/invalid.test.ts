import { expect } from 'chai';
import { ApplyService } from '../../../lib/services/index.js';
import { Confirmations } from '../confirmations.ts';
import { FakeOrgClient } from '../fake-org-client.ts';
import { jobFile } from '../job-file.ts';
import { applyInput } from './helpers.ts';

describe('ApplyService invalid', () => {
    it('reports invalid when the plan aborted', async () => {
        const confirmations = new Confirmations(true);
        const service = new ApplyService(new FakeOrgClient(), confirmations.ask);
        const result = await service.run([jobFile('schema-violation.yml')], applyInput());

        expect(result.status).to.equal('invalid');
    });

    it('reports the findings that stopped it', async () => {
        const confirmations = new Confirmations(true);
        const service = new ApplyService(new FakeOrgClient(), confirmations.ask);
        const result = await service.run([jobFile('schema-violation.yml')], applyInput());

        expect(result.findings.errors()).to.equal(1);
    });

    it('writes nothing when the plan aborted', async () => {
        const confirmations = new Confirmations(true);
        const org = new FakeOrgClient();
        const service = new ApplyService(org, confirmations.ask);

        await service.run([jobFile('schema-violation.yml')], applyInput());

        expect(org.calls.addAssignments).to.deep.equal([]);
    });

    it('reports no outcomes when the plan aborted', async () => {
        const confirmations = new Confirmations(true);
        const service = new ApplyService(new FakeOrgClient(), confirmations.ask);
        const result = await service.run([jobFile('schema-violation.yml')], applyInput());

        expect(result.outcomes.added()).to.equal(0);
    });
});
