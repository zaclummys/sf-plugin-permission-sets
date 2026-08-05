import { expect } from 'chai';
import { org } from '../../org-session.ts';
import type { PsApplyResult } from '../../../../src/commands/ps/apply.js';

describe('ps apply on a change the org rejects', () => {
    it('exits 1 and says some changes failed', () => {
        const result = org.runPs(`apply --file ${org.useJobFile('rejectedLicense')} --no-prompt`, 1);

        expect(result.shellOutput.stderr).to.contain('Some changes failed.');
    });

    it('names the assignee and the target the org refused', () => {
        const result = org.runPs(`apply --file ${org.useJobFile('rejectedLicense')} --no-prompt`, 1);

        expect(result.shellOutput.stdout).to.contain(
            `failed to add ${org.getUsername()} on ${org.getExhaustedLicense()}:`,
        );
    });

    it('counts the rejection as a failure rather than an addition in --json', () => {
        const result = org.runPs<PsApplyResult>(
            `apply --file ${org.useJobFile('rejectedLicense')} --no-prompt --json`,
            1,
        );

        expect(result.jsonOutput?.result).to.deep.include({
            added: 0,
            failures: 1,
        });
    });
});
