import { fixture, ps } from '../run.ts';
import type { PsCheckResult } from '../../../src/commands/ps/check.js';

export const validFile = fixture('valid.yml');
export const warningsFile = fixture('warnings.yml');
export const emptyFile = fixture('empty.yml');
export const emptyUserFile = fixture('empty-user.yml');
export const schemaErrorFile = fixture('schema-error.yml');
export const malformedFile = fixture('malformed.yml');
export const mixedCaseUserFile = fixture('mixed-case-user.yml');
export const mixedCaseTargetFile = fixture('mixed-case-target.yml');
export const unmatchedGlob = fixture('nope/*.yml');

export function check(args: string, ensureExitCode: number | 'nonZero') {
    return ps<PsCheckResult>(`check ${args}`, ensureExitCode);
}
