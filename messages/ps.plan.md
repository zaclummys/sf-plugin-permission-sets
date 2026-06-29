# summary

Preview the changes that would reconcile a target org to the assignment files.

# description

Load the files, resolve every user and target against the org, fetch the org's current assignments, and diff the desired state against them. Read-only: it queries the org but never changes it, so it is the apply pipeline stopping before any DML. The full picture (assignments to add and would-be removes) is always shown regardless of mode, and whatever the chosen mode would not act on is surfaced as drift. Run it before apply to preview what would change.

# flags.file.summary

YAML file or glob to plan. Repeatable.

# flags.mode.summary

Which half of the reconcile to preview: additive adds and updates expirations, destructive removes only, sync does both. Adds, expiration updates, and removes are always shown either way.

# summary.counts

Plan: %s to add, %s to update, %s to remove, %s unchanged.

# summary.next

Reviewed the plan? Apply it with the same files: sf ps apply --mode %s

# drift.note

%s change(s) the %s mode does not act on were surfaced as drift.

# error.invalid

The files do not resolve cleanly against the org. Fix the errors above, then re-run.

# examples

- Preview a full reconcile of the dev org:

  <%= config.bin %> <%= command.id %> --file "permissions/*.yml" --target-org dev --mode sync

- Preview only the additions the default additive run would make:

  <%= config.bin %> <%= command.id %> --file "permissions/*.yml" --target-org dev

- Preview a full reconcile of production before applying it:

  <%= config.bin %> <%= command.id %> --file "permissions/*.yml" --target-org prod --mode sync
