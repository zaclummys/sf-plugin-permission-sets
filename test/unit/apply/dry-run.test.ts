import { expect } from 'chai';
import { ApplyService } from '../../../lib/services/index.js';
import { Confirmations } from '../confirmations.ts';
import { FakeOrgClient } from '../fake-org-client.ts';
import { jobFile } from '../job-file.ts';
import { applyInput, holdingBoth } from './helpers.ts';

const oneAddition = jobFile('one-assignment.yml');
const dryRun = applyInput({ dryRun: true });

describe('ApplyService dry run', () => {
    it('reports that it only planned', async () => {
        const confirmations = new Confirmations(true);
        const service = new ApplyService(new FakeOrgClient(holdingBoth), confirmations.ask);
        const result = await service.run([oneAddition], dryRun);

        expect(result.status).to.equal('dry-run');
    });

    it('writes nothing to the org', async () => {
        const confirmations = new Confirmations(true);
        const org = new FakeOrgClient(holdingBoth);
        const service = new ApplyService(org, confirmations.ask);

        await service.run([oneAddition], dryRun);

        expect(org.calls.removeAssignments).to.deep.equal([]);
    });

    it('never asks to confirm a removal it will not make', async () => {
        const confirmations = new Confirmations(true);
        const service = new ApplyService(new FakeOrgClient(holdingBoth), confirmations.ask);

        await service.run([oneAddition], dryRun);

        expect(confirmations.calls).to.deep.equal([]);
    });

    it('still reports the diff it would have applied', async () => {
        const confirmations = new Confirmations(true);
        const service = new ApplyService(new FakeOrgClient(holdingBoth), confirmations.ask);
        const result = await service.run([oneAddition], dryRun);

        expect(result.diff.toRemove.length).to.equal(1);
    });
});
