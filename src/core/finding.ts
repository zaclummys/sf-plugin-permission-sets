import { TargetName } from './target-name.js';
import { Username } from './username.js';

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
export function emptyListWarning(username: Username, scopeKey: string, file: string): Finding {
    return warning('EMPTY_LIST', `${username.toString()}: ${scopeKey} is empty`, { file });
}

/** A target appears more than once under one scope for one user. */
export function dupTargetWarning(username: Username, target: TargetName, scopeKey: string, file: string): Finding {
    return warning(
        'DUP_TARGET',
        `${username.toString()}: ${target.toString()} is listed twice under ${scopeKey}`,
        { file }
    );
}

/** A user declares no scopes at all. */
export function emptyUserWarning(username: Username, file: string): Finding {
    return warning('EMPTY_USER', `${username.toString()}: no scopes declared`, { file });
}

/** No file on disk matched the given glob patterns. */
export function noFilesError(patterns: string[]): Finding {
    return error('NO_FILES', `no files matched: ${patterns.join(', ')}`);
}

// Org-side findings, raised while resolving declarations against the org. No file or line.

/** A declared user does not exist in the org. */
export function userNotFoundError(username: Username): Finding {
    return error('USER_NOT_FOUND', `${username.toString()}: user not found in org`);
}

/** A declared user exists but is inactive. */
export function userInactiveError(username: Username): Finding {
    return error('USER_INACTIVE', `${username.toString()}: user is inactive`);
}

/** A declared target does not exist in the org. `label` is the kind's human name. */
export function targetNotFoundError(target: TargetName, label: string): Finding {
    return error('TARGET_NOT_FOUND', `${target.toString()}: ${label} not found in org`);
}

/** A declared target resolves to more than one record in the org. */
export function targetAmbiguousError(target: TargetName, label: string): Finding {
    return error('TARGET_AMBIGUOUS', `${target.toString()}: ${label} is not unique in org`);
}

/** The trailing-space location prefix for a finding: `file:line `, `file `, or empty. */
function locationPrefix(finding: Finding): string {
    if (!finding.file) {
        return '';
    }
    if (!finding.line) {
        return `${finding.file} `;
    }

    return `${finding.file}:${finding.line} `;
}

/**
 * Everything a run has to say about the files and the org, and every question asked of
 * it. Findings are not only displayed: an error aborts the run and sets the exit code,
 * so the counting, merging, and rendering rules live here rather than at each call site
 * that would otherwise have to remember them.
 */
export class Findings {
    private constructor(private readonly items: Finding[]) { }

    public static empty(): Findings {
        return new Findings([]);
    }

    public static of(items: Finding[]): Findings {
        return new Findings(items);
    }

    /** How many findings are error-level. */
    public errors(): number {
        return this.countOf('error');
    }

    /** How many findings are warning-level. */
    public warnings(): number {
        return this.countOf('warning');
    }

    /** Whether the run has to abort: an error is fatal whatever the mode. */
    public hasErrors(): boolean {
        return this.items.some((finding) => finding.level === 'error');
    }

    /** Whether anything was flagged short of an error, which `--strict` promotes to a failure. */
    public hasWarnings(): boolean {
        return this.items.some((finding) => finding.level === 'warning');
    }

    /**
     * Whether these findings stop the run. An error always does. A warning does only under
     * `--strict`, which is why the flag's value is the caller's to pass rather than a
     * verdict one command inherits from another.
     */
    public blocks(strict: boolean): boolean {
        return this.hasErrors() || (strict && this.hasWarnings());
    }

    /** Both sets in order, so file findings still read before the org's answers. */
    public concat(other: Findings): Findings {
        return new Findings([
            ...this.items,
            ...other.items,
        ]);
    }

    /** Render as human-readable lines. Shared by check, validate, plan, and apply. */
    public format(): string[] {
        return this.items.map((finding) => {
            const where = locationPrefix(finding);

            return `${finding.level}: ${where}${finding.message}`;
        });
    }

    /** Keeps `--json` payloads the plain array of findings they have always been. */
    public toJSON(): Finding[] {
        return this.items;
    }

    private countOf(level: FindingLevel): number {
        const matching = this.items.filter((finding) => finding.level === level);

        return matching.length;
    }
}
