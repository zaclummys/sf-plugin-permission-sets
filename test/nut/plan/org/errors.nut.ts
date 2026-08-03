import { expect } from 'chai';
import { fixture } from '../../run.ts';
import { org } from '../../org-session.ts';

/**
 * These all abort on the file, before the org is ever queried, but they still need an org
 * that resolves: --target-org is parsed before run() reads anything.
 */
describe('ps plan on a file it cannot use', () => {
    it('fails a schema violation with exit 1', () => {
        const result = org.runPs(`plan --file ${fixture('schema-error.yml')}`, 1);

        expect(result.shellOutput.stderr).to.contain('do not resolve cleanly against the org');
    });

    it('fails malformed YAML with exit 1', () => {
        const result = org.runPs(`plan --file ${fixture('malformed.yml')}`, 1);

        expect(result.shellOutput.stdout).to.contain('error:');
    });

    it('turns warnings into a failure under --strict', () => {
        const result = org.runPs(`plan --file ${fixture('warnings.yml')} --strict`, 1);

        expect(result.shellOutput.stderr).to.contain('--strict treats them as errors');
    });

    it('names the warnings that --strict refused to plan', () => {
        const result = org.runPs(`plan --file ${fixture('warnings.yml')} --strict`, 1);

        expect(result.shellOutput.stdout).to.contain('listed twice under permissionSets');
    });

    it('plans a file with no warnings under --strict', () => {
        const result = org.runPs(`plan --file ${org.useJobFile('unchanged')} --strict`, 0);

        expect(result.shellOutput.stdout).to.contain('Nothing to apply in additive mode.');
    });
});
