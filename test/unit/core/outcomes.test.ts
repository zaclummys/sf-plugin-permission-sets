import { expect } from 'chai';
import { Outcomes } from '../../../lib/core/index.js';
import { accepted, rejected } from '../builders.ts';

const mixed = Outcomes.of([
    accepted('add'),
    accepted('add'),
    accepted('update'),
    accepted('remove'),
    rejected('add'),
]);

describe('Outcomes', () => {
    it('counts nothing for a run that never reached the DML', () => {
        const outcomes = Outcomes.empty();

        expect(outcomes.added()).to.equal(0);
    });

    it('counts the additions the org accepted', () => {
        expect(mixed.added()).to.equal(2);
    });

    it('counts the updates the org accepted', () => {
        expect(mixed.updated()).to.equal(1);
    });

    it('counts the removals the org accepted', () => {
        expect(mixed.removed()).to.equal(1);
    });

    it('lists every record the org rejected', () => {
        expect(mixed.failures()).to.deep.equal([rejected('add')]);
    });

    it('answers that the org rejected something', () => {
        expect(mixed.hasFailures()).to.equal(true);
    });

    it('answers that nothing was rejected when everything landed', () => {
        const outcomes = Outcomes.of([accepted('add')]);

        expect(outcomes.hasFailures()).to.equal(false);
    });
});
