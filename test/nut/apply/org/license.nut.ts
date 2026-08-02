import { expect } from 'chai';
import { ps } from '../../run.ts';
import { org } from '../../org-session.ts';

/**
 * The one seeded resource that cannot be one-per-job the way a permission set can: which
 * licences an org has comes from its edition, not from the fixture project. So planning the
 * licence and applying it share a file and run in this order, because applying it is what
 * makes the plan stop being an addition. Splitting them would make either one depend on
 * whether the other had run.
 *
 * A licence is also a different sObject from an assignment, so this is the only file that
 * reaches the PermissionSetLicenseAssign query and DML paths in the adapter.
 */
describe('ps plan then ps apply on a permission set licence', () => {
    it('plans a permission set licence the same way it plans a permission set', () => {
        const result = ps(`plan --file ${org.licenseFile} --target-org ${org.username}`, 0);

        expect(result.shellOutput.stdout).to.contain('Plan: 1 to add, 0 to update. 1 users affected.');
    });

    it('adds a permission set licence, which is a different sObject from an assignment', () => {
        const applied = ps(`apply --file ${org.licenseFile} --target-org ${org.username} --no-prompt`, 0);

        expect(applied.shellOutput.stdout).to.contain('Applied: 1 added, 0 updated, 0 removed.');

        const after = ps(`plan --file ${org.licenseFile} --target-org ${org.username}`, 0);

        expect(after.shellOutput.stdout).to.contain('No changes.');
    });
});
