export type Kind = 'permissionSet' | 'permissionSetGroup' | 'permissionSetLicense';

export type DesiredAssignment = {
    assignee: string;
    kind: Kind;
    target: string;
};

export type FindingLevel = 'error' | 'warning';

export type Finding = {
    level: FindingLevel;
    code: string;
    message: string;
    file?: string;
    line?: number;
};

export type LoadResult = {
    files: string[];
    assignments: DesiredAssignment[];
    findings: Finding[];
};
