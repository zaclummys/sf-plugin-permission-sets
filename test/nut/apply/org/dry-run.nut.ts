import { expect } from 'chai';
import { org } from '../../org-session.ts';
import type { PsApplyResult } from '../../../../src/commands/ps/apply.js';

/** Every spec here leaves the org as it found it, either by not writing or by having nothing to write. */
describe('ps apply without changing the org', () => {
    it('reports what a dry run would do without doing it', () => {
        const dryRun = org.runPs(`apply --file ${org.useJobFile('dryRun')} --dry-run`, 0);

        expect(dryRun.shellOutput.stdout).to.contain('Dry run: 1 to add, 0 to update, 0 to remove.');

        // The org is untouched, so planning the same file still has the same to say.
        const after = org.runPs(`plan --file ${org.useJobFile('dryRun')}`, 0);

        expect(after.shellOutput.stdout).to.contain('Plan: 1 to add, 0 to update. 1 users affected.');
    });

    it('counts a dry run in the --json envelope without adding anything', () => {
        const result = org.runPs<PsApplyResult>(`apply --file ${org.useJobFile('dryRun')} --dry-run --json`, 0);
        const payload = result.jsonOutput?.result;

        expect(payload?.toAdd).to.equal(1);
        expect(payload?.added).to.equal(0);
    });

    it('applies nothing when the org already satisfies the file', () => {
        const result = org.runPs(`apply --file ${org.useJobFile('unchanged')} --no-prompt`, 0);

        expect(result.shellOutput.stdout).to.contain('Applied: 0 added, 0 updated, 0 removed.');
    });

    it('reports nothing to do on a dry run of a file the org satisfies', () => {
        const result = org.runPs(`apply --file ${org.useJobFile('unchanged')} --dry-run`, 0);

        expect(result.shellOutput.stdout).to.contain('Dry run: 0 to add, 0 to update, 0 to remove.');
    });

    it('applies a file with no warnings under --strict', () => {
        const result = org.runPs(`apply --file ${org.useJobFile('unchanged')} --strict --no-prompt`, 0);

        expect(result.shellOutput.stdout).to.contain('Applied: 0 added, 0 updated, 0 removed.');
    });
});
