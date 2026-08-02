import { expect } from 'chai';
import { fixture, ps, unresolvableOrg } from './run.ts';

const validFile = fixture('valid.yml');

/**
 * apply is the only command that writes, so its guards are the part worth pinning where no
 * org can be reached: a bad --mode or a negative --max-deletes has to be refused during
 * parsing, before anything opens a connection. What apply does once it has an org is in
 * test/nut/org/, against a scratch org built for it.
 */
describe('ps apply NUTs', () => {
    it('renders its summary from the messages file', () => {
        const result = ps('apply --help', 0);

        expect(result.shellOutput.stdout).to.contain(
            'Reconcile a target org to match the permission set assignment files.',
        );
    });

    it('documents its flags in --help', () => {
        const result = ps('apply --help', 0);
        const help = result.shellOutput.stdout;

        expect(help).to.contain('--mode');
        expect(help).to.contain('--max-deletes');
        expect(help).to.contain('--dry-run');
        expect(help).to.contain('--no-prompt');
    });

    it('names the modes it accepts when given one it does not', () => {
        const result = ps(`apply --file ${validFile} --target-org ${unresolvableOrg} --mode bogus`, 2);

        expect(result.shellOutput.stderr).to.contain('Expected --mode=bogus to be one of: additive, destructive, sync');
    });

    it('refuses a negative --max-deletes during parsing', () => {
        const result = ps(
            `apply --file ${validFile} --target-org ${unresolvableOrg} --max-deletes -1`,
            2,
        );

        expect(result.shellOutput.stderr).to.contain('Expected an integer greater than or equal to 0');
    });

    it('fails on an org that does not resolve, before writing anything', () => {
        const result = ps(`apply --file ${validFile} --target-org ${unresolvableOrg}`, 'nonZero');

        expect(result.shellOutput.stderr).to.contain('No authorization information found');
    });
});
