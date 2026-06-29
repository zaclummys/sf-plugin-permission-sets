import { z } from 'zod';
import { Finding, error } from './finding.js';

/** A target with an expiration: the object form of an entry. */
const expiringTarget = z.strictObject({
    name: z.string().min(1),
    expiration: z.iso.datetime({ offset: true }),
});

/** An entry is either a bare target name or a name with an expiration. */
const expiringList = z.array(z.union([z.string().min(1), expiringTarget])).optional();

/** Licenses cannot expire (PermissionSetLicenseAssign has no ExpirationDate), so names only. */
const plainList = z.array(z.string().min(1)).optional();

export const userEntrySchema = z.strictObject({
    permissionSets: expiringList,
    permissionSetGroups: expiringList,
    permissionSetLicenses: plainList,
});

export const fileSchema = z.strictObject({
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
            error('SCHEMA', `${issue.path.join('.') || '(root)'}: ${issue.message}`, { file })
        ),
    };
}
