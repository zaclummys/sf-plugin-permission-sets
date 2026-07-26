/**
 * The instant a grant stops applying. An expiration is a point in time, not a piece of
 * text: one instant is spelled `2026-12-31T23:59:59Z` in one file, `2026-12-31T20:59:59-03:00`
 * by a team that writes local time, and `2026-12-31T23:59:59.000+0000` by the Salesforce
 * API, so comparing the text would report an endless update between values that agree.
 * The model compares by instant through `asKey()`, truncated to the second (the precision
 * the platform stores), and writes one canonical form back out.
 *
 * Unlike Username and TargetName, this does not keep the text as written: an instant has
 * no spelling worth preserving, so `toString()` and `toJSON()` are the canonical form and
 * a file that round-trips through `export` comes back in it. That is also why only one
 * spelling has to be accepted on the way in: the schema is free to stay strict, because
 * nothing the plugin writes is in any other form.
 *
 * See Username for why these are separate classes rather than one with a shared base.
 */
export class Expiration {
    private constructor(private readonly instant: number) {}

    /**
     * Build from a datetime naming an instant. Throws on anything else: the file boundary
     * validates through the schema first, and the org boundary is handed the platform's
     * own serialization, so a rejection here is a defect rather than bad input.
     */
    public static of(value: string): Expiration {
        const instant = Date.parse(value);

        if (Number.isNaN(instant)) {
            throw new Error(`Not a datetime: ${value}`);
        }

        return new Expiration(instant);
    }

    /** Whether two expirations name the same instant. Both absent (null) counts as equal. */
    public static same(left: Expiration | null, right: Expiration | null): boolean {
        if (!left || !right) {
            return left === right;
        }

        return left.equals(right);
    }

    /** The value to compare, index, and de-duplicate by: whole seconds since the epoch. */
    public asKey(): number {
        return Math.floor(this.instant / 1000);
    }

    public equals(other: Expiration): boolean {
        return this.asKey() === other.asKey();
    }

    /** The canonical form: UTC, to the second. What the plugin displays and writes. */
    public toString(): string {
        const seconds = this.asKey();
        const instant = new Date(seconds * 1000);

        return instant.toISOString().replace(/\.\d{3}Z$/, 'Z');
    }

    /** Keeps `--json` payloads plain strings, in the one form every command reports. */
    public toJSON(): string {
        return this.toString();
    }
}
