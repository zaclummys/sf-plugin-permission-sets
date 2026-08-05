import { expect } from 'chai';
import { org } from '../../org-session.ts';
import type { PsApplyResult } from '../../../../src/commands/ps/apply.js';

describe('ps apply on an assignment that carries an expiration', () => {
    it('adds an assignment the file declares with an expiration', () => {
        const result = org.runPs<PsApplyResult>(
            `apply --file ${org.useJobFile('timedAddition')} --no-prompt --json`,
            0,
        );

        expect(result.jsonOutput?.result).to.deep.include({
            added: 1,
            updated: 0,
            removed: 0,
        });
    });

    it('stops proposing an update once the declared expiration is what the org holds', () => {
        org.runPs(`apply --file ${org.useJobFile('timedAddition')} --no-prompt`, 0);

        const after = org.runPs(`plan --file ${org.useJobFile('timedAddition')}`, 0);

        expect(after.shellOutput.stdout).to.contain('Nothing to apply in additive mode.');
    });

    it('clears the expiration when the file declares the assignment without one', () => {
        const result = org.runPs<PsApplyResult>(
            `apply --file ${org.useJobFile('clearedExpiration')} --no-prompt --json`,
            0,
        );

        expect(result.jsonOutput?.result).to.deep.include({
            added: 0,
            updated: 1,
            removed: 0,
        });
    });

    it('stops proposing an update once the expiration has been cleared', () => {
        org.runPs(`apply --file ${org.useJobFile('clearedExpiration')} --no-prompt`, 0);

        const after = org.runPs(`plan --file ${org.useJobFile('clearedExpiration')}`, 0);

        expect(after.shellOutput.stdout).to.contain('Nothing to apply in additive mode.');
    });
});
