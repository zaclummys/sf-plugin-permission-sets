# summary

Generate a YAML file from the current org's permission set assignments.

# description

Query the target org for every assignable permission set, group, and license assignment held by active users and write them to a single user-keyed YAML file. The result is valid input for check, validate, plan, and apply, so it is a read-only way to bootstrap adoption from an org's current state. Profile-owned permission sets and inactive users are skipped.

# flags.output-file.summary

Path of the YAML file to write. Created (and its parent directories) if missing, overwritten if present.

# success

Exported %s assignments across %s users to %s.

# examples

- Export the dev org's assignments to permissions.yml:

  <%= config.bin %> <%= command.id %> --target-org dev --output-file permissions.yml

- Export a production org into an environment folder:

  <%= config.bin %> <%= command.id %> --target-org prod --output-file permissions/prod.yml
