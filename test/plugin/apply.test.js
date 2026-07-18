import { describe, it, expect } from 'vitest';
import { writeFile, readFile, mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { parse, stringify } from 'yaml';
import { runPs, parseJson, targetOrg } from '../helpers/run-plugin.js';

const valid = 'test/fixtures/valid.yml';
const schemaError = 'test/fixtures/schema-error.yml';
const malformed = 'test/fixtures/malformed.yml';
// A target org that resolves nowhere, so these fail identically on any machine
// without touching the network or a developer's default org.
const noOrg = 'no-such-org-alias-xyz';

// A fresh temp dir per test, so the concurrent cases never collide. The OS reclaims it.
async function tempDir() {
    return mkdtemp(path.join(tmpdir(), 'ps-apply-'));
}

describe('sf ps apply', () => {
    it('rejects an invalid --mode value', async () => {
        const { exitCode } = await runPs(['ps', 'apply', '-f', valid, '--target-org', noOrg, '--mode', 'bogus']);

        expect(exitCode).not.toBe(0);
    });

    it('rejects a negative --max-deletes', async () => {
        const { exitCode } = await runPs(['ps', 'apply', '-f', valid, '--target-org', noOrg, '--max-deletes=-1']);

        expect(exitCode).not.toBe(0);
    });

    it('requires --file', async () => {
        const { exitCode } = await runPs(['ps', 'apply', '--target-org', noOrg]);

        expect(exitCode).not.toBe(0);
    });

    it('--help documents its flags', async () => {
        const { stdout, exitCode } = await runPs(['ps', 'apply', '--help']);

        expect(exitCode).toBe(0);
        expect(stdout).toContain('--mode');
        expect(stdout).toContain('--file');
    });

    // Real-org round-trips. Applying an org's own export is an empty diff, so --dry-run and a
    // real apply both leave the org untouched. The guard cases abort before any DML, so they too
    // leave the org untouched.
    it('applies an org export as a no-op round-trip (dry-run)', async ({ expect }) => {
        const dir = await tempDir();
        const snapshot = path.join(dir, 'snap.yml');

        const exported = await runPs(['ps', 'export', '--target-org', targetOrg, '--output-file', snapshot]);
        expect(exported.exitCode).toBe(0);

        const applied = await runPs([
            'ps',
            'apply',
            '--target-org',
            targetOrg,
            '-f',
            snapshot,
            '--mode',
            'sync',
            '--dry-run',
            '--json',
        ]);
        expect(applied.exitCode).toBe(0);
        const result = parseJson(applied.stdout);
        expect(result.status).toBe('dry-run');
        expect(result.added + result.updated + result.removed).toBe(0);
    });

    it('applies an org export as a no-op round-trip (real apply, no --dry-run)', async ({ expect }) => {
        const dir = await tempDir();
        const snapshot = path.join(dir, 'snap.yml');

        const exported = await runPs(['ps', 'export', '--target-org', targetOrg, '--output-file', snapshot]);
        expect(exported.exitCode).toBe(0);

        const applied = await runPs([
            'ps',
            'apply',
            '--target-org',
            targetOrg,
            '-f',
            snapshot,
            '--mode',
            'sync',
            '--json',
        ]);
        expect(applied.exitCode).toBe(0);
        const result = parseJson(applied.stdout);
        expect(result.status).toBe('applied');
        expect(result.added + result.updated + result.removed).toBe(0);
        expect(result.failures).toBe(0);
    });

    // Removals require confirmation, and a non-interactive --json run cannot prompt: it must
    // refuse instead. Drop a user from the org's own export so sync wants to remove that user's
    // assignments, reaching the confirmation gate and erroring there, before any DML.
    it('refuses to delete without --no-prompt when --json is enabled', async ({ expect }) => {
        const dir = await tempDir();
        const snapshot = path.join(dir, 'snap.yml');

        const exported = await runPs(['ps', 'export', '--target-org', targetOrg, '--output-file', snapshot]);
        expect(exported.exitCode).toBe(0);

        const doc = parse(await readFile(snapshot, 'utf8'));
        const users = Object.keys(doc.users ?? {});
        expect(users.length).toBeGreaterThan(0);
        delete doc.users[users[0]];
        await writeFile(snapshot, stringify(doc), 'utf8');

        const { exitCode, stdout } = await runPs([
            'ps',
            'apply',
            '--target-org',
            targetOrg,
            '-f',
            snapshot,
            '--mode',
            'sync',
            '--max-deletes',
            '100000',
            '--json',
        ]);

        expect(exitCode).not.toBe(0);
        expect(stdout).toContain('without confirmation');
    });

    // Load errors abort before any org call or DML, so the org just needs to resolve.
    it('fails a schema violation with exit 1', async ({ expect }) => {
        const { stdout, exitCode } = await runPs(['ps', 'apply', '--target-org', targetOrg, '-f', schemaError, '--dry-run']);

        expect(exitCode).toBe(1);
        expect(stdout).toContain('error:');
    });

    it('fails malformed YAML with exit 1', async ({ expect }) => {
        const { stdout, exitCode } = await runPs(['ps', 'apply', '--target-org', targetOrg, '-f', malformed, '--dry-run']);

        expect(exitCode).toBe(1);
        expect(stdout).toContain('error:');
    });
});
