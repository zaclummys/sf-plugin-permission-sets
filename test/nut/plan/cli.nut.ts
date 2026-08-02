import { expect } from 'chai';
import { fixture, ps, unresolvableOrg } from '../run.ts';

const validFile = fixture('valid.yml');

/**
 * What plan does with a usable org is in plan/org/, against a scratch org built for it.
 * What is here is the half that needs no org and so runs on every pull request: the flags,
 * the messages file, and the refusal when the org cannot be reached.
 */
describe('ps plan before it reaches an org', () => {
    // plan resolves messages/ps.plan.md, which check never touches, so this fails for
    // plan alone if that one file breaks.
    it('renders its summary from the messages file', () => {
        const result = ps('plan --help', 0);

        expect(result.shellOutput.stdout).to.contain(
            'Preview the changes that would reconcile a target org to the assignment files.',
        );
    });

    it('documents its flags in --help', () => {
        const result = ps('plan --help', 0);
        const help = result.shellOutput.stdout;

        expect(help).to.contain('--mode');
        expect(help).to.contain('--file');
        expect(help).to.contain('--show-unchanged');
        expect(help).to.contain('--strict');
    });

    it('names the modes it accepts when given one it does not', () => {
        const result = ps(`plan --file ${validFile} --target-org ${unresolvableOrg} --mode bogus`, 2);

        expect(result.shellOutput.stderr).to.contain('Expected --mode=bogus to be one of: additive, destructive, sync');
    });

    it('fails on an org that does not resolve, before reading anything', () => {
        const result = ps(`plan --file ${validFile} --target-org ${unresolvableOrg}`, 'nonZero');

        expect(result.shellOutput.stderr).to.contain('No authorization information found');
    });

    // Nothing asserts what happens with no --target-org at all. That is Flags.requiredOrg()
    // answering, not this plugin, and the answer depends on whichever org the machine has
    // set as default. Every assertion above holds on any machine.
});
