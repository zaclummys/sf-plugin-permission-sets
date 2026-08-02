import { expect } from 'chai';
import { fixture, ps } from './run.ts';
import type { PsCheckResult } from '../../src/commands/ps/check.js';

// The only import from src/ is a type, erased before anything runs. It buys the typed
// jsonOutput.result below, and it is the published --json contract rather than an
// internal, so it does not couple the NUT to a refactor the way a value import would.

// Absolute, so nothing below depends on the directory mocha was invoked from.
const validFile = fixture('valid.yml');
const warningsFile = fixture('warnings.yml');
const schemaErrorFile = fixture('schema-error.yml');

function check(args: string, ensureExitCode: number | 'nonZero') {
    return ps<PsCheckResult>(`check ${args}`, ensureExitCode);
}

describe('ps check NUTs', () => {
    it('passes a valid file with exit 0', () => {
        const result = check(`--file ${validFile}`, 0);

        expect(result.shellOutput.stdout).to.contain('0 errors, 0 warnings.');
    });

    it('leaves stderr empty on success', () => {
        const result = check(`--file ${validFile}`, 0);

        expect(result.shellOutput.stderr).to.equal('');
    });

    it('reports warnings but exits 0', () => {
        const result = check(`--file ${warningsFile}`, 0);

        expect(result.shellOutput.stdout).to.contain('0 errors, 2 warnings.');
    });

    it('turns warnings into a failure under --strict', () => {
        const result = check(`--file ${warningsFile} --strict`, 1);

        expect(result.shellOutput.stderr).to.contain('Check found problems');
    });

    it('fails a schema violation with exit 1', () => {
        const result = check(`--file ${schemaErrorFile}`, 1);

        expect(result.shellOutput.stdout).to.contain('error:');
    });

    it('counts the file, the users, and the assignments in --json', () => {
        const result = check(`--file ${validFile} --json`, 0);
        const payload = result.jsonOutput?.result;

        // valid.yml declares one user holding two permission sets, one group, and one
        // license: four assignments, known from the fixture rather than from the org.
        expect(payload).to.deep.include({
            files: 1,
            users: 1,
            assignments: 4,
        });
    });

    it('keeps stdout pure JSON when --json is passed', () => {
        const result = check(`--file ${warningsFile} --json`, 0);

        expect(result.jsonError).to.equal(undefined);
        expect(result.shellOutput.stdout).to.not.contain('warning:');
    });

    it('still emits a parseable envelope when it exits 1', () => {
        const result = check(`--file ${schemaErrorFile} --json`, 1);
        const findings = result.jsonOutput?.result.findings ?? [];

        expect(findings.map((finding) => finding.code)).to.contain('SCHEMA');
    });

    it('rejects a missing required --file flag with exit 2', () => {
        const result = check('', 2);

        expect(result.shellOutput.stderr).to.contain('Missing required flag file');
    });

    // Each command resolves its own messages file at import time, so a broken or renamed
    // messages/ps.check.md takes this command down while the others keep working. This
    // reads the working tree's messages/, not a tarball: nothing here proves what the
    // published package contains.
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
});
