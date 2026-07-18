import { execa } from 'execa';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function sf(args) {
    // NODE_ENV=production so sf links/loads the compiled ./lib rather than the linked
    // plugin's uncompiled src (vitest sets NODE_ENV=test, which breaks that path).
    const env = {
        ...process.env,
        NODE_ENV: 'production',
        SF_AUTOUPDATE_DISABLE: 'true',
        NO_COLOR: '1'
    };

    return execa('sf', args, { cwd: projectRoot, reject: false, env });
}

// The real-org suites target an already-authenticated org named by PS_TARGET_ORG.
// Locally that can live in a gitignored .env, so load it to fill the gap; an env var
// already set (CI) always wins. Runs before workers spawn, so they inherit the value.
const envFile = path.join(projectRoot, '.env');

if (existsSync(envFile)) {
    process.loadEnvFile(envFile);
}

if (!process.env.PS_TARGET_ORG) {
    throw new Error(`PS_TARGET_ORG must be set in the environment`);
}

/**
 * vitest globalSetup: make `sf ps` resolve to this repo before any spec runs. The lib is
 * already compiled (a wireit dependency of test), so we link the built plugin and
 * unlink it on teardown. Authentication is the caller's job: the online suites target
 * whatever org PS_TARGET_ORG names, so nothing is logged in or out here.
 */
export default async function setup() {
    const version = await sf(['version']);

    if (version.exitCode !== 0) {
        throw new Error('These tests drive `sf ps ...`; install the sf CLI first (npm install -g @salesforce/cli).');
    }

    // --no-install is required: without it, `sf plugins link` runs a production install
    // in this dir and prunes devDependencies (vitest, execa), breaking the test run.
    const linked = await sf(['plugins', 'link', '.', '--no-install']);

    if (linked.exitCode !== 0) {
        throw new Error(`Could not link the plugin into sf: \n${linked.stderr}`);
    }

    return async () => {
        await sf(['plugins', 'unlink', '.']);
    };
}
