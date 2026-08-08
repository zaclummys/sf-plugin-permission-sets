import { expect } from 'chai';
import { Diff, formatDiff } from '../../../../lib/core/index.js';
import { actualAssignment } from '../../builders.ts';
import { grant, sync } from './helpers.ts';

function removalFor(recordId: string, assignee: string) {
    return actualAssignment(recordId, {
        assignee,
        kind: 'permissionSet',
        target: 'PS_Alpha',
    });
}

describe('formatDiff ordering', () => {
    it('orders the assignees under one target', () => {
        const diff = new Diff([
            grant('carol@example.com', 'PS_Alpha'),
            grant('alice@example.com', 'PS_Alpha'),
            grant('bob@example.com', 'PS_Alpha'),
        ], [], [], []);

        expect(formatDiff(diff, sync).slice(2)).to.deep.equal([
            '    + alice@example.com',
            '    + bob@example.com',
            '    + carol@example.com',
        ]);
    });

    it('leaves assignees already in order where they are', () => {
        const diff = new Diff([
            grant('alice@example.com', 'PS_Alpha'),
            grant('bob@example.com', 'PS_Alpha'),
        ], [], [], []);

        expect(formatDiff(diff, sync).slice(2)).to.deep.equal([
            '    + alice@example.com',
            '    + bob@example.com',
        ]);
    });

    it('orders the removals under one target', () => {
        const diff = new Diff([], [], [
            removalFor('0Pa000000000002AAA', 'carol@example.com'),
            removalFor('0Pa000000000001AAA', 'alice@example.com'),
        ], []);

        expect(formatDiff(diff, sync).slice(2)).to.deep.equal([
            '    - alice@example.com',
            '    - carol@example.com',
        ]);
    });

    it('orders the targets under one kind', () => {
        const diff = new Diff([
            grant('alice@example.com', 'PS_Gamma'),
            grant('alice@example.com', 'PS_Alpha'),
        ], [], [], []);

        const headings = formatDiff(diff, sync).filter((line) => line.startsWith('  PS_'));

        expect(headings).to.deep.equal([
            '  PS_Alpha',
            '  PS_Gamma',
        ]);
    });
});
