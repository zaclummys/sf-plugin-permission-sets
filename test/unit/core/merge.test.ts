import { expect } from 'chai';
import { checkContent, mergeAssignments, mergeFindings } from '../../../lib/core/index.js';
import { jobFileText } from '../job-file.ts';

describe('merging checked files', () => {
    it('unions the assignments two files declare', async () => {
        const checked = [
            checkContent(await jobFileText('one-assignment.yml'), 'first.yml'),
            checkContent(await jobFileText('beta-for-bob.yml'), 'second.yml'),
        ];

        expect(mergeAssignments(checked).length).to.equal(2);
    });

    it('keeps one assignment when two files declare the same grant', async () => {
        const alpha = await jobFileText('one-assignment.yml');
        const checked = [
            checkContent(alpha, 'first.yml'),
            checkContent(alpha, 'second.yml'),
        ];

        expect(mergeAssignments(checked).length).to.equal(1);
    });

    it('folds two spellings of one grant together', async () => {
        const checked = [
            checkContent(await jobFileText('one-assignment.yml'), 'first.yml'),
            checkContent(await jobFileText('mixed-case.yml'), 'second.yml'),
        ];

        expect(mergeAssignments(checked).length).to.equal(1);
    });

    it('keeps the first spelling of a grant declared twice', async () => {
        const checked = [
            checkContent(await jobFileText('mixed-case.yml'), 'first.yml'),
            checkContent(await jobFileText('one-assignment.yml'), 'second.yml'),
        ];
        const merged = mergeAssignments(checked);

        expect(merged[0].assignee.toString()).to.equal('ALICE@EXAMPLE.COM');
    });

    it('collects the findings in the order the files were read', async () => {
        const broken = await jobFileText('malformed.yml');
        const checked = [
            checkContent(broken, 'first.yml'),
            checkContent(broken, 'second.yml'),
        ];
        const findings = mergeFindings(checked);

        expect(findings.map((finding) => finding.file)).to.deep.equal([
            'first.yml',
            'second.yml',
        ]);
    });
});
