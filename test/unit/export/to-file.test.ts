import { join } from 'node:path';
import { expect } from 'chai';
import { ExportService } from '../../../lib/services/index.js';
import { FakeOrgClient } from '../fake-org-client.ts';
import { jobFileText } from '../job-file.ts';
import { alphaForAlice } from '../org-fixtures.ts';
import { Workspace } from '../workspace.ts';

describe('ExportService to a file', () => {
    const workspace = Workspace.use();

    it('reports the path it wrote', async () => {
        const target = workspace.path('exported.yml');
        const service = new ExportService(new FakeOrgClient({ listed: [alphaForAlice] }));
        const result = await service.run(target);

        expect(result.outputFile).to.equal(target);
    });

    it('writes the document it returns', async () => {
        const service = new ExportService(new FakeOrgClient({ listed: [alphaForAlice] }));

        await service.run(workspace.path('written.yml'));

        const written = await workspace.read('written.yml');

        expect(written).to.equal(await jobFileText('one-assignment.yml'));
    });

    it('creates a directory the path names but disk does not have', async () => {
        const nested = join('missing', 'deeper', 'exported.yml');
        const service = new ExportService(new FakeOrgClient({ listed: [alphaForAlice] }));

        await service.run(workspace.path(nested));

        const written = await workspace.read(nested);

        expect(written).to.equal(await jobFileText('one-assignment.yml'));
    });
});
