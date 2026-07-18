# summary

Validate permission set assignment files against a target org.

# description

Run the same file checks as check, then resolve each referenced user, permission set, group, and license against the org. Reports users that are missing or inactive and targets that are missing or not unique. Read-only: it queries the org but never changes it. Run it before plan or apply.

# flags.file.summary

YAML file or glob to validate. Repeatable.

# summary.counts

%s errors, %s warnings.

# error.failed

Validation found problems. See the output above.

# examples

-   Validate every file under permissions against the dev org:

    <%= config.bin %> <%= command.id %> --file "permissions/\*.yml" --target-org dev

-   Validate specific files against a named org:

    <%= config.bin %> <%= command.id %> --file permissions/sales.yml --file permissions/service.yml --target-org prod
