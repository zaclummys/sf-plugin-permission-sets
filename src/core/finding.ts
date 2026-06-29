export type FindingLevel = 'error' | 'warning';

/** The closed vocabulary of finding codes. Adding one here is required to emit it. */
export type FindingCode =
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

/** Construct an error-level finding. */
export function error(code: FindingCode, message: string, where: Where = {}): Finding {
    return { level: 'error', code, message, ...where };
}

/** Construct a warning-level finding. */
export function warning(code: FindingCode, message: string, where: Where = {}): Finding {
    return { level: 'warning', code, message, ...where };
}

/** Render findings as human-readable lines. Shared by check, validate, and apply. */
export function formatFindings(findings: Finding[]): string[] {
    return findings.map((finding) => {
        const where = finding.file ? `${finding.file}${finding.line ? `:${finding.line}` : ''} ` : '';
        return `${finding.level}: ${where}${finding.message}`;
    });
}

/** Count findings by level. */
export function countFindings(findings: Finding[]): { errors: number; warnings: number } {
    const errors = findings.filter((finding) => finding.level === 'error');
    const warnings = findings.filter((finding) => finding.level === 'warning');

    return { errors: errors.length, warnings: warnings.length };
}
