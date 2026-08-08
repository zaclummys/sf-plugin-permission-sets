import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/**
 * A directory of the run's own, for the job files a service is pointed at and the files it
 * writes. Every reader throws while the hook has not run, so a module-level read is a named
 * failure rather than an empty path handed to a service.
 */
export class Workspace {
    private dir = '';

    public static use(): Workspace {
        const workspace = new Workspace();

        before(async () => {
            await workspace.open();
        });

        after(async () => {
            await workspace.close();
        });

        return workspace;
    }

    public path(name: string): string {
        if (!this.dir) {
            throw new Error('Workspace is not open: call Workspace.use() inside the describe body.');
        }

        return join(this.dir, name);
    }

    public async write(name: string, text: string): Promise<string> {
        const file = this.path(name);

        await writeFile(file, text, 'utf8');

        return file;
    }

    public async read(name: string): Promise<string> {
        const file = this.path(name);

        return readFile(file, 'utf8');
    }

    private async open(): Promise<void> {
        const prefix = join(tmpdir(), 'sf-ps-unit-');

        this.dir = await mkdtemp(prefix);
    }

    private async close(): Promise<void> {
        await rm(this.dir, {
            recursive: true,
            force: true,
        });
    }
}
