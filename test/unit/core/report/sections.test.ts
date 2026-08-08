import { expect } from 'chai';
import { Diff, formatDiff } from '../../../../lib/core/index.js';
import { desiredAssignment } from '../../builders.ts';
import { sync } from './helpers.ts';

const everyKind = new Diff([
    desiredAssignment({
        assignee: 'alice@example.com',
        kind: 'permissionSetLicense',
        target: 'PSL_Sales',
    }),
    desiredAssignment({
        assignee: 'alice@example.com',
        kind: 'permissionSet',
        target: 'PS_Alpha',
    }),
    desiredAssignment({
        assignee: 'alice@example.com',
        kind: 'permissionSetGroup',
        target: 'PSG_Onboarding',
    }),
], [], [], []);

describe('formatDiff sections', () => {
    it('orders the kinds the way a file declares them', () => {
        const headings = formatDiff(everyKind, sync).filter((line) => !line.startsWith(' '));

        expect(headings).to.deep.equal([
            'Permission Sets',
            'Permission Set Groups',
            'Permission Set Licenses',
        ]);
    });

    it('heads every kind the diff touches', () => {
        const headings = formatDiff(everyKind, sync).filter((line) => !line.startsWith(' '));

        expect(headings.length).to.equal(3);
    });
});
