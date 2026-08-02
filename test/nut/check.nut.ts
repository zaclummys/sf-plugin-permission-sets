import { expect } from 'chai';
import { fixture, ps } from './run.ts';
import type { PsCheckResult } from '../../src/commands/ps/check.js';

// The only import from src/ is a type, erased before anything runs. It buys the typed
// jsonOutput.result below, and it is the published --json contract rather than an
// internal, so it does not couple the NUT to a refactor the way a value import would.

// Absolute, so nothing below depends on the directory mocha was invoked from.
const validFile = fixture('valid.yml');
const warningsFile = fixture('warnings.yml');
const emptyFile = fixture('empty.yml');
const emptyUserFile = fixture('empty-user.yml');
const schemaErrorFile = fixture('schema-error.yml');
const malformedFile = fixture('malformed.yml');
const mixedCaseUserFile = fixture('mixed-case-user.yml');
const mixedCaseTargetFile = fixture('mixed-case-target.yml');
const unmatchedGlob = fixture('nope/*.yml');

function check(args: string, ensureExitCode: number | 'nonZero') {
    return ps<PsCheckResult>(`check ${args}`, ensureExitCode);
}

/**
 * check is the one command with no --target-org, so every rule it enforces can be asserted
 * without an org and the whole command lives here rather than being split with the vitest
 * suite. What is asserted is the observable output: exit code, which stream carried what,
 * and the --json payload.
 */
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

    it('names the duplicate target it warns about', () => {
        const result = check(`--file ${warningsFile}`, 0);

        expect(result.shellOutput.stdout).to.contain('listed twice under permissionSets');
    });

    it('names the empty scope list it warns about', () => {
        const result = check(`--file ${warningsFile}`, 0);

        expect(result.shellOutput.stdout).to.contain('permissionSetGroups is empty');
    });

    it('warns about a file that parses to nothing', () => {
        const result = check(`--file ${emptyFile}`, 0);

        expect(result.shellOutput.stdout).to.contain('file is empty');
    });

    it('warns about a user that declares no scopes', () => {
        const result = check(`--file ${emptyUserFile}`, 0);

        expect(result.shellOutput.stdout).to.contain('carol@example.com: no scopes declared');
    });

    it('merges a user declared under two spellings that differ only in case', () => {
        const result = check(`--file ${mixedCaseUserFile} --json`, 0);

        expect(result.jsonOutput?.result.users).to.equal(1);
    });

    it('dedupes an assignment declared under two spellings that differ only in case', () => {
        const result = check(`--file ${mixedCaseUserFile} --json`, 0);

        expect(result.jsonOutput?.result.assignments).to.equal(1);
    });

    it('warns about a target listed twice under spellings that differ only in case', () => {
        const result = check(`--file ${mixedCaseTargetFile}`, 0);

        expect(result.shellOutput.stdout).to.contain('listed twice under permissionSets');
    });

    it('turns warnings into a failure under --strict', () => {
        const result = check(`--file ${warningsFile} --strict`, 1);

        expect(result.shellOutput.stderr).to.contain('Check found problems');
    });

    it('leaves a clean file passing under --strict', () => {
        const result = check(`--file ${validFile} --strict`, 0);

        expect(result.shellOutput.stdout).to.contain('0 errors, 0 warnings.');
    });

    it('fails a schema violation with exit 1', () => {
        const result = check(`--file ${schemaErrorFile}`, 1);

        expect(result.shellOutput.stdout).to.contain('error:');
    });

    it('fails malformed YAML with exit 1', () => {
        const result = check(`--file ${malformedFile}`, 1);

        expect(result.shellOutput.stdout).to.contain('error:');
    });

    it('errors when no file matches the glob', () => {
        const result = check(`--file ${unmatchedGlob}`, 1);

        expect(result.shellOutput.stdout).to.contain('no files matched');
    });

    it('aggregates findings across multiple -f files', () => {
        const result = check(`--file ${validFile} --file ${warningsFile}`, 0);

        expect(result.shellOutput.stdout).to.contain('0 errors, 2 warnings.');
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

    it('lists every finding in the --json envelope', () => {
        const result = check(`--file ${warningsFile} --json`, 0);

        expect(result.jsonOutput?.result.findings).to.have.lengthOf(2);
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

    // check resolves messages/ps.check.md, which no other command touches, so this fails
    // for check alone if that one file breaks. It reads the working tree's messages/, not
    // a tarball: nothing here proves what the published package contains.
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
