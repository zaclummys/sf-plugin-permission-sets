import { expect } from 'chai';
import { ApplyService } from '../../../lib/services/index.js';
import { Confirmations } from '../confirmations.ts';
import { FakeOrgClient } from '../fake-org-client.ts';
import { accepted } from '../builders.ts';
import { jobFile } from '../job-file.ts';
import { applyInput, holdingAlpha, holdingBoth } from './helpers.ts';

const file = jobFile('one-assignment.yml');

describe('ApplyService changes', () => {
    it('updates the expiration the file changed', async () => {
        const confirmations = new Confirmations(true);
        const org = new FakeOrgClient({
            ...holdingAlpha,
            updated: [accepted('update')],
        });
        const service = new ApplyService(org, confirmations.ask);

        await service.run([jobFile('expiring.yml')], applyInput());

        expect(org.calls.updateAssignments[0].length).to.equal(1);
    });

    it('counts the update the org accepted', async () => {
        const confirmations = new Confirmations(true);
        const org = new FakeOrgClient({
            ...holdingAlpha,
            updated: [accepted('update')],
        });
        const service = new ApplyService(org, confirmations.ask);
        const result = await service.run([jobFile('expiring.yml')], applyInput());

        expect(result.outcomes.updated()).to.equal(1);
    });

    it('deletes the assignment no file declares', async () => {
        const confirmations = new Confirmations(true);
        const org = new FakeOrgClient({
            ...holdingBoth,
            removed: [accepted('remove')],
        });
        const service = new ApplyService(org, confirmations.ask);

        await service.run([file], applyInput());

        expect(org.calls.removeAssignments[0][0].recordId).to.equal('0Pa000000000002AAA');
    });

    it('counts the removal the org accepted', async () => {
        const confirmations = new Confirmations(true);
        const org = new FakeOrgClient({
            ...holdingBoth,
            removed: [accepted('remove')],
        });
        const service = new ApplyService(org, confirmations.ask);
        const result = await service.run([file], applyInput());

        expect(result.outcomes.removed()).to.equal(1);
    });

    it('writes nothing when the org already matches the file', async () => {
        const confirmations = new Confirmations(true);
        const org = new FakeOrgClient(holdingAlpha);
        const service = new ApplyService(org, confirmations.ask);

        await service.run([file], applyInput());

        expect(org.calls.addAssignments).to.deep.equal([]);
    });
});
