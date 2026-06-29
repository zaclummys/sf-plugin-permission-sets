import { readFile } from 'node:fs/promises';
import { globby } from 'globby';
import { parseFile } from './parse.js';
import { validateFile } from './schema.js';
import { normalize } from './normalize.js';
import { DesiredAssignment, LoadResult } from './model.js';
import { Finding, noFilesError } from './finding.js';

/** Process one file's text through parse, validate, and normalize. Pure, no disk. */
function checkContent(text: string, file: string): { assignments: DesiredAssignment[]; findings: Finding[] } {
    const parsed = parseFile(text, file);
    if (!parsed.data) {
        return { assignments: [], findings: parsed.findings };
    }

    const validated = validateFile(parsed.data, file);
    if (!validated.data) {
        return { assignments: [], findings: [...parsed.findings, ...validated.findings] };
    }

    const normalized = normalize(validated.data, file);
    return {
        assignments: normalized.assignments,
        findings: [...parsed.findings, ...validated.findings, ...normalized.findings],
    };
}

/** Expand the globs, read every matched file, and merge into one model by union. */
export async function loadFiles(patterns: string[]): Promise<LoadResult> {
    const files = await globby(patterns);
    if (files.length === 0) {
        return {
            files,
            assignments: [],
            findings: [noFilesError(patterns)],
        };
    }

    const findings: Finding[] = [];
    const collected: DesiredAssignment[] = [];
    for (const file of files) {
        // eslint-disable-next-line no-await-in-loop
        const text = await readFile(file, 'utf8');
        const res = checkContent(text, file);
        findings.push(...res.findings);
        collected.push(...res.assignments);
    }

    const seen = new Set<string>();
    const assignments: DesiredAssignment[] = [];

    for (const assignment of collected) {
        const dedupeKey = `${assignment.assignee} ${assignment.kind} ${assignment.target}`;
        if (seen.has(dedupeKey)) continue;
        seen.add(dedupeKey);
        assignments.push(assignment);
    }

    return { files, assignments, findings };
}
