import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

/**
 * A path to `name` inside a fresh temp dir, so the concurrent tests never write over each
 * other. Nothing is created at that path: the command under test writes it. The OS
 * reclaims the dir, so there is nothing to clean up.
 */
export async function tempFile(prefix, name) {
    const dir = await mkdtemp(path.join(tmpdir(), prefix));

    return path.join(dir, name);
}
