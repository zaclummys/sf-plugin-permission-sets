import { expect } from 'chai';
import { ResolutionService } from '../../../lib/services/resolution.js';
import { FakeOrgClient, desiredAssignment } from '../fake-org-client.ts';

const alphaForAlice = desiredAssignment({
    assignee: 'alice@example.com',
    kind: 'permissionSet',
    target: 'PS_Alpha',
});

const groupForAlice = desiredAssignment({
    assignee: 'alice@example.com',
    kind: 'permissionSetGroup',
    target: 'PSG_Onboarding',
});

const licenseForAlice = desiredAssignment({
    assignee: 'alice@example.com',
    kind: 'permissionSetLicense',
    target: 'PSL_Sales',
});

describe('ResolutionService lookups', () => {
    it('asks the org for each declared username once', async () => {
        const org = new FakeOrgClient();
        const service = new ResolutionService(org);

        await service.run([
            alphaForAlice,
            groupForAlice,
        ]);

        expect(org.calls.findUsers[0].map((username) => username.toString())).to.deep.equal(['alice@example.com']);
    });

    it('asks the org nothing when no assignment is declared', async () => {
        const org = new FakeOrgClient();
        const service = new ResolutionService(org);

        await service.run([]);

        expect(org.calls.findUsers).to.deep.equal([]);
    });

    it('asks for the permission sets a file names', async () => {
        const org = new FakeOrgClient();
        const service = new ResolutionService(org);

        await service.run([alphaForAlice]);

        expect(org.calls.findPermissionSets[0].map((name) => name.toString())).to.deep.equal(['PS_Alpha']);
    });

    it('asks for the permission set groups a file names', async () => {
        const org = new FakeOrgClient();
        const service = new ResolutionService(org);

        await service.run([groupForAlice]);

        expect(org.calls.findPermissionSetGroups[0].map((name) => name.toString())).to.deep.equal(['PSG_Onboarding']);
    });

    it('asks for the permission set licenses a file names', async () => {
        const org = new FakeOrgClient();
        const service = new ResolutionService(org);

        await service.run([licenseForAlice]);

        expect(org.calls.findPermissionSetLicenses[0].map((name) => name.toString())).to.deep.equal(['PSL_Sales']);
    });

    it('asks nothing about a kind no file declares', async () => {
        const org = new FakeOrgClient();
        const service = new ResolutionService(org);

        await service.run([alphaForAlice]);

        expect(org.calls.findPermissionSetGroups).to.deep.equal([]);
    });
});
