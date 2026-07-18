# summary

Statically check permission set assignment files, with no org connection.

# description

Parse and validate the YAML files, no org needed. Reports invalid YAML, schema violations, duplicate keys, duplicate targets, and empty entries. Run it in a pre-commit hook or in CI before validate, plan, or apply.

# flags.file.summary

YAML file or glob to check. Repeatable.

# flags.strict.summary

Treat warnings as errors.

# summary.counts

%s errors, %s warnings.

# error.failed

Check found problems. See the output above.

# examples

- Check every file under permissions:

  <%= config.bin %> <%= command.id %> --file "permissions/*.yml"

- Check specific files:

  <%= config.bin %> <%= command.id %> --file permissions/sales.yml --file permissions/service.yml
