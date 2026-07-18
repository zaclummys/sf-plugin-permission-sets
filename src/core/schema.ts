import { z } from 'zod';
import { Finding, schemaError } from './finding.js';

// The permission set name
const name = z.string().min(1);

// The permission set expiration date
const expiration = z.iso.datetime({ offset: true });

/** An entry is either a bare target name or a name with an expiration. */
const expiringList = z.array(
    z.union([
        name,
        z.strictObject({
            name,
            expiration,
        }),
    ])
);

/** Licenses cannot expire (PermissionSetLicenseAssign has no ExpirationDate), so names only. */
const plainList = z.array(name);

const userEntrySchema = z.strictObject({
    permissionSets: expiringList.optional(),
    permissionSetGroups: expiringList.optional(),
    permissionSetLicenses: plainList.optional(),
});

const fileSchema = z.strictObject({
    users: z.record(z.string().min(1), userEntrySchema),
});

export type FileShape = z.infer<typeof fileSchema>;

/** Validate a parsed object against the file contract, turning issues into findings. */
export function validateFile(data: unknown, file: string): { data?: FileShape; findings: Finding[] } {
    const parsed = fileSchema.safeParse(data);
    if (parsed.success) {
        return { data: parsed.data, findings: [] };
    }
    return {
        findings: parsed.error.issues.map((issue) =>
            schemaError(issue.path.join('.') || '(root)', issue.message, file)
        ),
    };
}
