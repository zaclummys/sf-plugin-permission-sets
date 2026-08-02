import { expect } from 'chai';
import { check, mixedCaseTargetFile, mixedCaseUserFile } from './helpers.ts';

/** The org compares usernames and target names case-insensitively, so a file has to too. */
describe('ps check on names that differ only in case', () => {
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
});
