import { expect } from 'chai';
import { ApplyService } from '../../../lib/services/index.js';
import { Confirmations } from '../confirmations.ts';
import { FakeOrgClient, accepted } from '../fake-org-client.ts';
import { jobFile } from '../job-file.ts';
import { applyInput, holdingBeta } from './helpers.ts';

const file = jobFile('one-assignment.yml');

const orgAccepting = {
    ...holdingBeta,
    added: [accepted('add')],
    removed: [accepted('remove')],
};

describe('ApplyService modes', () => {
    it('adds in additive mode', async () => {
        const confirmations = new Confirmations(true);
        const org = new FakeOrgClient(orgAccepting);
        const service = new ApplyService(org, confirmations.ask);

        await service.run([file], applyInput({ mode: 'additive' }));

        expect(org.calls.addAssignments[0].length).to.equal(1);
    });

    it('removes nothing in additive mode', async () => {
        const confirmations = new Confirmations(true);
        const org = new FakeOrgClient(orgAccepting);
        const service = new ApplyService(org, confirmations.ask);

        await service.run([file], applyInput({ mode: 'additive' }));

        expect(org.calls.removeAssignments).to.deep.equal([]);
    });

    it('adds nothing in destructive mode', async () => {
        const confirmations = new Confirmations(true);
        const org = new FakeOrgClient(orgAccepting);
        const service = new ApplyService(org, confirmations.ask);

        await service.run([file], applyInput({ mode: 'destructive' }));

        expect(org.calls.addAssignments).to.deep.equal([]);
    });

    it('removes in destructive mode', async () => {
        const confirmations = new Confirmations(true);
        const org = new FakeOrgClient(orgAccepting);
        const service = new ApplyService(org, confirmations.ask);

        await service.run([file], applyInput({ mode: 'destructive' }));

        expect(org.calls.removeAssignments[0].length).to.equal(1);
    });

    it('adds and removes in sync mode', async () => {
        const confirmations = new Confirmations(true);
        const org = new FakeOrgClient(orgAccepting);
        const service = new ApplyService(org, confirmations.ask);
        const result = await service.run([file], applyInput({ mode: 'sync' }));

        expect(result.outcomes.added() + result.outcomes.removed()).to.equal(2);
    });
});
