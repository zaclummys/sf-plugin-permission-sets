import { expect } from 'chai';
import { diffAssignments } from '../../../lib/core/index.js';
import { actualAssignment, desiredAssignment } from '../builders.ts';

const alphaForAlice = desiredAssignment({
    assignee: 'alice@example.com',
    kind: 'permissionSet',
    target: 'PS_Alpha',
});

const alphaExpiring = desiredAssignment({
    assignee: 'alice@example.com',
    kind: 'permissionSet',
    target: 'PS_Alpha',
    expiration: '2027-12-31T23:59:59Z',
});

const heldAlpha = actualAssignment('0Pa000000000001AAA', {
    assignee: 'alice@example.com',
    kind: 'permissionSet',
    target: 'PS_Alpha',
});

describe('diffAssignments', () => {
    it('adds a declared assignment the org does not hold', () => {
        const diff = diffAssignments([alphaForAlice], []);

        expect(diff.toAdd).to.deep.equal([alphaForAlice]);
    });

    it('leaves an assignment the org already holds unchanged', () => {
        const diff = diffAssignments([alphaForAlice], [heldAlpha]);

        expect(diff.unchanged).to.deep.equal([heldAlpha]);
    });

    it('updates an assignment whose expiration differs from the org', () => {
        const diff = diffAssignments([alphaExpiring], [heldAlpha]);

        expect(diff.toUpdate[0].previousExpiration).to.equal(null);
    });

    it('carries the record id an update has to be applied against', () => {
        const diff = diffAssignments([alphaExpiring], [heldAlpha]);

        expect(diff.toUpdate[0].recordId).to.equal('0Pa000000000001AAA');
    });

    it('removes an assignment no file declares', () => {
        const diff = diffAssignments([], [heldAlpha]);

        expect(diff.toRemove).to.deep.equal([heldAlpha]);
    });

    it('counts a declared assignment once when it is handed in twice', () => {
        const diff = diffAssignments([
            alphaForAlice,
            alphaForAlice,
        ], []);

        expect(diff.toAdd.length).to.equal(1);
    });

    it('matches the org however the file spelled the case', () => {
        const shouted = desiredAssignment({
            assignee: 'ALICE@EXAMPLE.COM',
            kind: 'permissionSet',
            target: 'ps_alpha',
        });
        const diff = diffAssignments([shouted], [heldAlpha]);

        expect(diff.changeCount()).to.equal(0);
    });
});
