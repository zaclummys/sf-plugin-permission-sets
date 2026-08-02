import { expect } from 'chai';
import { org } from '../../org-session.ts';
import type { PsPlanResult } from '../../../../src/commands/ps/plan.js';

/** The seeded Delta assignment nothing declares, which is what a mode has to decide about. */
describe('ps plan against an undeclared assignment', () => {
    it('counts additions and removals together in sync mode', () => {
        const result = org.runPs(`plan --file ${org.useJobFile('undeclared')} --mode sync`, 0);

        expect(result.shellOutput.stdout).to.contain('Plan: 1 to add, 0 to update, 1 to remove. 2 users affected.');
    });

    it('marks the holder of an undeclared assignment for removal in sync mode', () => {
        const result = org.runPs(`plan --file ${org.useJobFile('undeclared')} --mode sync`, 0);

        expect(result.shellOutput.stdout).to.contain('PS_Nut_Delta');
        expect(result.shellOutput.stdout).to.contain(`- ${org.username()}`);
    });

    it('reports undeclared assignments as drift in additive mode', () => {
        const result = org.runPs(`plan --file ${org.useJobFile('undeclared')}`, 0);

        expect(result.shellOutput.stdout).to.contain('Drift: 1 undeclared assignment(s) not removed in additive mode.');
    });

    it('returns counts, drift and the full diff in the --json envelope', () => {
        const result = org.runPs<PsPlanResult>(`plan --file ${org.useJobFile('undeclared')} --mode sync --json`, 0);
        const payload = result.jsonOutput?.result;

        expect(payload?.counts).to.deep.include({
            toAdd: 1,
            toUpdate: 0,
            toRemove: 1,
            usersAffected: 2,
        });
        expect(payload?.changes.toRemove).to.have.lengthOf(1);
    });

    it('keeps stdout pure JSON when --json is passed', () => {
        const result = org.runPs(`plan --file ${org.useJobFile('undeclared')} --json`, 0);

        expect(result.shellOutput.stdout).to.not.contain('Permission Set Assignments Plan');
    });
});
