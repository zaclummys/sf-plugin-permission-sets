/**
 * A Salesforce username. An org compares usernames without regard to case, so every
 * comparison, index, and de-duplication in the model goes through `key` rather than the
 * raw text, and the text as written survives only for display and for round-tripping
 * back to YAML.
 *
 * Deliberately not sharing a base class with TargetName: the private field is what makes
 * the two nominally distinct to the compiler, so one cannot be passed where the other is
 * expected. A shared base would make them structurally identical again.
 */
export class Username {
    private constructor(private readonly raw: string) {}

    public static of(value: string): Username {
        return new Username(value);
    }

    /** The value to compare, index, and de-duplicate by. */
    public get key(): string {
        return this.raw.toLowerCase();
    }

    public equals(other: Username): boolean {
        return this.key === other.key;
    }

    /** The username as written, for display and for messages. */
    public toString(): string {
        return this.raw;
    }

    /** Keeps `--json` payloads plain strings, spelled as the files and the org spell them. */
    public toJSON(): string {
        return this.raw;
    }
}
