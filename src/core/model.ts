export type Kind = 'permissionSet' | 'permissionSetGroup' | 'permissionSetLicense';

export type DesiredAssignment = {
    assignee: string;
    kind: Kind;
    target: string;
};

/** A user as it exists in the org, in domain terms (no SObject field names). */
export type OrgUser = {
    username: string;
    isActive: boolean;
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
