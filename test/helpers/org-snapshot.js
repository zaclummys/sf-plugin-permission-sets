import { runPsTargetOrg } from './run-plugin.js';
import { tempFile } from './temp-file.js';
import { declaredUser } from '../fixtures/org.js';

/**
 * Export declaredUser's half of the org into a fresh temp file and return the path. That
 * export is the one input every command agrees on: planning or applying it back is an
 * empty diff, and validating it resolves clean, so a suite can assert on the outcome
 * without naming the org's contents. The export failing would make those assertions
 * meaningless rather than red, so it is asserted here instead of silently seeding an
 * empty file.
 *
 * The `--user` scope is what makes a snapshot safe to take while other specs run: it
 * leaves out islandUser, so a permission set another spec creates and deletes mid-run is
 * never in here to go missing between the export and the plan that reads it back.
 *
 * Suites that exercise `ps export` itself call it directly: there the export is the
 * behavior under test, not the fixture.
 */
export async function exportOrgSnapshot(expect) {
    const snapshot = await tempFile('ps-snapshot-', 'snap.yml');
    const exported = await runPsTargetOrg([
        'ps', 'export', '--output-file', snapshot, '--user', declaredUser,
    ]);

    expect(exported.exitCode).toBe(0);

    return snapshot;
}
