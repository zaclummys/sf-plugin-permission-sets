import { expect } from 'chai';
import { PlanService } from '../../../lib/services/index.js';
import { FakeOrgClient } from '../fake-org-client.ts';
import { jobFile } from '../job-file.ts';
import { heldAlpha, resolvedOrg } from '../org-fixtures.ts';

describe('PlanService planned', () => {
    it('reaches the org when every reference resolves', async () => {
        const service = new PlanService(new FakeOrgClient(resolvedOrg));
        const plan = await service.run([jobFile('one-assignment.yml')]);

        expect(plan.status).to.equal('planned');
    });

    it('plans an addition the org does not have', async () => {
        const service = new PlanService(new FakeOrgClient(resolvedOrg));
        const plan = await service.run([jobFile('one-assignment.yml')]);

        expect(plan.diff.toAdd.length).to.equal(1);
    });

    it('reads the current state of the targets that resolved', async () => {
        const org = new FakeOrgClient(resolvedOrg);
        const service = new PlanService(org);

        await service.run([jobFile('one-assignment.yml')]);

        expect(org.calls.listCurrentAssignments[0].targets).to.deep.equal([
            {
                kind: 'permissionSet',
                id: '0PS000000000001AAA',
            },
        ]);
    });

    it('reads the current state of the users the file manages a kind for', async () => {
        const org = new FakeOrgClient(resolvedOrg);
        const service = new PlanService(org);

        await service.run([jobFile('one-assignment.yml')]);

        expect(org.calls.listCurrentAssignments[0].assignees).to.deep.equal([
            {
                kind: 'permissionSet',
                id: '005000000000001AAA',
            },
        ]);
    });

    it('plans nothing when the org already matches the file', async () => {
        const org = new FakeOrgClient({
            ...resolvedOrg,
            current: [heldAlpha],
        });
        const service = new PlanService(org);
        const plan = await service.run([jobFile('one-assignment.yml')]);

        expect(plan.diff.changeCount()).to.equal(0);
    });
});
