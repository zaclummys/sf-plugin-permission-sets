import { readFileSync } from 'node:fs';
import path from 'node:path';
import { expect } from 'chai';
import { parse } from 'yaml';
import { ps } from '../../run.ts';
import { canonicalExpiration, org } from '../../org-session.ts';
import { exportIsland } from './helpers.ts';

describe('ps export to a file', () => {
    it('returns the exported counts in the --json envelope', () => {
        const result = exportIsland('--json', 0);

        expect(result.jsonOutput?.result).to.deep.include({
            users: 1,
            assignments: 2,
        });
    });

    it('writes a user-keyed document to --output-file', () => {
        const exported = path.join(org.dir(), 'keyed.yml');

        exportIsland(`--output-file ${exported}`, 0);

        const document = parse(readFileSync(exported, 'utf8')) as { users: Record<string, unknown> };

        expect(Object.keys(document.users)).to.deep.equal([org.islandUser()]);
    });

    it('reports the file it wrote in --json', () => {
        const exported = path.join(org.dir(), 'exported-json.yml');
        const result = exportIsland(`--output-file ${exported} --json`, 0);

        expect(result.jsonOutput?.result.outputFile).to.equal(exported);
    });

    it('writes a document that ps check accepts', () => {
        const exported = path.join(org.dir(), 'exported.yml');

        exportIsland(`--output-file ${exported}`, 0);

        // The one command with no --target-org, so it goes through ps rather than org.ps.
        const checked = ps(`check --file ${exported}`, 0);

        expect(checked.shellOutput.stdout).to.contain('0 errors');
    });

    it('writes an org expiration in canonical ISO form', () => {
        const exported = path.join(org.dir(), 'expiring.yml');

        exportIsland(`--output-file ${exported}`, 0);

        expect(readFileSync(exported, 'utf8')).to.contain(canonicalExpiration);
    });

    it('scopes the document to the requested --kind only', () => {
        const exported = path.join(org.dir(), 'kinded.yml');

        exportIsland(`--kind permissionSetLicenses --output-file ${exported}`, 0);

        expect(readFileSync(exported, 'utf8')).to.not.contain('PS_Nut_Zeta');
    });
});
