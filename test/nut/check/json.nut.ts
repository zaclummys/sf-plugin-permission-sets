import { expect } from 'chai';
import { check, schemaErrorFile, validFile, warningsFile } from './helpers.ts';

describe('ps check --json', () => {
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
});
