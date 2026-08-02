import { expect } from 'chai';
import { ps, unresolvableOrg } from './run.ts';

/**
 * export reads the org and writes YAML back, so the round trip is the vitest suite's.
 * What holds without an org is the flag surface, which is the widest of any command here:
 * --kind is an enum, and getting one of its values wrong should say which are valid.
 */
describe('ps export NUTs', () => {
    it('renders its summary from the messages file', () => {
        const result = ps('export --help', 0);

        expect(result.shellOutput.stdout).to.contain(
            "Generate a YAML file from the current org's permission set assignments.",
        );
    });

    it('documents its flags in --help', () => {
        const result = ps('export --help', 0);
        const help = result.shellOutput.stdout;

        expect(help).to.contain('--output-file');
        expect(help).to.contain('--user');
        expect(help).to.contain('--kind');
    });

    it('names the kinds it accepts when given one it does not', () => {
        const result = ps(`export --target-org ${unresolvableOrg} --kind bogus`, 2);

        expect(result.shellOutput.stderr).to.contain(
            'Expected --kind=bogus to be one of: permissionSets, permissionSetGroups, permissionSetLicenses',
        );
    });

    it('fails on an org that does not resolve', () => {
        const result = ps(`export --target-org ${unresolvableOrg}`, 'nonZero');

        expect(result.shellOutput.stderr).to.contain('No authorization information found');
    });
});
