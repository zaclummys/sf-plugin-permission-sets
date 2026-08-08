import { expect } from 'chai';
import { ValidateService } from '../../../lib/services/index.js';
import { FakeOrgClient } from '../fake-org-client.ts';
import { orgUser } from '../builders.ts';
import { jobFile } from '../job-file.ts';
import { resolvedOrg } from '../org-fixtures.ts';

describe('ValidateService findings', () => {
    it('passes when the org resolves every reference', async () => {
        const service = new ValidateService(new FakeOrgClient(resolvedOrg));
        const result = await service.run([jobFile('one-assignment.yml')]);

        expect(result.failed).to.equal(false);
    });

    it('reports the files it validated', async () => {
        const file = jobFile('one-assignment.yml');
        const service = new ValidateService(new FakeOrgClient(resolvedOrg));
        const result = await service.run([file]);

        expect(result.files).to.deep.equal([file]);
    });

    it('reports the assignments it read', async () => {
        const service = new ValidateService(new FakeOrgClient(resolvedOrg));
        const result = await service.run([jobFile('one-assignment.yml')]);

        expect(result.assignments.length).to.equal(1);
    });

    it('fails when the org does not know the user', async () => {
        const org = new FakeOrgClient({ permissionSets: resolvedOrg.permissionSets });
        const service = new ValidateService(org);
        const result = await service.run([jobFile('one-assignment.yml')]);

        expect(result.failed).to.equal(true);
    });

    it('reports an inactive user as an error', async () => {
        const org = new FakeOrgClient({
            users: [orgUser('005000000000001AAA', 'alice@example.com', false)],
            permissionSets: resolvedOrg.permissionSets,
        });
        const service = new ValidateService(org);
        const result = await service.run([jobFile('one-assignment.yml')]);

        expect(result.findings.errors()).to.equal(1);
    });

    it('merges the file findings with the org findings, in that order', async () => {
        const file = jobFile('same-target-twice.yml');
        const service = new ValidateService(new FakeOrgClient({ users: resolvedOrg.users }));
        const result = await service.run([file]);

        expect(result.findings.format()).to.deep.equal([
            `warning: ${file} alice@example.com: PS_Alpha is listed twice under permissionSets`,
            'error: PS_Alpha: permission set not found in org',
        ]);
    });
});
