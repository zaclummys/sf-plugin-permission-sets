import { expect } from 'chai';
import { colourDiff, colourFindings } from '../../../lib/ui/index.js';

/**
 * The colour itself belongs to `test/nut/check/colour.nut.ts`, which spawns the CLI with a
 * TTY. This suite runs under NO_COLOR, where `ux.colorize` is the identity, so what it pins
 * is the property every NUT assertion rests on: painting a line never alters its text.
 */
describe('colourDiff', () => {
    it('leaves the text of an addition untouched', () => {
        expect(colourDiff(['    + alice@example.com'])).to.deep.equal(['    + alice@example.com']);
    });

    it('leaves the text of an expiration update untouched', () => {
        const line = '    ~ alice@example.com   expires never → 2027-12-31T23:59:59Z';

        expect(colourDiff([line])).to.deep.equal([line]);
    });

    it('leaves the text of a removal untouched', () => {
        expect(colourDiff(['    - alice@example.com'])).to.deep.equal(['    - alice@example.com']);
    });

    it('leaves the text of an unchanged line untouched', () => {
        expect(colourDiff(['    = alice@example.com'])).to.deep.equal(['    = alice@example.com']);
    });

    it('passes a heading through, since it carries no marker', () => {
        expect(colourDiff(['Permission Sets'])).to.deep.equal(['Permission Sets']);
    });

    it('passes an empty body through', () => {
        expect(colourDiff([])).to.deep.equal([]);
    });
});

describe('colourFindings', () => {
    it('leaves the text of an error line untouched', () => {
        const line = 'error: PS_Alpha: permission set not found in org';

        expect(colourFindings([line])).to.deep.equal([line]);
    });

    it('leaves the text of a warning line untouched', () => {
        expect(colourFindings(['warning: file is empty'])).to.deep.equal(['warning: file is empty']);
    });

    it('passes a line whose first word is not a level through', () => {
        expect(colourFindings(['note: something else'])).to.deep.equal(['note: something else']);
    });

    it('passes a line with no colon through, rather than inventing one', () => {
        expect(colourFindings(['errorX with no separator'])).to.deep.equal(['errorX with no separator']);
    });
});
