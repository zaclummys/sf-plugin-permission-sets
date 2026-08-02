import { expect } from 'chai';
import { check } from './helpers.ts';

/**
 * check is the one command with no --target-org, so unlike the other four its whole surface
 * runs without an org and the rest of this directory is not split offline from org.
 *
 * check resolves messages/ps.check.md, which no other command touches, so this file fails
 * for check alone if that one file breaks. It reads the working tree's messages/, not a
 * tarball: nothing here proves what the published package contains.
 */
describe('ps check help and flags', () => {
    it('renders its summary from the messages file', () => {
        const result = check('--help', 0);

        expect(result.shellOutput.stdout).to.contain(
            'Statically check permission set assignment files, with no org connection.',
        );
    });

    it('documents --file and --strict in --help', () => {
        const result = check('--help', 0);

        expect(result.shellOutput.stdout).to.contain('--file');
        expect(result.shellOutput.stdout).to.contain('--strict');
    });

    it('rejects a missing required --file flag with exit 2', () => {
        const result = check('', 2);

        expect(result.shellOutput.stderr).to.contain('Missing required flag file');
    });
});
