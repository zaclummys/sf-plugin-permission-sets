import { expect } from 'chai';
import { org } from '../../org-session.ts';
import type { PsApplyResult } from '../../../../src/commands/ps/apply.js';

/** Gamma and Theta are this file's alone, so what it writes is invisible to every other one. */
describe('ps apply writing to the org', () => {
    it('reports an expiration change as an update rather than an addition', () => {
        const result = org.runPs<PsApplyResult>(`apply --file ${org.useJobFile('reExpiring')} --no-prompt --json`, 0);

        expect(result.jsonOutput?.result).to.deep.include({
            added: 0,
            updated: 1,
            removed: 0,
        });
    });

    it('adds the assignment and leaves the org matching the file', () => {
        const applied = org.runPs(`apply --file ${org.useJobFile('applied')} --no-prompt`, 0);

        expect(applied.shellOutput.stdout).to.contain('Applied: 1 added, 0 updated, 0 removed.');

        // Applying twice is what proves the write landed rather than being reported.
        const after = org.runPs(`plan --file ${org.useJobFile('applied')}`, 0);

        expect(after.shellOutput.stdout).to.contain('No changes.');
    });
});
