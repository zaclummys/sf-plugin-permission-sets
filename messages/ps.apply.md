# summary

Reconcile a target org to match the permission set assignment files.

# description

Load the files, resolve every user and target against the org, diff the desired state against what the org currently has, then add, update expirations, and/or remove assignments per the mode. Additions, expiration updates, and removals run through the sObject Collections API with partial success, so one bad record does not roll back the rest. Deletions are capped by --max-deletes and confirmed before they run. Run validate and a --dry-run first.

# flags.file.summary

YAML file or glob to apply. Repeatable. Provide either this or --plan.

# flags.plan.summary

Apply a saved plan file from plan --out, running the reviewed change set verbatim. Provide either this or --file.

# flags.mode.summary

Which half of the reconcile to run: additive adds missing assignments and updates expirations, destructive removes only, sync does both. Cannot be combined with --plan, which carries its own mode.

# flags.max-deletes.summary

Abort before any change if the run would remove more than this many assignments.

# flags.dry-run.summary

Resolve and diff, print the plan, and change nothing.

# flags.show-unchanged.summary

List assignments that already match, instead of only counting them.

# flags.no-prompt.summary

Skip the deletion confirmation prompt. Required to delete in JSON or other non-interactive runs.

# info.applyingPlan

Applying saved plan generated %s (mode %s).

# confirm.delete

This will remove %s assignment(s) from the org. Continue?

# summary.dryRun

Dry run: %s to add, %s to update, %s to remove. Nothing was changed.

# summary.applied

Applied: %s added, %s updated, %s removed.

# summary.declined

Aborted at the confirmation prompt. Nothing was changed.

# drift.note

%s change(s) the %s mode does not act on were skipped (drift). Run plan to see them.

# failure.line

failed to %s %s on %s: %s

# error.sourceConflict

Pass either --file or --plan, not both. --plan runs a saved plan; --file reads and diffs the YAML now.

# error.sourceMissing

Provide a source to apply: --file <glob> to read the YAML now, or --plan <file> to run a saved plan.

# error.modeWithPlan

--mode cannot be combined with --plan. A saved plan already carries the mode it was computed for. Re-run plan with the mode you want to get a new plan.

# error.planRead

Could not read the plan file: %s

# error.planInvalid

The plan file %s is not a valid plan: %s. Regenerate it with plan --out.

# error.planOrg

This plan was built for org %s but the target org is %s. Regenerate the plan against the target org.

# error.invalid

The files do not resolve cleanly against the org. Fix the errors above, then re-run.

# error.maxDeletes

Refusing to remove %s assignment(s): over the --max-deletes limit of %s. Raise the limit or narrow the change.

# error.promptInJson

Refusing to delete without confirmation in a non-interactive run. Re-run with --no-prompt.

# error.failed

Some changes failed. See the per-record errors above.

# examples

- Preview a full reconcile of the dev org without changing anything:

  <%= config.bin %> <%= command.id %> --file "permissions/*.yml" --target-org dev --mode sync --dry-run

- Grant any missing assignments (additive, the default):

  <%= config.bin %> <%= command.id %> --file "permissions/*.yml" --target-org dev

- Full reconcile of production in CI, without prompts:

  <%= config.bin %> <%= command.id %> --file "permissions/*.yml" --target-org prod --mode sync --no-prompt
