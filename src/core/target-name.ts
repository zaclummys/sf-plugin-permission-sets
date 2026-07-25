/**
 * The API name of a permission set, group, or license. An org compares these without
 * regard to case, so the model compares, indexes, and de-duplicates by `key` and keeps
 * the text as written only for display and for round-tripping back to YAML.
 *
 * See Username for why these are two classes rather than one with a shared base.
 */
export class TargetName {
    private constructor(private readonly raw: string) {}

    public static of(value: string): TargetName {
        return new TargetName(value);
    }

    /** The value to compare, index, and de-duplicate by. */
    public get key(): string {
        return this.raw.toLowerCase();
    }

    public equals(other: TargetName): boolean {
        return this.key === other.key;
    }

    /** The name as written, for display and for messages. */
    public toString(): string {
        return this.raw;
    }

    /** Keeps `--json` payloads plain strings, spelled as the files and the org spell them. */
    public toJSON(): string {
        return this.raw;
    }
}
