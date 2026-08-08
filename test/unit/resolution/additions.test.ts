import { expect } from 'chai';
import { ResolutionService } from '../../../lib/services/resolution.js';
import { FakeOrgClient } from '../fake-org-client.ts';
import { desiredAssignment, orgTarget, orgUser } from '../builders.ts';

const alphaForAlice = desiredAssignment({
    assignee: 'alice@example.com',
    kind: 'permissionSet',
    target: 'PS_Alpha',
});

const knownOrg = {
    users: [orgUser('005000000000001AAA', 'alice@example.com')],
    permissionSets: [orgTarget('0PS000000000001AAA', 'PS_Alpha')],
};

describe('Resolution additions', () => {
    it('attaches the assignee id an insert needs', async () => {
        const service = new ResolutionService(new FakeOrgClient(knownOrg));
        const resolution = await service.run([alphaForAlice]);
        const resolved = resolution.resolveAdditions([alphaForAlice]);

        expect(resolved[0].assigneeId).to.equal('005000000000001AAA');
    });

    it('attaches the target id an insert needs', async () => {
        const service = new ResolutionService(new FakeOrgClient(knownOrg));
        const resolution = await service.run([alphaForAlice]);
        const resolved = resolution.resolveAdditions([alphaForAlice]);

        expect(resolved[0].targetId).to.equal('0PS000000000001AAA');
    });

    it('matches the user however the file spelled the case', async () => {
        const mixed = desiredAssignment({
            assignee: 'ALICE@EXAMPLE.COM',
            kind: 'permissionSet',
            target: 'ps_alpha',
        });
        const service = new ResolutionService(new FakeOrgClient(knownOrg));
        const resolution = await service.run([mixed]);
        const resolved = resolution.resolveAdditions([mixed]);

        expect(resolved[0].assigneeId).to.equal('005000000000001AAA');
    });

    it('leaves the assignee id empty when the user did not resolve', async () => {
        const service = new ResolutionService(new FakeOrgClient({ permissionSets: knownOrg.permissionSets }));
        const resolution = await service.run([alphaForAlice]);
        const resolved = resolution.resolveAdditions([alphaForAlice]);

        expect(resolved[0].assigneeId).to.equal('');
    });

    it('leaves the target id empty when the target did not resolve', async () => {
        const service = new ResolutionService(new FakeOrgClient({ users: knownOrg.users }));
        const resolution = await service.run([alphaForAlice]);
        const resolved = resolution.resolveAdditions([alphaForAlice]);

        expect(resolved[0].targetId).to.equal('');
    });

    it('leaves the target id empty when the name is not unique in the org', async () => {
        const permissionSets = [
            orgTarget('0PS000000000001AAA', 'PS_Alpha'),
            orgTarget('0PS000000000002AAA', 'PS_Alpha'),
        ];
        const service = new ResolutionService(new FakeOrgClient({
            ...knownOrg,
            permissionSets,
        }));
        const resolution = await service.run([alphaForAlice]);
        const resolved = resolution.resolveAdditions([alphaForAlice]);

        expect(resolved[0].targetId).to.equal('');
    });
});
