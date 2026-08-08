import { expect } from 'chai';
import { serializeAssignments } from '../../../../lib/core/index.js';
import { jobFileText } from '../../job-file.ts';
import { grant } from './helpers.ts';

describe('serializeAssignments entries', () => {
    it('emits an empty users block when there is nothing to write', () => {
        expect(serializeAssignments([])).to.equal('users: {}\n');
    });

    it('writes a bare name for a grant that does not expire', async () => {
        const document = serializeAssignments([grant('alice@example.com', 'PS_Alpha')]);

        expect(document).to.equal(await jobFileText('one-assignment.yml'));
    });

    it('writes the object form for a grant that expires', async () => {
        const expiring = grant('alice@example.com', 'PS_Alpha', '2027-12-31T23:59:59Z');
        const document = serializeAssignments([expiring]);

        expect(document).to.equal(await jobFileText('expiring.yml'));
    });

    it('omits a scope the user holds nothing under', () => {
        const document = serializeAssignments([grant('alice@example.com', 'PS_Alpha')]);

        expect(document).to.not.contain('permissionSetLicenses');
    });

    it('writes one entry for a target handed in twice', () => {
        const alpha = grant('alice@example.com', 'PS_Alpha');
        const document = serializeAssignments([
            alpha,
            alpha,
        ]);

        expect(document.split('PS_Alpha').length - 1).to.equal(1);
    });
});
