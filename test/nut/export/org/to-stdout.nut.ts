import { readFileSync } from 'node:fs';
import path from 'node:path';
import { expect } from 'chai';
import { org } from '../../org-session.ts';
import { exportIsland } from './helpers.ts';
import type { PsExportResult } from '../../../../src/commands/ps/export.js';

describe('ps export to stdout', () => {
    it('writes the document to stdout when --output-file is omitted', () => {
        const result = exportIsland('', 0);

        expect(result.shellOutput.stdout).to.contain('PS_Nut_Zeta');
    });

    it('keeps stdout free of the summary line when it carries the document', () => {
        const result = exportIsland('', 0);

        expect(result.shellOutput.stdout).to.not.contain('assignment(s) exported');
    });

    it('emits the same document to stdout as it writes to a file', () => {
        const exported = path.join(org.getDir(), 'both.yml');
        const toStdout = exportIsland('', 0);

        exportIsland(`--output-file ${exported}`, 0);

        expect(toStdout.shellOutput.stdout.trim()).to.equal(readFileSync(exported, 'utf8').trim());
    });

    it('returns the document in the --json envelope with a null outputFile', () => {
        const result = exportIsland('--json', 0);
        const payload = result.jsonOutput?.result;

        expect(payload?.outputFile).to.equal(null);
        expect(payload?.content).to.contain('PS_Nut_Zeta');
    });

    it('matches a requested --user whose case differs from the org', () => {
        const island = org.getIslandUser();
        const result = org.runPs<PsExportResult>(`export --user ${island.toUpperCase()} --json`, 0);

        expect(result.jsonOutput?.result.users).to.equal(1);
    });

    it('warns and continues when a requested --user matches nothing', () => {
        const result = org.runPs<PsExportResult>('export --user nobody@nut.invalid --json', 0);

        expect(result.jsonOutput?.result.unmatchedUsers).to.deep.equal(['nobody@nut.invalid']);
    });
});
