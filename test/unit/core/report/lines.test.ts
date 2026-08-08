import { expect } from 'chai';
import { Diff, formatDiff } from '../../../../lib/core/index.js';
import { actualAssignment, desiredAssignment } from '../../builders.ts';
import { grant, sync } from './helpers.ts';

describe('formatDiff lines', () => {
    it('heads a section with the kind, spelled for a reader', () => {
        const add = desiredAssignment({
            assignee: 'alice@example.com',
            kind: 'permissionSetGroup',
            target: 'PSG_Onboarding',
        });
        const diff = new Diff([add], [], [], []);

        expect(formatDiff(diff, sync)[0]).to.equal('Permission Set Groups');
    });

    it('marks an addition with a plus', () => {
        const diff = new Diff([grant('alice@example.com', 'PS_Alpha')], [], [], []);

        expect(formatDiff(diff, sync)).to.deep.equal([
            'Permission Sets',
            '  PS_Alpha',
            '    + alice@example.com',
        ]);
    });

    it('marks a removal with a minus', () => {
        const remove = actualAssignment('0Pa000000000001AAA', {
            assignee: 'alice@example.com',
            kind: 'permissionSet',
            target: 'PS_Alpha',
        });
        const diff = new Diff([], [], [remove], []);

        expect(formatDiff(diff, sync)[2]).to.equal('    - alice@example.com');
    });

    it('renders nothing at all for an empty diff', () => {
        expect(formatDiff(Diff.empty(), sync)).to.deep.equal([]);
    });
});
