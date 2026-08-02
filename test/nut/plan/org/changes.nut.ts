import { expect } from 'chai';
import { ps } from '../../run.ts';
import { org } from '../../org-session.ts';
import type { PsPlanResult } from '../../../../src/commands/ps/plan.js';

describe('ps plan on the changes it would make', () => {
    it('counts the one assignment an additive run would add', () => {
        const result = ps(`plan --file ${org.readOnlyPlanFile} --target-org ${org.username}`, 0);

        expect(result.shellOutput.stdout).to.contain('Plan: 1 to add, 0 to update. 1 users affected.');
    });

    it('names the permission set it would add', () => {
        const result = ps(`plan --file ${org.readOnlyPlanFile} --target-org ${org.username}`, 0);

        expect(result.shellOutput.stdout).to.contain('PS_Nut_Alpha');
    });

    it('plans a permission set group the same way it plans a permission set', () => {
        const result = ps(`plan --file ${org.groupFile} --target-org ${org.username}`, 0);

        expect(result.shellOutput.stdout).to.contain('Plan: 1 to add, 0 to update. 1 users affected.');
        expect(result.shellOutput.stdout).to.contain('PS_Nut_Group');
    });

    it('reports the org it planned against in --json', () => {
        const result = ps<PsPlanResult>(`plan --file ${org.readOnlyPlanFile} --target-org ${org.username} --json`, 0);
        const payload = result.jsonOutput?.result;

        expect(payload?.org.username).to.equal(org.username);
        expect(payload?.counts.toAdd).to.equal(1);
    });

    it('headers the plan with the org and the mode', () => {
        const result = ps(`plan --file ${org.readOnlyPlanFile} --target-org ${org.username} --mode sync`, 0);

        expect(result.shellOutput.stdout).to.contain('Permission Set Assignments Plan');
        expect(result.shellOutput.stdout).to.contain('Mode: sync');
    });

    it('suggests the apply command that would carry out the plan', () => {
        const result = ps(`plan --file ${org.readOnlyPlanFile} --target-org ${org.username} --mode sync`, 0);

        expect(result.shellOutput.stdout).to.contain('ps apply');
        expect(result.shellOutput.stdout).to.contain(`-f "${org.readOnlyPlanFile}" --mode sync`);
    });

    it('reports no changes when everything the file declares is already held', () => {
        const result = ps(`plan --file ${org.unchangedFile} --target-org ${org.username}`, 0);

        expect(result.shellOutput.stdout).to.contain('No changes.');
    });

    it('lists unchanged assignments under --show-unchanged', () => {
        const result = ps(`plan --file ${org.unchangedFile} --target-org ${org.username} --show-unchanged`, 0);

        expect(result.shellOutput.stdout).to.contain('PS_Nut_Epsilon');
    });

    it('leaves unchanged assignments out of the body by default', () => {
        const result = ps(`plan --file ${org.unchangedFile} --target-org ${org.username}`, 0);

        expect(result.shellOutput.stdout).to.not.contain('PS_Nut_Epsilon');
    });
});
