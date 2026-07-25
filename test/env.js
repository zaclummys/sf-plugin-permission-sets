// The one place the suite reads its environment. Everything else imports `targetOrg` from
// here, so there is a single answer to "which org do the tests drive" and a single place
// that fails when nobody said.

import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// Locally the value can live in a gitignored .env, so load it to fill the gap. A variable
// already set in the environment always wins, which is how CI passes the org in without a
// file. Importing this module is what loads it, in the main process and in every worker.
const envFile = path.join(projectRoot, '.env');

if (existsSync(envFile)) {
    process.loadEnvFile(envFile);
}

if (!process.env.PS_TARGET_ORG) {
    throw new Error('PS_TARGET_ORG must be set: name an already-authenticated org. Run `cp .env.example .env` and fill it in.');
}

/**
 * The already-authenticated org the real-org specs drive with `--target-org <targetOrg>`:
 * one you logged into locally and named here, or one a CI step logs in and points here.
 */
export const targetOrg = process.env.PS_TARGET_ORG;
