import { parse, stringify } from 'yaml';
import { z } from 'zod';

/**
 * The saved-plan format version. Bump when the shape changes incompatibly, so an
 * `apply --plan` on an old file fails loudly instead of misreading it.
 */
export const savedPlanVersion = 1;

const kind = z.enum([
    'permissionSet',
    'permissionSetGroup',
    'permissionSetLicense',
]);

const mode = z.enum([
    'additive',
    'destructive',
    'sync',
]);

/** A resolved addition: the assignment plus the org ids needed to insert it. */
const resolvedAddition = z.strictObject({
    assignee: z.string().min(1),
    kind,
    target: z.string().min(1),
    expiration: z.string().min(1).optional(),
    assigneeId: z.string().min(1),
    targetId: z.string().min(1),
});

/** An expiration change on an existing record. */
const assignmentUpdate = z.strictObject({
    recordId: z.string().min(1),
    assignee: z.string().min(1),
    kind,
    target: z.string().min(1),
    expiration: z.string().min(1).optional(),
    previousExpiration: z.string().min(1).optional(),
});

/** An existing record to remove, carrying its id. */
const actualAssignment = z.strictObject({
    recordId: z.string().min(1),
    assignee: z.string().min(1),
    kind,
    target: z.string().min(1),
    expiration: z.string().min(1).optional(),
});

const savedPlanSchema = z.strictObject({
    version: z.literal(savedPlanVersion),
    org: z.string().min(1),
    mode,
    add: z.array(resolvedAddition),
    update: z.array(assignmentUpdate),
    remove: z.array(actualAssignment),
});

/** A reviewed, resolved change set frozen to a file, ready for `apply` to run verbatim. */
export type SavedPlan = z.infer<typeof savedPlanSchema>;

/** Serialize a plan to its on-disk YAML form. */
export function serializePlan(plan: SavedPlan): string {
    return stringify(plan);
}

/** Parse and validate a plan file's text. Returns the plan, or a single error message describing why it is invalid. */
export function parsePlan(content: string): { plan?: SavedPlan; error?: string } {
    let data: unknown;
    try {
        data = parse(content);
    } catch (err) {
        return { error: `invalid YAML: ${(err as Error).message}` };
    }

    const result = savedPlanSchema.safeParse(data);
    if (!result.success) {
        const detail = result.error.issues
            .map((issue) => `${issue.path.join('.') || '(root)'}: ${issue.message}`)
            .join('; ');

        return { error: detail };
    }

    return { plan: result.data };
}
