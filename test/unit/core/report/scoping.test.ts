import { expect } from 'chai';
import { Diff, formatDiff } from '../../../../lib/core/index.js';
import { actualAssignment, assignmentUpdate, desiredAssignment } from '../../builders.ts';

const add = desiredAssignment({
    assignee: 'alice@example.com',
    kind: 'permissionSet',
    target: 'PS_Alpha',
});

const update = assignmentUpdate('0Pa000000000001AAA', {
    assignee: 'bob@example.com',
    kind: 'permissionSet',
    target: 'PS_Alpha',
    expiration: '2028-01-01T00:00:00Z',
});

const remove = actualAssignment('0Pa000000000002AAA', {
    assignee: 'carol@example.com',
    kind: 'permissionSet',
    target: 'PS_Alpha',
});

const untouched = actualAssignment('0Pa000000000003AAA', {
    assignee: 'dave@example.com',
    kind: 'permissionSet',
    target: 'PS_Alpha',
});

const diff = new Diff([add], [update], [remove], [untouched]);

describe('formatDiff scoping', () => {
    it('hides the removals in additive mode', () => {
        const lines = formatDiff(diff, {
            mode: 'additive',
            showUnchanged: false,
        });

        expect(lines).to.not.include('    - carol@example.com');
    });

    it('shows the adds and updates in additive mode', () => {
        const lines = formatDiff(diff, {
            mode: 'additive',
            showUnchanged: false,
        });

        expect(lines.length).to.equal(4);
    });

    it('hides the adds and updates in destructive mode', () => {
        const lines = formatDiff(diff, {
            mode: 'destructive',
            showUnchanged: false,
        });

        expect(lines).to.deep.equal([
            'Permission Sets',
            '  PS_Alpha',
            '    - carol@example.com',
        ]);
    });

    it('shows every operation in sync mode', () => {
        const lines = formatDiff(diff, {
            mode: 'sync',
            showUnchanged: false,
        });

        expect(lines.length).to.equal(5);
    });

    it('omits the unchanged unless they were asked for', () => {
        const lines = formatDiff(diff, {
            mode: 'sync',
            showUnchanged: false,
        });

        expect(lines).to.not.include('    = dave@example.com');
    });

    it('marks the unchanged with an equals when they were asked for', () => {
        const lines = formatDiff(diff, {
            mode: 'sync',
            showUnchanged: true,
        });

        expect(lines).to.include('    = dave@example.com');
    });

    it('omits a kind the diff says nothing about', () => {
        const lines = formatDiff(diff, {
            mode: 'sync',
            showUnchanged: true,
        });

        expect(lines).to.not.include('Permission Set Licenses');
    });
});
