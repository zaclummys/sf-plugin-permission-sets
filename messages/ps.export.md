# summary

Generate a YAML file from the current org's permission set assignments.

# description

Query the target org for every assignable permission set, group, and license assignment held by active users and write them to a single user-keyed YAML file. The result is valid input for check, validate, plan, and apply, so it is a read-only way to bootstrap adoption from an org's current state. Profile-owned permission sets and inactive users are skipped.

# flags.output-file.summary

Path of the YAML file to write. Created (and its parent directories) if missing, overwritten if present.

# flags.user.summary

Only export these users, matched on exact username. Repeatable; multiple values are a union.

# flags.kind.summary

Only export these scopes: permissionSets, permissionSetGroups, or permissionSetLicenses. Repeatable; combined with --user as an intersection.

# success

Exported %s assignments across %s users to %s.

# warnNoAssignments

No assignments in scope for user %s, it was skipped.

# examples

- Export the dev org's assignments to permissions.yml:

  <%= config.bin %> <%= command.id %> --target-org dev --output-file permissions.yml

- Export a production org into an environment folder:

  <%= config.bin %> <%= command.id %> --target-org prod --output-file permissions/prod.yml

- Export two users' permission sets and groups only:

  <%= config.bin %> <%= command.id %> --target-org prod --output-file team.yml --user jdoe@acme.com --user asmith@acme.com --kind permissionSets --kind permissionSetGroups
