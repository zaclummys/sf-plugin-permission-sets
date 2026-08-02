import { expect } from 'chai';
import { fixture, ps, unresolvableOrg } from './run.ts';

const validFile = fixture('valid.yml');

/**
 * validate resolves every declared name against a real org, so what it does with a usable
 * one belongs to the vitest suite. What is left here is the contract that holds with no
 * org at all, plus the messages file only this command reads.
 */
describe('ps validate NUTs', () => {
    it('renders its summary from the messages file', () => {
        const result = ps('validate --help', 0);

        expect(result.shellOutput.stdout).to.contain(
            'Validate permission set assignment files against a target org.',
        );
    });

    it('documents --file in --help', () => {
        const result = ps('validate --help', 0);

        expect(result.shellOutput.stdout).to.contain('--file');
    });

    it('fails on an org that does not resolve', () => {
        const result = ps(`validate --file ${validFile} --target-org ${unresolvableOrg}`, 'nonZero');

        expect(result.shellOutput.stderr).to.contain('No authorization information found');
    });
});
