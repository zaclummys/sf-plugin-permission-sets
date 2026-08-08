import { expect } from 'chai';
import { Diff } from '../../../lib/core/index.js';
import { actualAssignment, assignmentUpdate, desiredAssignment } from '../builders.ts';

const addForAlice = desiredAssignment({
    assignee: 'alice@example.com',
    kind: 'permissionSet',
    target: 'PS_Alpha',
});

const updateForBob = assignmentUpdate('0Pa000000000001AAA', {
    assignee: 'bob@example.com',
    kind: 'permissionSet',
    target: 'PS_Beta',
    expiration: '2027-12-31T23:59:59Z',
});

const removeForAlice = actualAssignment('0Pa000000000002AAA', {
    assignee: 'alice@example.com',
    kind: 'permissionSet',
    target: 'PS_Gamma',
});

const diff = new Diff([addForAlice], [updateForBob], [removeForAlice], []);

describe('Diff scoped to a mode', () => {
    it('counts every change whatever the mode would act on', () => {
        expect(diff.changeCount()).to.equal(3);
    });

    it('reports an empty diff as no change at all', () => {
        const empty = Diff.empty();

        expect(empty.changeCount()).to.equal(0);
    });

    it('acts on adds and updates in additive mode', () => {
        const scoped = diff.scopeTo('additive');

        expect(scoped.count()).to.equal(2);
    });

    it('leaves the removals as drift in additive mode', () => {
        const scoped = diff.scopeTo('additive');

        expect(scoped.drift).to.deep.equal({
            adds: 0,
            updates: 0,
            removes: 1,
        });
    });

    it('acts on removals alone in destructive mode', () => {
        const scoped = diff.scopeTo('destructive');

        expect(scoped.count()).to.equal(1);
    });

    it('leaves the adds and updates as drift in destructive mode', () => {
        const scoped = diff.scopeTo('destructive');

        expect(scoped.drift).to.deep.equal({
            adds: 1,
            updates: 1,
            removes: 0,
        });
    });

    it('acts on everything in sync mode', () => {
        const scoped = diff.scopeTo('sync');

        expect(scoped.count()).to.equal(3);
    });

    it('counts the distinct users a mode would touch', () => {
        const scoped = diff.scopeTo('sync');

        expect(scoped.usersAffected()).to.equal(2);
    });

    it('counts one user twice over as one', () => {
        const scoped = diff.scopeTo('destructive');

        expect(scoped.usersAffected()).to.equal(1);
    });
});
