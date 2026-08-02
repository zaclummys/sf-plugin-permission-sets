import { expect } from 'chai';
import { createUser, deactivateUser, fixture, ps, writeAssignmentFile } from '../../run.ts';
import { org } from '../../org-session.ts';
import type { PsValidateResult } from '../../../../src/commands/ps/validate.js';

describe('ps validate resolving a file against the org', () => {
    it('finds nothing wrong with a file the org can satisfy', () => {
        const result = ps(`validate --file ${org.readOnlyPlanFile} --target-org ${org.username}`, 0);

        expect(result.shellOutput.stdout).to.contain('0 errors, 0 warnings.');
    });

    it('names a permission set the org does not have', () => {
        const result = ps(`validate --file ${org.missingTargetFile} --target-org ${org.username}`, 1);

        expect(result.shellOutput.stdout).to.contain('PS_Nut_Never_Deployed: permission set not found in org');
    });

    it('names a user the org does not have', () => {
        const result = ps(`validate --file ${org.missingUserFile} --target-org ${org.username}`, 1);

        expect(result.shellOutput.stdout).to.contain('nobody@nut.invalid: user not found in org');
    });

    it('returns the resolved counts in the --json envelope', () => {
        const result = ps<PsValidateResult>(
            `validate --file ${org.readOnlyPlanFile} --target-org ${org.username} --json`,
            0,
        );

        expect(result.jsonOutput?.result).to.deep.include({
            files: 1,
            users: 1,
            assignments: 1,
        });
    });

    it('rejects a missing required --file flag', () => {
        const result = ps(`validate --target-org ${org.username}`, 2);

        expect(result.shellOutput.stderr).to.contain('Missing required flag file');
    });

    it('fails a schema violation with exit 1', () => {
        const result = ps(`validate --file ${fixture('schema-error.yml')} --target-org ${org.username}`, 1);

        expect(result.shellOutput.stdout).to.contain('error:');
    });

    it('fails malformed YAML with exit 1', () => {
        const result = ps(`validate --file ${fixture('malformed.yml')} --target-org ${org.username}`, 1);

        expect(result.shellOutput.stdout).to.contain('error:');
    });
});

/**
 * Creating a user is the most failure-prone thing here: it needs a profile whose name the org
 * decides, and a licence to be free for it. Its own hook keeps a failure to this one spec.
 *
 * TARGET_AMBIGUOUS still has no test, for a reason no org can fix: it needs two records of
 * one kind sharing a case-folded name, which an org without a managed package cannot have.
 */
describe('ps validate against a user the org deactivated', () => {
    let inactiveUserFile: string;

    before(() => {
        const inactive = createUser(org.dir, org.username);

        deactivateUser(org.username, inactive.id);
        inactiveUserFile = writeAssignmentFile(org.dir, inactive.username, 'PS_Nut_Alpha');
    });

    it('names it as inactive rather than missing', () => {
        const result = ps(`validate --file ${inactiveUserFile} --target-org ${org.username}`, 1);

        expect(result.shellOutput.stdout).to.contain('user is inactive');
    });
});
