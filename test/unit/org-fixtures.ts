import { actualAssignment, desiredAssignment, orgTarget, orgUser } from './fake-org-client.ts';

/** An org that answers for everything one-assignment.yml and expiring.yml declare. */
export const resolvedOrg = {
    users: [orgUser('005000000000001AAA', 'alice@example.com')],
    permissionSets: [orgTarget('0PS000000000001AAA', 'PS_Alpha')],
};

/** The grant one-assignment.yml declares, as the org would report it on a read. */
export const alphaForAlice = desiredAssignment({
    assignee: 'alice@example.com',
    kind: 'permissionSet',
    target: 'PS_Alpha',
});

/** A second grant for the same user, for counting users against assignments. */
export const groupForAlice = desiredAssignment({
    assignee: 'alice@example.com',
    kind: 'permissionSetGroup',
    target: 'PSG_Onboarding',
});

/** The grant one-assignment.yml declares, as the org would already hold it. */
export const heldAlpha = actualAssignment('0Pa000000000001AAA', {
    assignee: 'alice@example.com',
    kind: 'permissionSet',
    target: 'PS_Alpha',
});

/** A grant no file declares, which is what a removal is planned from. */
export const heldBeta = actualAssignment('0Pa000000000002AAA', {
    assignee: 'alice@example.com',
    kind: 'permissionSet',
    target: 'PS_Beta',
});
