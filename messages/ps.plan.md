# summary

Preview the changes that would reconcile a target org to the assignment files.

# description

Load the files, resolve every user and target against the org, fetch the org's current assignments, and diff the desired state against them. Read-only: it queries the org but never changes it, so it is the apply pipeline stopping before any DML. The body shows only what the chosen mode would do, so what plan shows is what apply does. Anything the mode would not touch is reported beneath the plan as drift. Run it before apply to preview what would change.

# flags.file.summary

YAML file or glob to plan. Repeatable.

# flags.mode.summary

Which half of the reconcile to preview: additive adds and updates expirations, destructive removes only, sync does both. The plan shows only what the chosen mode would do; anything it skips is reported as drift.

# flags.show-unchanged.summary

List assignments that already match, instead of only counting them.

# header.title

Permission Set Assignments Plan

# header.org

Org: %s (%s)   Mode: %s

# summary.counts.additive

Plan: %s to add, %s to update. %s users affected.

# summary.counts.destructive

Plan: %s to remove. %s users affected.

# summary.counts.sync

Plan: %s to add, %s to update, %s to remove. %s users affected.

# summary.unchanged

Unchanged: %s assignments (--show-unchanged to list).

# summary.unchangedListed

Unchanged: %s assignments.

# summary.next

Next: %s

# drift.additive

Drift: %s undeclared assignment(s) not removed in additive mode. Run --mode sync to remove them.

# drift.destructive

Drift: %s declared assignment(s) not applied in destructive mode. Run --mode additive or sync to apply them.

# empty.noChanges

No changes. %s already matches your files.

# empty.nothingToApply

Nothing to apply in %s mode.

# error.invalid

The files do not resolve cleanly against the org. Fix the errors above, then re-run.

# examples

- Preview a full reconcile of the dev org:

  <%= config.bin %> <%= command.id %> --file "permissions/*.yml" --target-org dev --mode sync

- Preview only the additions the default additive run would make:

  <%= config.bin %> <%= command.id %> --file "permissions/*.yml" --target-org dev

- Preview a full reconcile of production before applying it:

  <%= config.bin %> <%= command.id %> --file "permissions/*.yml" --target-org prod --mode sync
