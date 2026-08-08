import { expect } from 'chai';
import { ResolutionService } from '../../../lib/services/resolution.js';
import { FakeOrgClient } from '../fake-org-client.ts';
import { desiredAssignment, orgTarget, orgUser } from '../builders.ts';

const alphaForAlice = desiredAssignment({
    assignee: 'alice@example.com',
    kind: 'permissionSet',
    target: 'PS_Alpha',
});

const betaForAlice = desiredAssignment({
    assignee: 'alice@example.com',
    kind: 'permissionSet',
    target: 'PS_Beta',
});

const groupForAlice = desiredAssignment({
    assignee: 'alice@example.com',
    kind: 'permissionSetGroup',
    target: 'PSG_Onboarding',
});

const knownOrg = {
    users: [orgUser('005000000000001AAA', 'alice@example.com')],
    permissionSets: [orgTarget('0PS000000000001AAA', 'PS_Alpha')],
};

describe('Resolution managed set', () => {
    it('lists a ref for every target that resolved', async () => {
        const service = new ResolutionService(new FakeOrgClient(knownOrg));
        const resolution = await service.run([alphaForAlice]);

        expect(resolution.managedTargets()).to.deep.equal([
            {
                kind: 'permissionSet',
                id: '0PS000000000001AAA',
            },
        ]);
    });

    it('lists no ref for a target the org does not have', async () => {
        const service = new ResolutionService(new FakeOrgClient({ users: knownOrg.users }));
        const resolution = await service.run([alphaForAlice]);

        expect(resolution.managedTargets()).to.deep.equal([]);
    });

    it('lists a ref for the user and kind a file manages', async () => {
        const service = new ResolutionService(new FakeOrgClient(knownOrg));
        const resolution = await service.run([alphaForAlice]);

        expect(resolution.managedAssignees([alphaForAlice])).to.deep.equal([
            {
                kind: 'permissionSet',
                id: '005000000000001AAA',
            },
        ]);
    });

    it('lists one ref for a user who declares the same kind twice', async () => {
        const declared = [
            alphaForAlice,
            betaForAlice,
        ];
        const service = new ResolutionService(new FakeOrgClient(knownOrg));
        const resolution = await service.run(declared);

        expect(resolution.managedAssignees(declared).length).to.equal(1);
    });

    it('lists a ref per kind for a user who declares two kinds', async () => {
        const declared = [
            alphaForAlice,
            groupForAlice,
        ];
        const service = new ResolutionService(new FakeOrgClient(knownOrg));
        const resolution = await service.run(declared);

        expect(resolution.managedAssignees(declared).length).to.equal(2);
    });

    it('omits a user the org did not resolve', async () => {
        const service = new ResolutionService(new FakeOrgClient({ permissionSets: knownOrg.permissionSets }));
        const resolution = await service.run([alphaForAlice]);

        expect(resolution.managedAssignees([alphaForAlice])).to.deep.equal([]);
    });
});
