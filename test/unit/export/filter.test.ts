import { expect } from 'chai';
import { Username } from '../../../lib/core/index.js';
import { ExportService } from '../../../lib/services/index.js';
import { FakeOrgClient } from '../fake-org-client.ts';
import { alphaForAlice, groupForAlice } from '../org-fixtures.ts';

describe('ExportService filter', () => {
    it('reports a requested user the org holds nothing for', async () => {
        const filter = { usernames: [Username.of('carol@example.com')] };
        const service = new ExportService(new FakeOrgClient({ listed: [alphaForAlice] }));
        const result = await service.run(undefined, filter);

        expect(result.unmatchedUsers).to.deep.equal(['carol@example.com']);
    });

    it('does not report a requested user whose case differs from the org', async () => {
        const filter = { usernames: [Username.of('ALICE@EXAMPLE.COM')] };
        const service = new ExportService(new FakeOrgClient({ listed: [alphaForAlice] }));
        const result = await service.run(undefined, filter);

        expect(result.unmatchedUsers).to.deep.equal([]);
    });

    it('reports the unmatched user as it was requested', async () => {
        const filter = { usernames: [Username.of('Carol@Example.com')] };
        const service = new ExportService(new FakeOrgClient({ listed: [alphaForAlice] }));
        const result = await service.run(undefined, filter);

        expect(result.unmatchedUsers).to.deep.equal(['Carol@Example.com']);
    });

    it('counts one user across two assignments', async () => {
        const listed = [
            alphaForAlice,
            groupForAlice,
        ];
        const service = new ExportService(new FakeOrgClient({ listed }));
        const result = await service.run(undefined);

        expect(result.users).to.equal(1);
    });

    it('reports no unmatched users for a filter that names no user', async () => {
        const service = new ExportService(new FakeOrgClient({ listed: [alphaForAlice] }));
        const result = await service.run(undefined, { kinds: ['permissionSet'] });

        expect(result.unmatchedUsers).to.deep.equal([]);
    });
});
