import { expect } from 'chai';
import { serializeAssignments } from '../../../../lib/core/index.js';
import { grant } from './helpers.ts';

describe('serializeAssignments ordering', () => {
    it('orders users the file listed out of order', () => {
        const document = serializeAssignments([
            grant('carol@example.com', 'PS_Alpha'),
            grant('alice@example.com', 'PS_Alpha'),
        ]);

        expect(document.indexOf('alice')).to.be.lessThan(document.indexOf('carol'));
    });

    it('leaves users already in order where they are', () => {
        const document = serializeAssignments([
            grant('alice@example.com', 'PS_Alpha'),
            grant('carol@example.com', 'PS_Alpha'),
        ]);

        expect(document.indexOf('alice')).to.be.lessThan(document.indexOf('carol'));
    });

    it('orders the targets under one user', () => {
        const document = serializeAssignments([
            grant('alice@example.com', 'PS_Gamma'),
            grant('alice@example.com', 'PS_Alpha'),
        ]);

        expect(document.indexOf('PS_Alpha')).to.be.lessThan(document.indexOf('PS_Gamma'));
    });

    it('leaves targets already in order where they are', () => {
        const document = serializeAssignments([
            grant('alice@example.com', 'PS_Alpha'),
            grant('alice@example.com', 'PS_Gamma'),
        ]);

        expect(document.indexOf('PS_Alpha')).to.be.lessThan(document.indexOf('PS_Gamma'));
    });
});
