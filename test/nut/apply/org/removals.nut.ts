import { expect } from 'chai';
import { org } from '../../org-session.ts';
import type { PsApplyResult } from '../../../../src/commands/ps/apply.js';

describe('ps apply removing an assignment from the org', () => {
    it('removes the group the file leaves undeclared in sync mode', () => {
        const result = org.runPs<PsApplyResult>(
            `apply --file ${org.useJobFile('removedGroup')} --mode sync --no-prompt --json`,
            0,
        );

        expect(result.jsonOutput?.result).to.deep.include({
            added: 0,
            updated: 0,
            removed: 1,
        });
    });

    it('stops proposing the removal once it has been applied', () => {
        org.runPs(`apply --file ${org.useJobFile('removedGroup')} --mode sync --no-prompt`, 0);

        const after = org.runPs(`plan --file ${org.useJobFile('removedGroup')} --mode sync`, 0);

        expect(after.shellOutput.stdout).to.contain('No changes.');
    });
});
