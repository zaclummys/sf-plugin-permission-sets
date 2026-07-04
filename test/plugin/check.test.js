import { describe, it, expect } from 'vitest';
import { runPs, parseJson } from '../helpers/run-plugin.js';

const valid = 'test/fixtures/valid.yml';
const warnings = 'test/fixtures/warnings.yml';
const schemaError = 'test/fixtures/schema-error.yml';
const malformed = 'test/fixtures/malformed.yml';

describe('sf ps check', () => {
    it('passes a valid file with exit 0', async () => {
        const { stdout, exitCode } = await runPs(['ps', 'check', '-f', valid]);

        expect(exitCode).toBe(0);
        expect(stdout).toContain('0 errors, 0 warnings.');
    });

    it('reports warnings but exits 0 without --strict', async () => {
        const { stdout, exitCode } = await runPs(['ps', 'check', '-f', warnings]);

        expect(exitCode).toBe(0);
        expect(stdout).toContain('0 errors, 2 warnings.');
        expect(stdout).toContain('warning:');
        expect(stdout).toContain('listed twice under permissionSets');
        expect(stdout).toContain('permissionSetGroups is empty');
    });

    it('fails warnings with exit 1 under --strict', async () => {
        const { exitCode } = await runPs(['ps', 'check', '-f', warnings, '--strict']);

        expect(exitCode).toBe(1);
    });

    it('fails a schema violation with exit 1', async () => {
        const { stdout, stderr, exitCode } = await runPs(['ps', 'check', '-f', schemaError]);

        expect(exitCode).toBe(1);
        expect(stdout).toContain('error:');
        expect(stderr).toContain('Check found problems');
    });

    it('fails malformed YAML with exit 1', async () => {
        const { stdout, exitCode } = await runPs(['ps', 'check', '-f', malformed]);

        expect(exitCode).toBe(1);
        expect(stdout).toContain('error:');
    });

    it('errors when no file matches the glob', async () => {
        const { stdout, exitCode } = await runPs(['ps', 'check', '-f', 'test/fixtures/nope/*.yml']);

        expect(exitCode).toBe(1);
        expect(stdout).toContain('no files matched');
    });

    it('aggregates findings across multiple -f files', async () => {
        const { stdout, exitCode } = await runPs(['ps', 'check', '-f', valid, '-f', warnings]);

        expect(exitCode).toBe(0);
        expect(stdout).toContain('0 errors, 2 warnings.');
    });

    it('emits a valid --json envelope on success', async () => {
        const { stdout, exitCode } = await runPs(['ps', 'check', '-f', warnings, '--json']);

        expect(exitCode).toBe(0);
        const result = parseJson(stdout);
        expect(result.files).toBe(1);
        expect(result.users).toBe(1);
        expect(Array.isArray(result.findings)).toBe(true);
        expect(result.findings).toHaveLength(2);
    });

    it('exits 1 but still emits valid --json on failure', async () => {
        const { stdout, exitCode } = await runPs(['ps', 'check', '-f', schemaError, '--json']);

        expect(exitCode).toBe(1);
        const result = parseJson(stdout);
        expect(result.findings.some((finding) => finding.code === 'SCHEMA')).toBe(true);
    });

    it('rejects a missing required --file flag', async () => {
        const { stderr, exitCode } = await runPs(['ps', 'check']);

        expect(exitCode).not.toBe(0);
        expect(stderr.toLowerCase()).toContain('file');
    });
});
