import { expect } from 'chai';
import { ApplyService } from '../../../lib/services/index.js';
import { Confirmations } from '../confirmations.ts';
import { FakeOrgClient } from '../fake-org-client.ts';
import { accepted, rejected } from '../builders.ts';
import { jobFile } from '../job-file.ts';
import { applyInput, holdingNothing } from './helpers.ts';

const file = jobFile('one-assignment.yml');

const orgAccepting = {
    ...holdingNothing,
    added: [accepted('add')],
};

describe('ApplyService writes', () => {
    it('inserts the addition the plan found', async () => {
        const confirmations = new Confirmations(true);
        const org = new FakeOrgClient(orgAccepting);
        const service = new ApplyService(org, confirmations.ask);

        await service.run([file], applyInput());

        expect(org.calls.addAssignments[0].length).to.equal(1);
    });

    it('inserts with the ids the resolution attached', async () => {
        const confirmations = new Confirmations(true);
        const org = new FakeOrgClient(orgAccepting);
        const service = new ApplyService(org, confirmations.ask);

        await service.run([file], applyInput());

        expect(org.calls.addAssignments[0][0].targetId).to.equal('0PS000000000001AAA');
    });

    it('reports the run as applied', async () => {
        const confirmations = new Confirmations(true);
        const service = new ApplyService(new FakeOrgClient(orgAccepting), confirmations.ask);
        const result = await service.run([file], applyInput());

        expect(result.status).to.equal('applied');
    });

    it('counts what the org accepted', async () => {
        const confirmations = new Confirmations(true);
        const service = new ApplyService(new FakeOrgClient(orgAccepting), confirmations.ask);
        const result = await service.run([file], applyInput());

        expect(result.outcomes.added()).to.equal(1);
    });

    it('reports a record the org rejected', async () => {
        const confirmations = new Confirmations(true);
        const org = new FakeOrgClient({
            ...holdingNothing,
            added: [rejected('add')],
        });
        const service = new ApplyService(org, confirmations.ask);
        const result = await service.run([file], applyInput());

        expect(result.outcomes.hasFailures()).to.equal(true);
    });
});
