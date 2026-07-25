import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

/** A fresh temp dir per call, so the concurrent tests never collide. The OS reclaims it. */
export async function tempDir(prefix) {
    return mkdtemp(path.join(tmpdir(), prefix));
}
