import { expect } from 'chai';
import { org } from '../../org-session.ts';

/**
 * The shape of deleting a line from an exported file: the user stays declared, the permission
 * set leaves the files entirely. Iota is held by the admin and named by no file in the suite,
 * which is what makes this different from the Delta case in drift.nut.ts, where another file
 * still names the target and so keeps it in scope.
 *
 * `sync` is documented as a full reconcile that removes undeclared assignments, so the org
 * holding a permission set no file asks for is exactly what it exists to act on.
 */
describe('ps plan against a target no file names', () => {
    it('counts the dropped permission set as a removal in sync mode', () => {
        const result = org.runPs(`plan --file ${org.useJobFile('undeclaredTarget')} --mode sync`, 0);

        expect(result.shellOutput.stdout).to.contain('Plan: 0 to add, 0 to update, 1 to remove. 1 users affected.');
    });

    it('names the permission set it would remove', () => {
        const result = org.runPs(`plan --file ${org.useJobFile('undeclaredTarget')} --mode sync`, 0);

        expect(result.shellOutput.stdout).to.contain('PS_Nut_Iota');
    });

    it('reports the dropped permission set as drift in additive mode', () => {
        const result = org.runPs(`plan --file ${org.useJobFile('undeclaredTarget')}`, 0);

        expect(result.shellOutput.stdout).to.contain('Drift: 1 undeclared assignment(s) not removed in additive mode.');
    });
});
