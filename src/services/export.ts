import { writeFile, mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';
import { AssignmentFilter, serializeAssignments } from '../core/index.js';
import { OrgClient } from './adapters/index.js';

export type ExportResult = {
    outputFile: string;
    users: number;
    assignments: number;
    /** Requested users (from the filter) that matched no assignments in scope. */
    unmatchedUsers: string[];
};

/** Online export: read the org's current assignments and write them as a YAML file. */
export class ExportService {
    public constructor(private readonly org: OrgClient) {}

    public async run(outputFile: string, filter?: AssignmentFilter): Promise<ExportResult> {
        const assignments = await this.org.listAssignments(filter);
        const content = serializeAssignments(assignments);

        await mkdir(dirname(outputFile), { recursive: true });
        await writeFile(outputFile, content, 'utf8');

        const assignees = new Set(assignments.map((assignment) => assignment.assignee));
        const requested = filter?.usernames ?? [];
        const unmatchedUsers = requested.filter((username) => !assignees.has(username));

        return {
            outputFile,
            users: assignees.size,
            assignments: assignments.length,
            unmatchedUsers,
        };
    }
}
