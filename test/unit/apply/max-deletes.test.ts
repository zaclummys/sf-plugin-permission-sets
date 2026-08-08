import { expect } from 'chai';
import { ApplyService } from '../../../lib/services/index.js';
import { Confirmations } from '../confirmations.ts';
import { FakeOrgClient } from '../fake-org-client.ts';
import { jobFile } from '../job-file.ts';
import { applyInput, holdingBoth } from './helpers.ts';

const oneRemoval = jobFile('one-assignment.yml');

describe('ApplyService max deletes', () => {
    it('stops when the removals exceed the cap', async () => {
        const confirmations = new Confirmations(true);
        const service = new ApplyService(new FakeOrgClient(holdingBoth), confirmations.ask);
        const result = await service.run([oneRemoval], applyInput({ maxDeletes: 0 }));

        expect(result.status).to.equal('max-deletes-exceeded');
    });

    it('never asks to confirm when the cap is exceeded', async () => {
        const confirmations = new Confirmations(true);
        const service = new ApplyService(new FakeOrgClient(holdingBoth), confirmations.ask);

        await service.run([oneRemoval], applyInput({ maxDeletes: 0 }));

        expect(confirmations.calls).to.deep.equal([]);
    });

    it('removes nothing when the cap is exceeded', async () => {
        const confirmations = new Confirmations(true);
        const org = new FakeOrgClient(holdingBoth);
        const service = new ApplyService(org, confirmations.ask);

        await service.run([oneRemoval], applyInput({ maxDeletes: 0 }));

        expect(org.calls.removeAssignments).to.deep.equal([]);
    });

    it('still reports the diff the cap stopped', async () => {
        const confirmations = new Confirmations(true);
        const service = new ApplyService(new FakeOrgClient(holdingBoth), confirmations.ask);
        const result = await service.run([oneRemoval], applyInput({ maxDeletes: 0 }));

        expect(result.diff.toRemove.length).to.equal(1);
    });

    it('goes ahead when the removals sit exactly on the cap', async () => {
        const confirmations = new Confirmations(true);
        const service = new ApplyService(new FakeOrgClient(holdingBoth), confirmations.ask);
        const result = await service.run([oneRemoval], applyInput({ maxDeletes: 1 }));

        expect(result.status).to.equal('applied');
    });
});
