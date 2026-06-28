import { z } from 'zod';
import { Finding } from './model.js';

const scopeList = z.array(z.string().min(1)).optional();

export const userEntrySchema = z.strictObject({
    permissionSets: scopeList,
    permissionSetGroups: scopeList,
    permissionSetLicenses: scopeList,
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
        findings: parsed.error.issues.map((issue) => ({
            level: 'error',
            code: 'SCHEMA',
            message: `${issue.path.join('.') || '(root)'}: ${issue.message}`,
            file,
        })),
    };
}
