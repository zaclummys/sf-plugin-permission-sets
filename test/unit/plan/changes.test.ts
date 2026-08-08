import { assert, expect } from 'chai';
import { PlanService } from '../../../lib/services/index.js';
import { FakeOrgClient } from '../fake-org-client.ts';
import { jobFile } from '../job-file.ts';
import { heldAlpha, heldBeta, resolvedOrg } from '../org-fixtures.ts';

describe('PlanService changes', () => {
    it('plans an update when the expiration differs from the org', async () => {
        const org = new FakeOrgClient({
            ...resolvedOrg,
            current: [heldAlpha],
        });
        const service = new PlanService(org);
        const plan = await service.run([jobFile('expiring.yml')]);

        expect(plan.diff.toUpdate.length).to.equal(1);
    });

    it('plans a removal for an assignment no file declares', async () => {
        const org = new FakeOrgClient({
            ...resolvedOrg,
            current: [
                heldAlpha,
                heldBeta,
            ],
        });
        const service = new PlanService(org);
        const plan = await service.run([jobFile('one-assignment.yml')]);

        expect(plan.diff.toRemove.length).to.equal(1);
    });

    it('carries a file warning into a plan that went ahead', async () => {
        const service = new PlanService(new FakeOrgClient(resolvedOrg));
        const plan = await service.run([jobFile('same-target-twice.yml')], false);

        expect(plan.findings.warnings()).to.equal(1);
    });

    it('carries a resolution that attaches the ids an insert needs', async () => {
        const service = new PlanService(new FakeOrgClient(resolvedOrg));
        const plan = await service.run([jobFile('one-assignment.yml')]);

        assert(plan.status === 'planned', 'expected the plan to reach the org');

        const resolved = plan.resolution.resolveAdditions(plan.diff.toAdd);

        expect(resolved[0].targetId).to.equal('0PS000000000001AAA');
    });
});
