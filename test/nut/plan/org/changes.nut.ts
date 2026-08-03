import { expect } from 'chai';
import { org } from '../../org-session.ts';
import type { PsPlanResult } from '../../../../src/commands/ps/plan.js';

describe('ps plan on the changes it would make', () => {
    it('counts the one assignment an additive run would add', () => {
        const result = org.runPs(`plan --file ${org.useJobFile('readOnlyPlan')}`, 0);

        expect(result.shellOutput.stdout).to.contain('Plan: 1 to add, 0 to update. 1 users affected.');
    });

    it('names the permission set it would add', () => {
        const result = org.runPs(`plan --file ${org.useJobFile('readOnlyPlan')}`, 0);

        expect(result.shellOutput.stdout).to.contain('PS_Nut_Alpha');
    });

    it('plans a permission set group the same way it plans a permission set', () => {
        const result = org.runPs(`plan --file ${org.useJobFile('group')}`, 0);

        expect(result.shellOutput.stdout).to.contain('Plan: 1 to add, 0 to update. 1 users affected.');
        expect(result.shellOutput.stdout).to.contain('PS_Nut_Group');
    });

    it('reports the org it planned against in --json', () => {
        const result = org.runPs<PsPlanResult>(`plan --file ${org.useJobFile('readOnlyPlan')} --json`, 0);
        const payload = result.jsonOutput?.result;

        expect(payload?.org.username).to.equal(org.getUsername());
        expect(payload?.counts.toAdd).to.equal(1);
    });

    it('headers the plan with the org and the mode', () => {
        const result = org.runPs(`plan --file ${org.useJobFile('readOnlyPlan')} --mode sync`, 0);

        expect(result.shellOutput.stdout).to.contain('Permission Set Assignments Plan');
        expect(result.shellOutput.stdout).to.contain('Mode: sync');
    });

    it('suggests the apply command that would carry out the plan', () => {
        const result = org.runPs(`plan --file ${org.useJobFile('readOnlyPlan')} --mode sync`, 0);

        expect(result.shellOutput.stdout).to.contain('ps apply');
        expect(result.shellOutput.stdout).to.contain(`-f "${org.useJobFile('readOnlyPlan')}" --mode sync`);
    });

    it('reports no changes when everything the file declares is already held', () => {
        const result = org.runPs(`plan --file ${org.useJobFile('unchanged')}`, 0);

        expect(result.shellOutput.stdout).to.contain('No changes.');
    });

    it('lists unchanged assignments under --show-unchanged', () => {
        const result = org.runPs(`plan --file ${org.useJobFile('unchanged')} --show-unchanged`, 0);

        expect(result.shellOutput.stdout).to.contain('PS_Nut_Epsilon');
    });

    it('leaves unchanged assignments out of the body by default', () => {
        const result = org.runPs(`plan --file ${org.useJobFile('unchanged')}`, 0);

        expect(result.shellOutput.stdout).to.not.contain('PS_Nut_Epsilon');
    });
});
