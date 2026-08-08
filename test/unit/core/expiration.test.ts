import { assert, expect } from 'chai';
import { Expiration } from '../../../lib/core/index.js';

describe('Expiration', () => {
    it('renders the canonical UTC form', () => {
        const expiration = Expiration.of('2027-12-31T23:59:59Z');

        expect(expiration.toString()).to.equal('2027-12-31T23:59:59Z');
    });

    it('renders an offset spelling as the same instant in UTC', () => {
        const expiration = Expiration.of('2027-12-31T20:59:59-03:00');

        expect(expiration.toString()).to.equal('2027-12-31T23:59:59Z');
    });

    it('drops the sub-second precision the platform does not store', () => {
        const expiration = Expiration.of('2027-12-31T23:59:59.789Z');

        expect(expiration.toString()).to.equal('2027-12-31T23:59:59Z');
    });

    it('keeps a --json payload a plain string', () => {
        const expiration = Expiration.of('2027-12-31T23:59:59Z');

        expect(JSON.stringify({ expiration })).to.equal('{"expiration":"2027-12-31T23:59:59Z"}');
    });

    it('treats two spellings of one instant as equal', () => {
        const left = Expiration.of('2027-12-31T23:59:59Z');
        const right = Expiration.of('2027-12-31T20:59:59-03:00');

        expect(left.equals(right)).to.equal(true);
    });

    it('treats two different instants as unequal', () => {
        const left = Expiration.of('2027-12-31T23:59:59Z');
        const right = Expiration.of('2028-01-01T00:00:00Z');

        expect(left.equals(right)).to.equal(false);
    });

    it('treats two absent expirations as the same', () => {
        expect(Expiration.same(null, null)).to.equal(true);
    });

    it('treats an absent expiration and a present one as different', () => {
        const present = Expiration.of('2027-12-31T23:59:59Z');

        expect(Expiration.same(null, present)).to.equal(false);
    });

    it('treats a present expiration and an absent one as different', () => {
        const present = Expiration.of('2027-12-31T23:59:59Z');

        expect(Expiration.same(present, null)).to.equal(false);
    });

    it('compares two present expirations by instant', () => {
        const left = Expiration.of('2027-12-31T23:59:59Z');
        const right = Expiration.of('2027-12-31T23:59:59.400Z');

        expect(Expiration.same(left, right)).to.equal(true);
    });

    it('rejects anything that does not name an instant', () => {
        assert.throws(() => Expiration.of('not a date'), 'Not a datetime: not a date');
    });
});
