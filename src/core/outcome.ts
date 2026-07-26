import { Kind } from './model.js';

/**
 * The per-record result of one add, update, or remove, for partial-success reporting. A
 * report record rather than a model record: its names are only ever displayed, never
 * compared as identifiers, so it carries them as plain text.
 */
export type AssignmentOutcome = {
    assignee: string;
    kind: Kind;
    target: string;
    operation: 'add' | 'update' | 'remove';
    success: boolean;
    message?: string;
};

/**
 * What the org did, and every question asked of it. The per-operation counts feed the
 * summary line and the `--json` payload, and a single rejected record fails the run, so
 * the filtering rules live here rather than at each site that would otherwise repeat them.
 */
export class Outcomes {
    private constructor(private readonly items: AssignmentOutcome[]) {}

    public static of(items: AssignmentOutcome[]): Outcomes {
        return new Outcomes(items);
    }

    /** How many additions the org accepted. */
    public get added(): number {
        return this.acceptedOf('add');
    }

    /** How many updates the org accepted. */
    public get updated(): number {
        return this.acceptedOf('update');
    }

    /** How many removals the org accepted. */
    public get removed(): number {
        return this.acceptedOf('remove');
    }

    /** Every record the org rejected, so each one gets a line of its own. */
    public get failures(): AssignmentOutcome[] {
        return this.items.filter((outcome) => !outcome.success);
    }

    /** Whether the org rejected anything, which is what fails the run. */
    public get hasFailures(): boolean {
        return this.items.some((outcome) => !outcome.success);
    }

    private acceptedOf(operation: AssignmentOutcome['operation']): number {
        const accepted = this.items.filter((outcome) => outcome.operation === operation && outcome.success);

        return accepted.length;
    }
}
