import { expect } from 'chai';
import { fixture, ps } from '../../run.ts';
import { org } from '../../org-session.ts';

/**
 * Every spec here ends in a refusal, which is what keeps them from removing the seeded Delta
 * assignment the plan specs read. A guard that started writing would break those files.
 */
describe('ps apply guards', () => {
    it('refuses a destructive run that would remove more than --max-deletes', () => {
        const result = ps(
            `apply --file ${org.undeclaredFile} --target-org ${org.username} --mode destructive --max-deletes 0 --no-prompt`,
            1,
        );

        expect(result.shellOutput.stderr).to.contain('over the --max-deletes limit of 0');
    });

    it('leaves the org unchanged when the --max-deletes guard trips', () => {
        ps(
            `apply --file ${org.undeclaredFile} --target-org ${org.username} --mode destructive --max-deletes 0 --no-prompt`,
            1,
        );

        const after = ps(`plan --file ${org.undeclaredFile} --target-org ${org.username} --mode sync`, 0);

        expect(after.shellOutput.stdout).to.contain('Plan: 1 to add, 0 to update, 1 to remove. 2 users affected.');
    });

    it('refuses to delete in a --json run without --no-prompt', () => {
        const result = ps(`apply --file ${org.undeclaredFile} --target-org ${org.username} --mode destructive --json`, 1);

        expect(result.shellOutput.stdout).to.contain('Re-run with --no-prompt');
    });

    it('requires --file', () => {
        const result = ps(`apply --target-org ${org.username}`, 2);

        expect(result.shellOutput.stderr).to.contain('Missing required flag file');
    });

    it('fails a schema violation with exit 1', () => {
        const result = ps(`apply --file ${fixture('schema-error.yml')} --target-org ${org.username} --no-prompt`, 1);

        expect(result.shellOutput.stderr).to.contain('do not resolve cleanly against the org');
    });

    it('fails malformed YAML with exit 1', () => {
        const result = ps(`apply --file ${fixture('malformed.yml')} --target-org ${org.username} --no-prompt`, 1);

        expect(result.shellOutput.stdout).to.contain('error:');
    });

    it('refuses a file with warnings under --strict', () => {
        const result = ps(
            `apply --file ${fixture('warnings.yml')} --target-org ${org.username} --strict --no-prompt`,
            1,
        );

        expect(result.shellOutput.stderr).to.contain('Nothing was applied');
    });

    it('names the warnings that --strict refused to apply', () => {
        const result = ps(
            `apply --file ${fixture('warnings.yml')} --target-org ${org.username} --strict --no-prompt`,
            1,
        );

        expect(result.shellOutput.stdout).to.contain('listed twice under permissionSets');
    });
});
