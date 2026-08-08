import { expect } from 'chai';
import { Diff, formatDiff } from '../../../../lib/core/index.js';
import { assignmentUpdate } from '../../builders.ts';
import { grant, sync } from './helpers.ts';

function updateFor(expiration: string, previousExpiration?: string) {
    return assignmentUpdate('0Pa000000000001AAA', {
        assignee: 'alice@example.com',
        kind: 'permissionSet',
        target: 'PS_Alpha',
        expiration,
        previousExpiration,
    });
}

describe('formatDiff expirations', () => {
    it('suffixes an addition that expires with the instant it expires at', () => {
        const expiring = grant('alice@example.com', 'PS_Alpha', '2027-12-31T23:59:59Z');
        const diff = new Diff([expiring], [], [], []);

        expect(formatDiff(diff, sync)[2]).to.equal('    + alice@example.com   expires 2027-12-31T23:59:59Z');
    });

    it('marks an expiration change with a tilde and both sides of the transition', () => {
        const diff = new Diff([], [updateFor('2028-01-01T00:00:00Z', '2027-12-31T23:59:59Z')], [], []);

        expect(formatDiff(diff, sync)[2]).to.equal(
            '    ~ alice@example.com   expires 2027-12-31T23:59:59Z → 2028-01-01T00:00:00Z',
        );
    });

    it('writes never for the side of a transition that has no expiration', () => {
        const diff = new Diff([], [updateFor('2028-01-01T00:00:00Z')], [], []);

        expect(formatDiff(diff, sync)[2]).to.equal('    ~ alice@example.com   expires never → 2028-01-01T00:00:00Z');
    });

    it('shows an unchanged grant with the expiration the org has on it', () => {
        const expiring = grant('alice@example.com', 'PS_Alpha', '2027-12-31T23:59:59Z');
        const diff = new Diff([], [], [], [
            {
                recordId: '0Pa000000000001AAA',
                ...expiring,
            },
        ]);
        const lines = formatDiff(diff, {
            mode: 'sync',
            showUnchanged: true,
        });

        expect(lines[2]).to.equal('    = alice@example.com   expires 2027-12-31T23:59:59Z');
    });
});
