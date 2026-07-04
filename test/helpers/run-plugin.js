import { execa } from 'execa';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

// NODE_ENV=production makes sf load the plugin's compiled ./lib. Vitest otherwise
// sets NODE_ENV=test, which flips the linked plugin into dev mode and fails to load
// its uncompiled src/*.ts. sf's update/linked notices go to stderr, so stdout stays
// pure --json; disabling auto-update also avoids a network round-trip per spawn.
const env = {
    ...process.env,
    NODE_ENV: 'production',
    SF_AUTOUPDATE_DISABLE: 'true',
    NO_COLOR: '1',
    FORCE_COLOR: '0',
};

/**
 * Run `sf ps ...` exactly as a user types it (args already begin with `ps`) and
 * capture the terminal result. Never throws on a non-zero exit: the exit code is
 * part of what we assert.
 *
 * @param {string[]} args
 * @returns {Promise<{ stdout: string; stderr: string; exitCode: number }>}
 */
export async function runPs(args) {
    const result = await execa('sf', args, { cwd: projectRoot, reject: false, env });

    return {
        stdout: result.stdout ?? '',
        stderr: result.stderr ?? '',
        exitCode: result.exitCode ?? 1,
    };
}

/** Unwrap the `--json` envelope sf commands print: `{ status, result, warnings }`. */
export function parseJson(stdout) {
    const parsed = JSON.parse(stdout);
    return parsed.result ?? parsed;
}
