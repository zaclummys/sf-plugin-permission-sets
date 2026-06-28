# permission-sets

[![NPM](https://img.shields.io/npm/v/permission-sets.svg?label=permission-sets)](https://www.npmjs.com/package/permission-sets) [![Downloads/week](https://img.shields.io/npm/dw/permission-sets.svg)](https://npmjs.org/package/permission-sets) [![License](https://img.shields.io/badge/License-BSD%203--Clause-brightgreen.svg)](https://raw.githubusercontent.com/salesforcecli/permission-sets/main/LICENSE.txt)

> Declarative, GitOps-style management of **permission set assignments** for Salesforce orgs.
> Define who gets what in version-controlled YAML. The plugin reconciles your org to match it: `plan` then `apply`, just like Terraform.

Stop clicking through Setup to grant access. Commit a YAML file, open a PR, let CI show the diff, and merge to apply. Your git history becomes the audit log of who-had-access-when.

---

## Table of contents

- [Why](#why)
- [Install](#install)
- [Quick start](#quick-start)
- [Permission files](#permission-files)
- [Organizing files](#organizing-files)
- [Modes](#modes)
- [Commands](#commands)
- [CI/CD](#cicd)
- [Inspiration & equivalents](#inspiration--equivalents)

---

## Why

Permission set assignments drift. People get access for a project and keep it forever. Offboarding misses a set. Nobody can answer "who can see X and why?" without a SOQL spelunking session.

This plugin makes the desired state **declarative and reviewable**:

- ✅ **Single source of truth:** the YAML in git is authoritative, and the org is reconciled to it.
- ✅ **Plan before apply:** see exactly what will be added/removed before anything changes.
- ✅ **Safe by default:** deletions are opt-in and guarded by a delete threshold.
- ✅ **CI-native:** fully offline `check`, exit codes for gating, and `--json` on every command.
- ✅ **Flexible at the edges:** pick your file layout (by permission set or by user) and your sync mode.

## Install

```bash
sf plugins install permission-sets
```

Or pin a version:

```bash
sf plugins install permission-sets@x.y.z
```

Requires Salesforce CLI (`sf`) and Node.js 18+.

## Quick start

```bash
# 1. Bootstrap YAML from an existing org (so you don't start from scratch)
sf ps export --target-org dev --output-dir permissions

# 2. Edit the files, commit, open a PR. Validate offline, no org needed:
sf ps check --file "./permissions/*.yml"

# 3. Validate against a real org (do the users/permission sets exist?)
sf ps validate --file "./permissions/*.yml" --target-org dev

# 4. See what would change
sf ps plan --file "./permissions/*.yml" --target-org dev

# 5. Apply it (additive by default, only adds)
sf ps apply --file "./permissions/*.yml" --target-org dev

# 6. Full reconcile, including removals (opt-in)
sf ps apply --file "./permissions/*.yml" --target-org prod --mode sync
```

## Permission files

You point every command at one or more YAML files with `--file` (alias `-f`).

Multiple files are merged into one model, so splitting by team is encouraged. The files contain **only declarative data**: knobs like sync mode and exclusions are CLI flags (see [Commands](#commands)), so there's no separate config format to learn yet. Each top-level key is unique within a file, and `check` flags duplicates.

Each file is a map of usernames, and every scope key under a user is optional (include only what applies):

```yaml
users:
  <username>:
    permissionSets:
      - <PermissionSet.Name>
    permissionSetGroups:
      - <PermissionSetGroup.DeveloperName>
    permissionSetLicenses:
      - <PermissionSetLicense.DeveloperName>
```

A worked example:

```yaml
users:
  jdoe@acme.com:
    permissionSets:
      - Sales_Manager
      - Report_Builder
    permissionSetGroups:
      - Sales_Team_Bundle
    permissionSetLicenses:
      - SalesforceCRM
      
  asmith@acme.com:
    permissionSets:
      - Sales_Manager
```

The `--file` flag is repeatable and the plugin expands globs itself, so all of these work:

```bash
sf ps plan -o dev --file permissions/sales.yml
sf ps plan -o dev --file "permissions/*.yml"           # quote so the plugin (not the shell) expands it
sf ps plan -o dev --file permissions/sales.yml --file permissions/support.yml
```

## Organizing files

`--file` takes globs and merges everything it matches, so the folder layout is yours to choose. Two common setups:

**Per functional slice.** One file per team or domain. Each squad owns its slice, and `CODEOWNERS` plus PR reviews map to it cleanly. Everything merges into one model.

```
permissions/
  sales.yml
  service.yml
  marketing.yml
```

```bash
sf ps apply -o prod --file "permissions/*.yml"
```

**Per environment.** Because usernames differ per org (sandbox suffixes, different integration users), keep a directory per environment and reconcile each against its matching org. Each file is org-specific, which sidesteps username portability entirely.

```
permissions/
  prod/
    sales.yml
    service.yml
  qa/
    sales.yml
  dev/
    sales.yml
```

```bash
sf ps apply -o prod --file "permissions/prod/*.yml"
sf ps apply -o qa   --file "permissions/qa/*.yml"
```

The two compose: a directory per environment, each split into functional files.

## Modes

A run performs two atomic operations: **add** missing assignments and **remove** undeclared ones. The mode selects which it actually executes. Set it with `--mode` (default `additive`):

| Mode          | Adds missing | Removes undeclared | Use when…                                                              |
| ------------- | :----------: | :----------------: | --------------------------------------------------------------------- |
| `additive`    | ✅           | ❌                 | **Default.** Grant access, never revoke. Safe rollout.                |
| `destructive` | ❌           | ✅                 | Prune/revoke access that isn't declared, without granting anything new. |
| `sync`        | ✅           | ✅                 | Full reconcile: make the org exactly match the YAML (`sync` = `additive` + `destructive`). |

`plan` always shows the *full* picture (both adds **and** would-be removes) regardless of mode, so you can preview the impact before running it. Whatever the chosen mode won't act on is surfaced as **drift**. Gate CI on it with `--fail-on-drift`.

## Commands

| Command          | Purpose                                                                 |
| ---------------- | ---------------------------------------------------------------------- |
| `sf ps check`    | Static analysis of the files alone: schema, duplicates, conflicts, identifier shape. No org, no auth. |
| `sf ps validate` | Everything `check` does, plus resolving every user/permission set against the org. |
| `sf ps plan`     | Compute and display the change set. Optionally fail on drift. |
| `sf ps apply`    | Reconcile the org. Honors `--mode`, prompts before deletes, enforces guardrails. |
| `sf ps export`   | Generate YAML from the current org state to bootstrap adoption.        |

### `sf ps check`

Fully offline: runs in any CI job or pre-commit hook without org credentials.

```
USAGE
  $ sf ps check -f <glob>... [--strict] [--json]

FLAGS
  -f, --file=<glob>...     (required) YAML file(s) to read. Repeatable, globs are expanded by the plugin.
  --strict                 Treat warnings as errors.

CHECKS
  • valid YAML & schema (unknown keys rejected)
  • duplicate assignees / duplicate (user, target) pairs
  • conflicting intent across files
  • empty or malformed assignee usernames
  • internal referential integrity
```

### `sf ps validate`

```
USAGE
  $ sf ps validate -o <org> -f <glob>... [--json]

FLAGS
  -o, --target-org=<org>   (required) Org to resolve against.
  -f, --file=<glob>...     (required) YAML file(s) to read. Repeatable, globs expanded by the plugin.

Runs all offline checks, then verifies that every user (active), permission set,
group, and license referenced actually exists and resolves uniquely.
```

### `sf ps plan`

```
USAGE
  $ sf ps plan -o <org> -f <glob>... [--mode <value>] [--fail-on-drift] [--json]

FLAGS
  -o, --target-org=<org>   (required)
  -f, --file=<glob>...     (required) YAML file(s) to read. Repeatable, globs expanded by the plugin.
  --mode=<value>           additive | destructive | sync   [default: additive]
  --fail-on-drift          Exit non-zero if any change is pending (for CI gates).
```

Example output:

```text
$ sf ps plan -o prod --mode sync

Permission Set Assignments Plan
Org: prod (00D5g0000000abcEAA)   Mode: sync

permissionSets:
  Sales_Manager
    + asmith@acme.com
    - bwayne@acme.com        (undeclared, will be removed)
    = jdoe@acme.com          (no change)
  Report_Builder
    + jdoe@acme.com

permissionSetGroups:
  Sales_Team_Bundle          (no changes)

Plan: 2 to add, 1 to remove, 1 unchanged.
► Review, then run:  sf ps apply -o prod --mode sync
```

### `sf ps apply`

```
USAGE
  $ sf ps apply -o <org> -f <glob>... [--mode <value>] [--max-deletes <n>]
                [--dry-run] [--no-prompt] [--json]

FLAGS
  -o, --target-org=<org>   (required)
  -f, --file=<glob>...     (required) YAML file(s) to read. Repeatable, globs expanded by the plugin.
  --mode=<value>           additive | destructive | sync   [default: additive]
  --max-deletes=<n>        Abort if a run would remove more than n assignments. [default: 50]
  --dry-run                Resolve and diff, print what would happen, change nothing.
  --no-prompt              Skip the deletion confirmation prompt (for CI).
```

Deletions always prompt for confirmation unless `--no-prompt` is set, and are hard-capped by `--max-deletes` so a bad merge can't unassign your whole org. DML is executed with the sObject Collections API and reports partial successes/failures per record.

### `sf ps export`

```
USAGE
  $ sf ps export -o <org> [--output-dir <dir>] [--layout <value>]
                      [--permission-sets <names>] [--json]

FLAGS
  -o, --target-org=<org>     (required)
  --output-dir=<dir>         [default: permissions] Where to write the generated YAML.
  --layout=<value>           by-permission-set | by-user   [default: by-permission-set]
  --permission-sets=<names>  Comma-separated list to export (default: all assignable).
```

## CI/CD

A typical ladder: lint on every PR, plan against a sandbox, apply on merge:

```yaml
# .github/workflows/ps-gitops.yml
name: ps-gitops
on:
  pull_request:
  push:
    branches: [main]

jobs:
  check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: npm install -g @salesforce/cli
      - run: sf plugins install permission-sets
      - run: sf ps check --file "permissions/*.yml" --strict

  plan:
    if: github.event_name == 'pull_request'
    needs: check
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: npm install -g @salesforce/cli
      - run: sf plugins install permission-sets
      # Auth via Sfdx auth URL stored in a secrets manager, never hardcode credentials
      - run: echo "$SF_AUTH_URL" | sf org login sfdx-url --sfdx-url-stdin --alias target
        env:
          SF_AUTH_URL: ${{ secrets.SF_AUTH_URL }}
      - run: sf ps plan -o target --file "permissions/*.yml" --mode sync --fail-on-drift

  apply:
    if: github.ref == 'refs/heads/main' && github.event_name == 'push'
    needs: check
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: npm install -g @salesforce/cli
      - run: sf plugins install permission-sets
      - run: echo "$SF_AUTH_URL" | sf org login sfdx-url --sfdx-url-stdin --alias target
        env:
          SF_AUTH_URL: ${{ secrets.SF_AUTH_URL }}
      - run: sf ps apply -o target --file "permissions/*.yml" --mode sync --no-prompt --max-deletes 25
```

> **Credentials:** the plugin never reads or stores secrets itself. It uses orgs you've already authenticated with `sf`. In CI, inject auth from your platform's secrets store (as above), not from committed files.

## Inspiration & equivalents

The command surface borrows deliberately from tools you already know:

| This plugin          | Terraform              | CloudFormation / SAM            | sf core                    |
| -------------------- | ---------------------- | ------------------------------- | -------------------------- |
| `ps check`      | `terraform validate`   | `sam validate --lint`           | n/a                          |
| `ps validate`   | `terraform plan` (refresh) | `cfn validate-template`     | `project deploy validate`  |
| `ps plan`       | `terraform plan`       | `cfn create-change-set`         | `project deploy preview`   |
| `ps apply`      | `terraform apply`      | `cfn execute-change-set` / `sam deploy` | `project deploy start` |
| `ps export`     | `terraform import`     | n/a                               | n/a                          |
| `--fail-on-drift`    | drift in plan exit code | `cfn detect-stack-drift`       | n/a                          |

## License

BSD-3-Clause © Isaac Ferreira
