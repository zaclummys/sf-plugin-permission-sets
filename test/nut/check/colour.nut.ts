import { expect } from 'chai';
import { fixture, ps, psInColour } from '../run.ts';

/**
 * Colour is asserted on `check` because it is the one command that reaches findings with no
 * org, so the rule is testable on a fork's pull request. The contract under test is "a
 * terminal gets colour and a pipe does not", which is what keeps `sf ps ... | jq` working.
 *
 * The coloured cases spawn bin/run.js directly rather than through execCmd, which runs
 * everything it captures through strip-ansi: colour is invisible to it by design. The plain
 * case stays on execCmd, because there the stripping cannot hide a failure.
 */
describe('ps check colouring its findings', () => {
    it('colours the warning label when the terminal takes colour', () => {
        const stdout = psInColour([
            'check',
            '--file',
            fixture('warnings.yml'),
        ], 0);

        expect(stdout).to.contain('\u001b[33mwarning:');
    });

    it('colours an error label red rather than yellow', () => {
        const stdout = psInColour([
            'check',
            '--file',
            fixture('schema-error.yml'),
        ], 1);

        expect(stdout).to.contain('\u001b[31merror:');
    });

    it('leaves the finding plain when the terminal does not take colour', () => {
        const result = ps(`check --file ${fixture('warnings.yml')}`, 0);

        expect(result.shellOutput.stdout).to.not.contain('\u001b[');
    });
});
