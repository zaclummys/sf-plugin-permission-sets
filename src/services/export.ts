import { writeFile, mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';
import { AssignmentFilter, serializeAssignments } from '../core/index.js';
import { OrgClient } from './adapters/index.js';

export type ExportResult = {
    /** The path written, or null when the document was returned for stdout instead of a file. */
    outputFile: string | null;
    /** The serialized YAML document, exactly as written to the file. */
    content: string;
    users: number;
    assignments: number;
    /** Requested users (from the filter) that matched no assignments in scope. */
    unmatchedUsers: string[];
};

/** Online export: read the org's current assignments and serialize them as YAML. */
export class ExportService {
    public constructor(private readonly org: OrgClient) {}

    public async run(outputFile: string | undefined, filter?: AssignmentFilter): Promise<ExportResult> {
        const assignments = await this.org.listAssignments(filter);
        const content = serializeAssignments(assignments);

        if (outputFile) {
            await mkdir(dirname(outputFile), { recursive: true });
            await writeFile(outputFile, content, 'utf8');
        }

        const assignees = new Set(assignments.map((assignment) => assignment.assignee));
        const requested = filter?.usernames ?? [];
        const unmatchedUsers = requested.filter((username) => !assignees.has(username));

        return {
            outputFile: outputFile ?? null,
            content,
            users: assignees.size,
            assignments: assignments.length,
            unmatchedUsers,
        };
    }
}
