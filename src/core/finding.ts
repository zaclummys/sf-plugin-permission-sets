type FindingLevel = 'error' | 'warning';

/** The closed vocabulary of finding codes. Adding one here is required to emit it. */
type FindingCode =
    | 'YAML'
    | 'EMPTY_FILE'
    | 'SCHEMA'
    | 'EMPTY_LIST'
    | 'DUP_TARGET'
    | 'EMPTY_USER'
    | 'NO_FILES'
    | 'USER_NOT_FOUND'
    | 'USER_INACTIVE'
    | 'TARGET_NOT_FOUND'
    | 'TARGET_AMBIGUOUS';

export type Finding = {
    level: FindingLevel;
    code: FindingCode;
    message: string;
    file?: string;
    line?: number;
};

/** Where a finding was raised. Both optional: org-side findings have no file or line. */
type Where = { file?: string; line?: number };

/** Construct an error-level finding. Private: callers use the named constructors below. */
function error(code: FindingCode, message: string, where: Where = {}): Finding {
    return { level: 'error', code, message, ...where };
}

/** Construct a warning-level finding. Private: callers use the named constructors below. */
function warning(code: FindingCode, message: string, where: Where = {}): Finding {
    return { level: 'warning', code, message, ...where };
}

// Findings raised while reading and structurally checking a file.

/** Invalid YAML: the parser rejected the document. */
export function yamlError(message: string, file: string, line?: number): Finding {
    return error('YAML', message, { file, line });
}

/** The document parsed to nothing. */
export function emptyFileWarning(file: string): Finding {
    return warning('EMPTY_FILE', 'file is empty', { file });
}

/** The file violates the schema at `path`. */
export function schemaError(path: string, message: string, file: string): Finding {
    return error('SCHEMA', `${path}: ${message}`, { file });
}

/** A scope key is present but its list is empty. */
export function emptyListWarning(username: string, scopeKey: string, file: string): Finding {
    return warning('EMPTY_LIST', `${username}: ${scopeKey} is empty`, { file });
}

/** A target appears more than once under one scope for one user. */
export function dupTargetWarning(username: string, target: string, scopeKey: string, file: string): Finding {
    return warning('DUP_TARGET', `${username}: ${target} is listed twice under ${scopeKey}`, { file });
}

/** A user declares no scopes at all. */
export function emptyUserWarning(username: string, file: string): Finding {
    return warning('EMPTY_USER', `${username}: no scopes declared`, { file });
}

/** No file on disk matched the given glob patterns. */
export function noFilesError(patterns: string[]): Finding {
    return error('NO_FILES', `no files matched: ${patterns.join(', ')}`);
}

// Org-side findings, raised while resolving declarations against the org. No file or line.

/** A declared user does not exist in the org. */
export function userNotFoundError(username: string): Finding {
    return error('USER_NOT_FOUND', `${username}: user not found in org`);
}

/** A declared user exists but is inactive. */
export function userInactiveError(username: string): Finding {
    return error('USER_INACTIVE', `${username}: user is inactive`);
}

/** A declared target does not exist in the org. `label` is the kind's human name. */
export function targetNotFoundError(target: string, label: string): Finding {
    return error('TARGET_NOT_FOUND', `${target}: ${label} not found in org`);
}

/** A declared target resolves to more than one record in the org. */
export function targetAmbiguousError(target: string, label: string): Finding {
    return error('TARGET_AMBIGUOUS', `${target}: ${label} is not unique in org`);
}

/** The trailing-space location prefix for a finding: `file:line `, `file `, or empty. */
function locationPrefix(finding: Finding): string {
    if (!finding.file) return '';
    if (!finding.line) return `${finding.file} `;

    return `${finding.file}:${finding.line} `;
}

/** Render findings as human-readable lines. Shared by check, validate, and apply. */
export function formatFindings(findings: Finding[]): string[] {
    return findings.map((finding) => {
        const where = locationPrefix(finding);

        return `${finding.level}: ${where}${finding.message}`;
    });
}

/** Count findings by level. */
export function countFindings(findings: Finding[]): { errors: number; warnings: number } {
    const errors = findings.filter((finding) => finding.level === 'error');
    const warnings = findings.filter((finding) => finding.level === 'warning');

    return { errors: errors.length, warnings: warnings.length };
}
