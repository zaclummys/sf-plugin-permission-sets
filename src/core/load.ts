import { parseFile } from './parse.js';
import { validateFile } from './schema.js';
import { normalize } from './normalize.js';
import { DesiredAssignment } from './model.js';
import { Finding } from './finding.js';

/** One file's text turned into the model, with everything the three stages had to say. */
export type CheckedFile = {
    assignments: DesiredAssignment[];
    findings: Finding[]
};

/**
 * Process one file's text through parse, validate, and normalize. Takes the text rather than
 * the path, because reading a file is I/O and this layer does none: the caller in `services/`
 * owns the disk, the same way it already owns the disk on the way back out through export.
 * The file name is carried only so a finding can say where it came from.
 */
export function checkContent(text: string, file: string): CheckedFile {
    const parsed = parseFile(text, file);

    if (!parsed.data) {
        return {
            assignments: [],
            findings: parsed.findings,
        };
    }

    const validated = validateFile(parsed.data, file);

    if (!validated.data) {
        return {
            assignments: [],
            findings: [
                ...parsed.findings,
                ...validated.findings,
            ],
        };
    }

    const normalized = normalize(validated.data, file);

    return {
        assignments: normalized.assignments,
        findings: [
            ...parsed.findings,
            ...validated.findings,
            ...normalized.findings,
        ],
    };
}

/**
 * Merge every checked file into one model by union, keeping the first spelling of each
 * (assignee, kind, target). Two files granting the same target to the same user describe one
 * assignment, so declaring it twice is not an error and must not be applied twice.
 */
export function mergeAssignments(checked: CheckedFile[]): DesiredAssignment[] {
    const collected = checked.flatMap((entry) => entry.assignments);

    const seen = new Set<string>();
    const assignments: DesiredAssignment[] = [];

    for (const assignment of collected) {
        const dedupeKey = `${assignment.assignee.asKey()} ${assignment.kind} ${assignment.target.asKey()}`;

        if (seen.has(dedupeKey)) {
            continue;
        }
        seen.add(dedupeKey);
        assignments.push(assignment);
    }

    return assignments;
}

/** Every finding the checked files raised, in the order the files were read. */
export function mergeFindings(checked: CheckedFile[]): Finding[] {
    return checked.flatMap((entry) => entry.findings);
}
