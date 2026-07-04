import { execa } from 'execa';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const pluginName = 'sf-plugin-permission-sets';
// NODE_ENV=production so sf links/loads the compiled ./lib rather than the linked
// plugin's uncompiled src (vitest sets NODE_ENV=test, which breaks that path).
const env = { ...process.env, NODE_ENV: 'production', SF_AUTOUPDATE_DISABLE: 'true', NO_COLOR: '1' };

function sf(args) {
    return execa('sf', args, { reject: false, env });
}

/**
 * vitest globalSetup: make `sf ps` resolve to this repo before any spec runs.
 * The lib is already compiled (a wireit dependency of test:only), so we link the
 * built plugin. If the developer already linked or installed it, we leave their
 * setup untouched; otherwise we link now and unlink on teardown.
 */
export default async function setup() {
    const version = await sf(['version']);
    if (version.exitCode !== 0) {
        throw new Error('These tests drive `sf ps ...`; install the sf CLI first (npm install -g @salesforce/cli).');
    }

    const list = await sf(['plugins']);
    if (list.stdout.includes(pluginName)) {
        return () => {};
    }

    const linked = await sf(['plugins', 'link', projectRoot, '--no-install']);
    if (linked.exitCode !== 0) {
        throw new Error(`Could not link the plugin into sf:\n${linked.stderr}`);
    }

    return async () => {
        await sf(['plugins', 'unlink', pluginName]);
    };
}
