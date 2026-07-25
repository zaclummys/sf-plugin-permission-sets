import { describe, it } from 'vitest';
import { runPs, parseJson } from '../helpers/run-plugin.js';

const valid = 'test/fixtures/valid.yml';
const warnings = 'test/fixtures/warnings.yml';
const schemaError = 'test/fixtures/schema-error.yml';
const malformed = 'test/fixtures/malformed.yml';

describe('sf ps check', () => {
    it('passes a valid file with exit 0', async ({ expect }) => {
        const { stdout, exitCode } = await runPs(['ps', 'check', '-f', valid]);

        expect(exitCode).toBe(0);
        expect(stdout).toContain('0 errors, 0 warnings.');
    });

    it('reports warnings but exits 0', async ({ expect }) => {
        const { stdout, exitCode } = await runPs(['ps', 'check', '-f', warnings]);

        expect(exitCode).toBe(0);
        expect(stdout).toContain('0 errors, 2 warnings.');
    });

    it('names the duplicate target it warns about', async ({ expect }) => {
        const { stdout, exitCode } = await runPs(['ps', 'check', '-f', warnings]);

        expect(exitCode).toBe(0);
        expect(stdout).toContain('warning:');
        expect(stdout).toContain('listed twice under permissionSets');
    });

    it('names the empty scope list it warns about', async ({ expect }) => {
        const { stdout, exitCode } = await runPs(['ps', 'check', '-f', warnings]);

        expect(exitCode).toBe(0);
        expect(stdout).toContain('permissionSetGroups is empty');
    });

    it('turns warnings into a failure under --strict', async ({ expect }) => {
        const { stdout, stderr, exitCode } = await runPs(['ps', 'check', '-f', warnings, '--strict']);

        expect(exitCode).toBe(1);
        expect(stdout).toContain('0 errors, 2 warnings.');
        expect(stderr).toContain('Check found problems');
    });

    it('leaves a clean file passing under --strict', async ({ expect }) => {
        const { stdout, exitCode } = await runPs(['ps', 'check', '-f', valid, '--strict']);

        expect(exitCode).toBe(0);
        expect(stdout).toContain('0 errors, 0 warnings.');
    });

    it('fails a schema violation with exit 1', async ({ expect }) => {
        const { stdout, stderr, exitCode } = await runPs(['ps', 'check', '-f', schemaError]);

        expect(exitCode).toBe(1);
        expect(stdout).toContain('error:');
        expect(stderr).toContain('Check found problems');
    });

    it('fails malformed YAML with exit 1', async ({ expect }) => {
        const { stdout, exitCode } = await runPs(['ps', 'check', '-f', malformed]);

        expect(exitCode).toBe(1);
        expect(stdout).toContain('error:');
    });

    it('errors when no file matches the glob', async ({ expect }) => {
        const { stdout, exitCode } = await runPs(['ps', 'check', '-f', 'test/fixtures/nope/*.yml']);

        expect(exitCode).toBe(1);
        expect(stdout).toContain('no files matched');
    });

    it('aggregates findings across multiple -f files', async ({ expect }) => {
        const { stdout, exitCode } = await runPs(['ps', 'check', '-f', valid, '-f', warnings]);

        expect(exitCode).toBe(0);
        expect(stdout).toContain('0 errors, 2 warnings.');
    });

    it('emits a valid --json envelope on success', async ({ expect }) => {
        const { stdout, exitCode } = await runPs(['ps', 'check', '-f', warnings, '--json']);

        expect(exitCode).toBe(0);
        const result = parseJson(stdout);
        expect(result.files).toBe(1);
        expect(result.users).toBe(1);
        expect(result.findings).toHaveLength(2);
    });

    it('keeps stdout pure JSON when --json is passed', async ({ expect }) => {
        const { stdout, exitCode } = await runPs(['ps', 'check', '-f', warnings, '--json']);

        expect(exitCode).toBe(0);
        expect(stdout).not.toContain('warning:');
    });

    it('exits 1 but still emits valid --json on failure', async ({ expect }) => {
        const { stdout, exitCode } = await runPs(['ps', 'check', '-f', schemaError, '--json']);

        expect(exitCode).toBe(1);
        const result = parseJson(stdout);
        expect(result.findings.some((finding) => finding.code === 'SCHEMA')).toBe(true);
    });

    it('rejects a missing required --file flag', async ({ expect }) => {
        const { stderr, exitCode } = await runPs(['ps', 'check']);

        expect(exitCode).toBe(2);
        expect(stderr).toContain('Missing required flag file');
    });

    it('--help documents its flags', async ({ expect }) => {
        const { stdout, exitCode } = await runPs(['ps', 'check', '--help']);

        expect(exitCode).toBe(0);
        expect(stdout).toContain('--file');
        expect(stdout).toContain('--strict');
    });
});
