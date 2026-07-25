// Paths to the YAML fixtures a spec passes to `-f`, plus the org values the diff fixtures
// lean on. These are file paths, not file contents: a spec hands them straight to `sf ps`,
// which reads them itself. They stay relative to the project root because runPs spawns
// `sf` with cwd there.

export * from './org.js';

/** Parses and resolves cleanly against no org: no findings expected. */
export const validPath = 'test/fixtures/valid.yml';

/** Warnings only, no errors: one duplicate target and one empty scope list. */
export const warningsPath = 'test/fixtures/warnings.yml';

/** A schema violation: the object form of a license, which the schema rejects. */
export const schemaErrorPath = 'test/fixtures/schema-error.yml';

/** Invalid YAML: an unclosed flow sequence the parser rejects. */
export const malformedPath = 'test/fixtures/malformed.yml';

/** Leaves one of the org's own assignments undeclared: one addition and one removal. */
export const undeclaredPath = 'test/fixtures/undeclared-assignment.yml';

/**
 * A target org that resolves nowhere, so the specs that use it fail identically on any
 * machine, without the network or a developer's default org.
 */
export const noOrg = 'no-such-org-alias-xyz';
