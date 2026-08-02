import { expect } from 'chai';
import { check, emptyFile, emptyUserFile, validFile, warningsFile } from './helpers.ts';

describe('ps check findings', () => {
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

    it('aggregates findings across multiple -f files', () => {
        const result = check(`--file ${validFile} --file ${warningsFile}`, 0);

        expect(result.shellOutput.stdout).to.contain('0 errors, 2 warnings.');
    });
});
