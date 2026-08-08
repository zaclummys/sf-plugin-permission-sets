import { expect } from 'chai';
import { Findings, noFilesError } from '../../../lib/core/index.js';

const oneError = Findings.of([noFilesError(['nowhere/*.yml'])]);

describe('Findings', () => {
    it('reports nothing for an empty set', () => {
        const findings = Findings.empty();

        expect(findings.toJSON()).to.deep.equal([]);
    });

    it('counts the errors', () => {
        expect(oneError.errors()).to.equal(1);
    });

    it('counts the warnings apart from the errors', () => {
        expect(oneError.warnings()).to.equal(0);
    });

    it('reports an error as fatal whatever the mode', () => {
        expect(oneError.blocks(false)).to.equal(true);
    });

    it('reports nothing as fatal for an empty set under strict', () => {
        const findings = Findings.empty();

        expect(findings.blocks(true)).to.equal(false);
    });

    it('answers that it has errors', () => {
        expect(oneError.hasErrors()).to.equal(true);
    });

    it('answers that it has no warnings', () => {
        expect(oneError.hasWarnings()).to.equal(false);
    });

    it('keeps both sets in order when merged', () => {
        const merged = Findings.empty().concat(oneError);

        expect(merged.errors()).to.equal(1);
    });

    it('renders an org-side finding with no location', () => {
        expect(oneError.format()).to.deep.equal(['error: no files matched: nowhere/*.yml']);
    });
});
