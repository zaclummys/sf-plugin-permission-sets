import { describe, it } from 'vitest';
import { parse } from 'yaml';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { runPs, parseJson, targetOrg } from '../helpers/run-plugin.js';
import { tempDir } from '../helpers/temp-dir.js';
import { declaredUser } from '../fixtures/org.js';

// A target org that resolves nowhere, so this fails identically on any machine
// without touching the network or a developer's default org.
const noOrg = 'no-such-org-alias-xyz';

/** A uniquely-named output file per test, so the concurrent cases never write over each other. */
async function tempOutputFile() {
    const dir = await tempDir('ps-export-');

    return path.join(dir, 'export.yml');
}

// Real-org tests: drive `sf ps export` against the org named by PS_TARGET_ORG, which the
// caller always provides (a local logged-in org, or one a CI step authenticates). export is
// read-only (it only queries the org), so this never changes org state.
describe('sf ps export', () => {
    it('returns the exported counts in the --json envelope', async ({ expect }) => {
        const file = await tempOutputFile();
        const { stdout, exitCode } = await runPs([
            'ps',
            'export',
            '--target-org',
            targetOrg,
            '--output-file',
            file,
            '--json',
        ]);

        expect(exitCode).toBe(0);
        const result = parseJson(stdout);
        expect(result.outputFile).toBe(file);
        expect(Number.isInteger(result.users)).toBe(true);
        // Every exported user holds at least one assignment, so assignments never trails users.
        expect(result.assignments).toBeGreaterThanOrEqual(result.users);
    });

    it('writes a user-keyed document to --output-file', async ({ expect }) => {
        const file = await tempOutputFile();
        const { stdout, exitCode } = await runPs([
            'ps',
            'export',
            '--target-org',
            targetOrg,
            '--output-file',
            file,
        ]);

        expect(exitCode).toBe(0);
        expect(stdout).toContain('Exported');
        const content = await readFile(file, 'utf8');
        const document = parse(content);
        expect(document).toHaveProperty('users');
    });

    // The whole point of export is that its output is valid input to the plugin.
    // Re-checking it without an org proves the round-trip without asserting on org data.
    it('writes a file that ps check accepts (round-trip)', async ({ expect }) => {
        const file = await tempOutputFile();
        const exported = await runPs(['ps', 'export', '--target-org', targetOrg, '--output-file', file]);
        expect(exported.exitCode).toBe(0);

        const checked = await runPs(['ps', 'check', '-f', file]);

        expect(checked.exitCode).toBe(0);
        expect(checked.stdout).toContain('0 errors');
    });

    it('scopes the file to the requested --kind only', async ({ expect }) => {
        const file = await tempOutputFile();
        const { exitCode } = await runPs([
            'ps',
            'export',
            '--target-org',
            targetOrg,
            '--output-file',
            file,
            '--kind',
            'permissionSets',
        ]);

        expect(exitCode).toBe(0);
        const content = await readFile(file, 'utf8');
        const document = parse(content);
        const entries = Object.values(document.users);
        // Guard against a vacuous pass: an org with no rows of this kind proves nothing.
        expect(entries.length).toBeGreaterThan(0);
        const declaredKinds = new Set(entries.flatMap((entry) => Object.keys(entry)));
        expect([...declaredKinds]).toEqual(['permissionSets']);
    });

    it('writes the document to stdout when --output-file is omitted', async ({ expect }) => {
        const { stdout, exitCode } = await runPs(['ps', 'export', '--target-org', targetOrg]);

        expect(exitCode).toBe(0);
        const document = parse(stdout);
        expect(document).toHaveProperty('users');
    });

    it('keeps stdout free of the summary line when it carries the document', async ({ expect }) => {
        const { stdout, exitCode } = await runPs(['ps', 'export', '--target-org', targetOrg]);

        expect(exitCode).toBe(0);
        expect(stdout).not.toContain('Exported');
    });

    it('emits the same document to stdout as it writes to a file', async ({ expect }) => {
        const file = await tempOutputFile();
        const toFile = await runPs(['ps', 'export', '--target-org', targetOrg, '--output-file', file]);
        const toStdout = await runPs(['ps', 'export', '--target-org', targetOrg]);

        expect(toFile.exitCode).toBe(0);
        expect(toStdout.exitCode).toBe(0);
        const fileContent = await readFile(file, 'utf8');
        // execa strips the trailing newline from stdout, so compare trimmed.
        expect(toStdout.stdout).toBe(fileContent.trimEnd());
    });

    it('returns the document in the --json envelope with a null outputFile', async ({ expect }) => {
        const { stdout, exitCode } = await runPs(['ps', 'export', '--target-org', targetOrg, '--json']);

        expect(exitCode).toBe(0);
        const result = parseJson(stdout);
        expect(result.outputFile).toBe(null);
        expect(result.content).toContain('users:');
    });

    it('--help documents its flags', async ({ expect }) => {
        const { stdout, exitCode } = await runPs(['ps', 'export', '--help']);

        expect(exitCode).toBe(0);
        expect(stdout).toContain('--output-file');
        expect(stdout).toContain('--kind');
        expect(stdout).toContain('--user');
    });

    it('rejects an unknown --kind value', async ({ expect }) => {
        const { stderr, exitCode } = await runPs([
            'ps',
            'export',
            '--target-org',
            noOrg,
            '--kind',
            'bogusKind',
        ]);

        expect(exitCode).toBe(1);
        expect(stderr).toContain('permissionSets, permissionSetGroups, permissionSetLicenses');
    });

    it('scopes the file to a requested --user that matches', async ({ expect }) => {
        const file = await tempOutputFile();
        const { exitCode } = await runPs([
            'ps',
            'export',
            '--target-org',
            targetOrg,
            '--output-file',
            file,
            '--user',
            declaredUser,
        ]);

        expect(exitCode).toBe(0);
        const content = await readFile(file, 'utf8');
        const scoped = parse(content);
        expect(Object.keys(scoped.users)).toEqual([declaredUser]);
    });

    it('warns and continues when a requested --user matches nothing', async ({ expect }) => {
        const file = await tempOutputFile();
        const missing = 'no-such-user@nowhere.invalid';
        const { stdout, exitCode } = await runPs([
            'ps',
            'export',
            '--target-org',
            targetOrg,
            '--output-file',
            file,
            '--user',
            missing,
            '--json',
        ]);

        expect(exitCode).toBe(0);
        const envelope = JSON.parse(stdout);
        expect(envelope.result.unmatchedUsers).toContain(missing);
        expect(envelope.result.users).toBe(0);
        expect(envelope.warnings.some((warning) => warning.includes(missing))).toBe(true);
    });
});
