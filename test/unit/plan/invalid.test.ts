import { expect } from 'chai';
import { PlanService } from '../../../lib/services/index.js';
import { FakeOrgClient } from '../fake-org-client.ts';
import { jobFile } from '../job-file.ts';
import { resolvedOrg } from '../org-fixtures.ts';

describe('PlanService invalid', () => {
    it('aborts when a file has an error', async () => {
        const service = new PlanService(new FakeOrgClient());
        const plan = await service.run([jobFile('schema-violation.yml')]);

        expect(plan.status).to.equal('invalid');
    });

    it('never reaches the org when a file has an error', async () => {
        const org = new FakeOrgClient();
        const service = new PlanService(org);

        await service.run([jobFile('schema-violation.yml')]);

        expect(org.calls.findUsers).to.deep.equal([]);
    });

    it('reports an empty diff when it aborted', async () => {
        const service = new PlanService(new FakeOrgClient());
        const plan = await service.run([jobFile('schema-violation.yml')]);

        expect(plan.diff.changeCount()).to.equal(0);
    });

    it('aborts on a warning when strict is on', async () => {
        const service = new PlanService(new FakeOrgClient(resolvedOrg));
        const plan = await service.run([jobFile('same-target-twice.yml')], true);

        expect(plan.status).to.equal('invalid');
    });

    it('aborts when the org cannot resolve a target', async () => {
        const org = new FakeOrgClient({ users: resolvedOrg.users });
        const service = new PlanService(org);
        const plan = await service.run([jobFile('one-assignment.yml')]);

        expect(plan.status).to.equal('invalid');
    });

    it('does not read the current state when a reference did not resolve', async () => {
        const org = new FakeOrgClient({ users: resolvedOrg.users });
        const service = new PlanService(org);

        await service.run([jobFile('one-assignment.yml')]);

        expect(org.calls.listCurrentAssignments).to.deep.equal([]);
    });
});
