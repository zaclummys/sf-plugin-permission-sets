import { expect } from 'chai';
import { ApplyService } from '../../../lib/services/index.js';
import { Confirmations } from '../confirmations.ts';
import { FakeOrgClient, accepted } from '../fake-org-client.ts';
import { jobFile } from '../job-file.ts';
import { applyInput, holdingBoth, holdingNothing } from './helpers.ts';

const file = jobFile('one-assignment.yml');

describe('ApplyService confirmation', () => {
    it('asks with the number of removals it is about to make', async () => {
        const confirmations = new Confirmations(true);
        const service = new ApplyService(new FakeOrgClient(holdingBoth), confirmations.ask);

        await service.run([file], applyInput());

        expect(confirmations.calls).to.deep.equal([1]);
    });

    it('reports a declined run', async () => {
        const confirmations = new Confirmations(false);
        const service = new ApplyService(new FakeOrgClient(holdingBoth), confirmations.ask);
        const result = await service.run([file], applyInput());

        expect(result.status).to.equal('declined');
    });

    it('removes nothing when the run was declined', async () => {
        const confirmations = new Confirmations(false);
        const org = new FakeOrgClient(holdingBoth);
        const service = new ApplyService(org, confirmations.ask);

        await service.run([file], applyInput());

        expect(org.calls.removeAssignments).to.deep.equal([]);
    });

    it('adds nothing when the run was declined', async () => {
        const confirmations = new Confirmations(false);
        const org = new FakeOrgClient(holdingBoth);
        const service = new ApplyService(org, confirmations.ask);

        await service.run([file], applyInput());

        expect(org.calls.addAssignments).to.deep.equal([]);
    });

    it('never asks when the run removes nothing', async () => {
        const confirmations = new Confirmations(true);
        const org = new FakeOrgClient({
            ...holdingNothing,
            added: [accepted('add')],
        });
        const service = new ApplyService(org, confirmations.ask);

        await service.run([file], applyInput());

        expect(confirmations.calls).to.deep.equal([]);
    });
});
