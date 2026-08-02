import { fixture, ps } from '../run.ts';
import type { PsCheckResult } from '../../../src/commands/ps/check.js';

// The only import from src/ is a type, erased before anything runs. It buys the typed
// jsonOutput.result below, and it is the published --json contract rather than an internal,
// so it does not couple the NUT to a refactor the way a value import would.

// Absolute, so nothing depends on the directory mocha was invoked from.
export const validFile = fixture('valid.yml');
export const warningsFile = fixture('warnings.yml');
export const emptyFile = fixture('empty.yml');
export const emptyUserFile = fixture('empty-user.yml');
export const schemaErrorFile = fixture('schema-error.yml');
export const malformedFile = fixture('malformed.yml');
export const mixedCaseUserFile = fixture('mixed-case-user.yml');
export const mixedCaseTargetFile = fixture('mixed-case-target.yml');
export const unmatchedGlob = fixture('nope/*.yml');

/**
 * check is the one command with no --target-org, so every rule it enforces can be asserted
 * without an org. What the spec files assert is the observable output: exit code, which
 * stream carried what, and the --json payload.
 */
export function check(args: string, ensureExitCode: number | 'nonZero') {
    return ps<PsCheckResult>(`check ${args}`, ensureExitCode);
}
