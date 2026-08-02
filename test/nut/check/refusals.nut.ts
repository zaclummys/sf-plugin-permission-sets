import { expect } from 'chai';
import { check, malformedFile, schemaErrorFile, unmatchedGlob, validFile, warningsFile } from './helpers.ts';

describe('ps check refusals', () => {
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
});
