import { describe, it } from 'vitest';
import { runPs, parseJson } from '../helpers/run-plugin.js';
import {
    validPath,
    warningsPath,
    emptyPath,
    emptyUserPath,
    schemaErrorPath,
    malformedPath,
    mixedCaseUserPath,
    mixedCaseTargetPath,
} from '../fixtures/index.js';

describe('sf ps check', () => {
    it('passes a valid file with exit 0', async ({ expect }) => {
        const {
            stdout,
            exitCode,
        } = await runPs([
            'ps',
            'check',
            '--file',
            validPath,
        ]);

        expect(exitCode).toBe(0);
        expect(stdout).toContain('0 errors, 0 warnings.');
    });

    it('reports warnings but exits 0', async ({ expect }) => {
        const {
            stdout,
            exitCode,
        } = await runPs([
            'ps',
            'check',
            '--file',
            warningsPath,
        ]);

        expect(exitCode).toBe(0);
        expect(stdout).toContain('0 errors, 2 warnings.');
    });

    it('names the duplicate target it warns about', async ({ expect }) => {
        const {
            stdout,
            exitCode,
        } = await runPs([
            'ps',
            'check',
            '--file',
            warningsPath,
        ]);

        expect(exitCode).toBe(0);
        expect(stdout).toContain('warning:');
        expect(stdout).toContain('listed twice under permissionSets');
    });

    it('warns about a file that parses to nothing', async ({ expect }) => {
        const {
            stdout,
            exitCode,
        } = await runPs([
            'ps',
            'check',
            '--file',
            emptyPath,
        ]);

        expect(exitCode).toBe(0);
        expect(stdout).toContain('file is empty');
    });

    it('warns about a user that declares no scopes', async ({ expect }) => {
        const {
            stdout,
            exitCode,
        } = await runPs([
            'ps',
            'check',
            '--file',
            emptyUserPath,
        ]);

        expect(exitCode).toBe(0);
        expect(stdout).toContain('carol@example.com: no scopes declared');
    });

    it('names the empty scope list it warns about', async ({ expect }) => {
        const {
            stdout,
            exitCode,
        } = await runPs([
            'ps',
            'check',
            '--file',
            warningsPath,
        ]);

        expect(exitCode).toBe(0);
        expect(stdout).toContain('permissionSetGroups is empty');
    });

    it('merges a user declared under two spellings that differ only in case', async ({ expect }) => {
        const {
            stdout,
            exitCode,
        } = await runPs([
            'ps',
            'check',
            '--file',
            mixedCaseUserPath,
            '--json',
        ]);

        expect(exitCode).toBe(0);
        const result = parseJson(stdout);

        expect(result.users).toBe(1);
    });

    it('dedupes an assignment declared under two spellings that differ only in case', async ({ expect }) => {
        const {
            stdout,
            exitCode,
        } = await runPs([
            'ps',
            'check',
            '--file',
            mixedCaseUserPath,
            '--json',
        ]);

        expect(exitCode).toBe(0);
        const result = parseJson(stdout);

        expect(result.assignments).toBe(1);
    });

    it('warns about a target listed twice under spellings that differ only in case', async ({ expect }) => {
        const {
            stdout,
            exitCode,
        } = await runPs([
            'ps',
            'check',
            '--file',
            mixedCaseTargetPath,
        ]);

        expect(exitCode).toBe(0);
        expect(stdout).toContain('listed twice under permissionSets');
    });

    it('turns warnings into a failure under --strict', async ({ expect }) => {
        const {
            stdout,
            stderr,
            exitCode,
        } = await runPs([
            'ps',
            'check',
            '--file',
            warningsPath,
            '--strict',
        ]);

        expect(exitCode).toBe(1);
        expect(stdout).toContain('0 errors, 2 warnings.');
        expect(stderr).toContain('Check found problems');
    });

    it('leaves a clean file passing under --strict', async ({ expect }) => {
        const {
            stdout,
            exitCode,
        } = await runPs([
            'ps',
            'check',
            '--file',
            validPath,
            '--strict',
        ]);

        expect(exitCode).toBe(0);
        expect(stdout).toContain('0 errors, 0 warnings.');
    });

    it('fails a schema violation with exit 1', async ({ expect }) => {
        const {
            stdout,
            stderr,
            exitCode,
        } = await runPs([
            'ps',
            'check',
            '--file',
            schemaErrorPath,
        ]);

        expect(exitCode).toBe(1);
        expect(stdout).toContain('error:');
        expect(stderr).toContain('Check found problems');
    });

    it('fails malformed YAML with exit 1', async ({ expect }) => {
        const {
            stdout,
            exitCode,
        } = await runPs([
            'ps',
            'check',
            '--file',
            malformedPath,
        ]);

        expect(exitCode).toBe(1);
        expect(stdout).toContain('error:');
    });

    it('errors when no file matches the glob', async ({ expect }) => {
        const {
            stdout,
            exitCode,
        } = await runPs([
            'ps',
            'check',
            '--file',
            'test/fixtures/nope/*.yml',
        ]);

        expect(exitCode).toBe(1);
        expect(stdout).toContain('no files matched');
    });

    it('aggregates findings across multiple -f files', async ({ expect }) => {
        const {
            stdout,
            exitCode,
        } = await runPs([
            'ps',
            'check',
            '--file',
            validPath,
            '--file',
            warningsPath,
        ]);

        expect(exitCode).toBe(0);
        expect(stdout).toContain('0 errors, 2 warnings.');
    });

    it('emits a valid --json envelope on success', async ({ expect }) => {
        const {
            stdout,
            exitCode,
        } = await runPs([
            'ps',
            'check',
            '--file',
            warningsPath,
            '--json',
        ]);

        expect(exitCode).toBe(0);
        const result = parseJson(stdout);

        expect(result.files).toBe(1);
        expect(result.users).toBe(1);
        expect(result.findings).toHaveLength(2);
    });

    it('keeps stdout pure JSON when --json is passed', async ({ expect }) => {
        const {
            stdout,
            exitCode,
        } = await runPs([
            'ps',
            'check',
            '--file',
            warningsPath,
            '--json',
        ]);

        expect(exitCode).toBe(0);
        expect(stdout).not.toContain('warning:');
    });

    it('exits 1 but still emits valid --json on failure', async ({ expect }) => {
        const {
            stdout,
            exitCode,
        } = await runPs([
            'ps',
            'check',
            '--file',
            schemaErrorPath,
            '--json',
        ]);

        expect(exitCode).toBe(1);
        const result = parseJson(stdout);

        expect(result.findings.some((finding) => finding.code === 'SCHEMA')).toBe(true);
    });

    it('rejects a missing required --file flag', async ({ expect }) => {
        const {
            stderr,
            exitCode,
        } = await runPs([
            'ps',
            'check',
        ]);

        expect(exitCode).toBe(2);
        expect(stderr).toContain('Missing required flag file');
    });

    it('--help documents its flags', async ({ expect }) => {
        const {
            stdout,
            exitCode,
        } = await runPs([
            'ps',
            'check',
            '--help',
        ]);

        expect(exitCode).toBe(0);
        expect(stdout).toContain('--file');
        expect(stdout).toContain('--strict');
    });
});
