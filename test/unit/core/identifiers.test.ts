import { expect } from 'chai';
import { TargetName, Username, kindForScopeKey, kinds } from '../../../lib/core/index.js';

describe('Username', () => {
    it('compares without regard to case, the way an org does', () => {
        const shouted = Username.of('ALICE@EXAMPLE.COM');

        expect(shouted.asKey()).to.equal('alice@example.com');
    });

    it('keeps the text as it was written, for display', () => {
        const written = Username.of('Alice@Example.com');

        expect(written.toString()).to.equal('Alice@Example.com');
    });

    it('treats two spellings of one user as equal', () => {
        const left = Username.of('Alice@Example.com');
        const right = Username.of('alice@example.com');

        expect(left.equals(right)).to.equal(true);
    });

    it('keeps a --json payload the plain string it always was', () => {
        const username = Username.of('Alice@Example.com');

        expect(JSON.stringify({ username })).to.equal('{"username":"Alice@Example.com"}');
    });
});

describe('TargetName', () => {
    it('compares without regard to case, the way an org does', () => {
        const shouted = TargetName.of('PS_ALPHA');

        expect(shouted.asKey()).to.equal('ps_alpha');
    });

    it('keeps the text as it was written, for display', () => {
        const written = TargetName.of('PS_Alpha');

        expect(written.toString()).to.equal('PS_Alpha');
    });

    it('keeps a --json payload the plain string it always was', () => {
        const target = TargetName.of('PS_Alpha');

        expect(JSON.stringify({ target })).to.equal('{"target":"PS_Alpha"}');
    });
});

describe('scope keys', () => {
    it('maps the permission set scope key to its kind', () => {
        expect(kindForScopeKey('permissionSets')).to.equal('permissionSet');
    });

    it('maps the group scope key to its kind', () => {
        expect(kindForScopeKey('permissionSetGroups')).to.equal('permissionSetGroup');
    });

    it('maps the license scope key to its kind', () => {
        expect(kindForScopeKey('permissionSetLicenses')).to.equal('permissionSetLicense');
    });

    it('lists every kind in the order a file declares them', () => {
        expect(kinds).to.deep.equal([
            'permissionSet',
            'permissionSetGroup',
            'permissionSetLicense',
        ]);
    });
});
