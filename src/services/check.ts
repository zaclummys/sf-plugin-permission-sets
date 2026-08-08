import { readFile } from 'node:fs/promises';
import { globby } from 'globby';
import {
    CheckedFile,
    DesiredAssignment,
    Findings,
    checkContent,
    mergeAssignments,
    mergeFindings,
    noFilesError,
} from '../core/index.js';

type CheckResult = {
    files: string[];
    assignments: DesiredAssignment[];
    findings: Findings;
    failed: boolean;
};

/**
 * Expand the globs, read what they matched, and turn it into the model. No org needed. Every
 * command that reads files starts here, so a rule added to the load is one every one of them
 * gets. The disk is this layer's, not `core`'s: `core` is handed text and hands back findings,
 * which is the same split export already had on the way out.
 *
 * `strict` is this service's own policy and defaults off: callers that only want the findings
 * ask them directly rather than inheriting a verdict they did not choose.
 */
export class CheckService {
    public async run(patterns: string[], strict = false): Promise<CheckResult> {
        const files = await globby(patterns);

        if (files.length === 0) {
            return this.nothingMatched(patterns, strict);
        }

        const checked = await Promise.all(files.map(async (file) => this.checkFile(file)));
        const findings = Findings.of(mergeFindings(checked));

        return {
            files,
            assignments: mergeAssignments(checked),
            findings,
            failed: findings.blocks(strict),
        };
    }

    private async checkFile(file: string): Promise<CheckedFile> {
        const text = await readFile(file, 'utf8');

        return checkContent(text, file);
    }

    private nothingMatched(patterns: string[], strict: boolean): CheckResult {
        const findings = Findings.of([noFilesError(patterns)]);

        return {
            files: [],
            assignments: [],
            findings,
            failed: findings.blocks(strict),
        };
    }
}
