import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const fixtures = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures');

/** Absolute path to a job file, so no service under test depends on the cwd. */
export function jobFile(name: string): string {
    return path.join(fixtures, name);
}

/** A job file's text, for asserting that a serialized document round-trips back to it. */
export function jobFileText(name: string): Promise<string> {
    const file = jobFile(name);

    return readFile(file, 'utf8');
}
