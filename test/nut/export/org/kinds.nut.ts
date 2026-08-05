import { expect } from 'chai';
import { org } from '../../org-session.ts';
import { exportIsland } from './helpers.ts';
import type { PsExportResult } from '../../../../src/commands/ps/export.js';

describe('ps export scoped to one kind', () => {
    it('exports the permission sets the user holds when scoped to that kind', () => {
        const result = exportIsland('--kind permissionSets --json', 0);

        expect(result.jsonOutput?.result.assignments).to.equal(2);
    });

    it('exports nothing when scoped to a kind the user holds none of', () => {
        const result = exportIsland('--kind permissionSetGroups --json', 0);

        expect(result.jsonOutput?.result.assignments).to.equal(0);
    });

    it('reports the user as unmatched when the kind leaves them with nothing', () => {
        const result = exportIsland('--kind permissionSetGroups --json', 0);

        expect(result.jsonOutput?.result.unmatchedUsers).to.deep.equal([org.getIslandUser()]);
    });

    it('exports the permission set licence a user holds', () => {
        const result = org.runPs<PsExportResult>(
            `export --user ${org.getWriteUser()} --kind permissionSetLicenses --json`,
            0,
        );

        expect(result.jsonOutput?.result.assignments).to.equal(1);
    });

    it('names the licence it exported in the document', () => {
        const result = org.runPs<PsExportResult>(
            `export --user ${org.getWriteUser()} --kind permissionSetLicenses --json`,
            0,
        );

        expect(result.jsonOutput?.result.content).to.contain(org.getWriteLicense());
    });
});
