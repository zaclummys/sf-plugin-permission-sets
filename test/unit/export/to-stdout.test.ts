import { expect } from 'chai';
import { Username } from '../../../lib/core/index.js';
import { ExportService } from '../../../lib/services/index.js';
import { FakeOrgClient } from '../fake-org-client.ts';
import { jobFileText } from '../job-file.ts';
import { alphaForAlice } from '../org-fixtures.ts';

describe('ExportService to stdout', () => {
    it('reports no output file when none was given', async () => {
        const service = new ExportService(new FakeOrgClient({ listed: [alphaForAlice] }));
        const result = await service.run(undefined);

        expect(result.outputFile).to.equal(null);
    });

    it('serializes back to the document the same assignment was read from', async () => {
        const service = new ExportService(new FakeOrgClient({ listed: [alphaForAlice] }));
        const result = await service.run(undefined);

        expect(result.content).to.equal(await jobFileText('one-assignment.yml'));
    });

    it('counts the users it exported', async () => {
        const service = new ExportService(new FakeOrgClient({ listed: [alphaForAlice] }));
        const result = await service.run(undefined);

        expect(result.users).to.equal(1);
    });

    it('counts the assignments it exported', async () => {
        const service = new ExportService(new FakeOrgClient({ listed: [alphaForAlice] }));
        const result = await service.run(undefined);

        expect(result.assignments).to.equal(1);
    });

    it('reports no unmatched users when no filter was given', async () => {
        const service = new ExportService(new FakeOrgClient({ listed: [alphaForAlice] }));
        const result = await service.run(undefined);

        expect(result.unmatchedUsers).to.deep.equal([]);
    });

    it('passes the filter through to the org', async () => {
        const filter = { usernames: [Username.of('alice@example.com')] };
        const org = new FakeOrgClient({ listed: [alphaForAlice] });
        const service = new ExportService(org);

        await service.run(undefined, filter);

        expect(org.calls.listAssignments).to.deep.equal([filter]);
    });

    it('exports nothing when the org holds nothing', async () => {
        const service = new ExportService(new FakeOrgClient());
        const result = await service.run(undefined);

        expect(result.assignments).to.equal(0);
    });
});
