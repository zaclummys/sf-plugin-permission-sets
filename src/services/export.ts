import { writeFile, mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';
import { serializeAssignments } from '../core/serialize.js';
import { OrgClient } from './adapters/org-client.js';

export type ExportResult = {
    outputFile: string;
    users: number;
    assignments: number;
};

/** Online export: read the org's current assignments and write them as a YAML file. */
export class ExportService {
    public constructor(private readonly org: OrgClient, private readonly outputFile: string) {}

    public async run(): Promise<ExportResult> {
        const assignments = await this.org.listAssignments();
        const content = serializeAssignments(assignments);

        await mkdir(dirname(this.outputFile), { recursive: true });
        await writeFile(this.outputFile, content, 'utf8');

        const assignees = new Set(assignments.map((assignment) => assignment.assignee));

        return {
            outputFile: this.outputFile,
            users: assignees.size,
            assignments: assignments.length,
        };
    }
}
