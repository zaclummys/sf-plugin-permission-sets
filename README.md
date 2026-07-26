# sf-plugin-permission-sets

[![NPM](https://img.shields.io/npm/v/sf-plugin-permission-sets.svg?label=sf-plugin-permission-sets)](https://www.npmjs.com/package/sf-plugin-permission-sets) [![Downloads/week](https://img.shields.io/npm/dw/sf-plugin-permission-sets.svg)](https://npmjs.org/package/sf-plugin-permission-sets) [![Stability: experimental](https://img.shields.io/badge/stability-experimental-orange.svg)](https://semver.org/#spec-item-4) [![License](https://img.shields.io/badge/License-BSD%203--Clause-brightgreen.svg)](https://raw.githubusercontent.com/zaclummys/sf-plugin-permission-sets/main/LICENSE.md)

> Declarative, GitOps-style management of **permission set assignments** for Salesforce orgs.
> Define who gets what in version-controlled YAML. The plugin reconciles your org to match it: `plan` then `apply`, just like Terraform.

> ⚠️ **Under active development.** This plugin is `0.x`. Per [semver's major-version-zero rule](https://semver.org/#spec-item-4), anything (commands, flags, the YAML schema) may change in a breaking way between `0.x` releases. Pin a version in CI. The public API stabilizes at `v1.0.0`.

Stop clicking through Setup to grant access. Commit a YAML file, open a PR, let CI show the diff, and merge to apply. Your git history becomes the audit log of who-had-access-when.

---

## Table of contents

- [Why](#why)
- [Install](#install)
- [Org permissions](#org-permissions)
- [Quick start](#quick-start)
- [Permission files](#permission-files)
- [Organizing files](#organizing-files)
- [Modes](#modes)
- [Validations](#validations)
- [Commands](#commands)
- [GitHub Actions](#github-actions)
- [Versioning](#versioning)
- [Architecture](#architecture)
- [Development](#development)
- [License](#license)

---

## Why

Permission set assignments drift. People get access for a project and keep it forever. Offboarding misses a set. Nobody can answer "who can see X and why?" without a SOQL spelunking session. And in higher environments those grants happen by hand in Setup, with no review and no trail.

This plugin makes the desired state **declarative and reviewable**:

- ✅ **Single source of truth:** the YAML in git is authoritative, and the org is reconciled to it.
- ✅ **Plan before apply:** see exactly what will be added/removed before anything changes.
- ✅ **Safe by default:** deletions are opt-in and guarded by a delete threshold.
- ✅ **CI-native:** `check` needs no org, exit codes for gating, and `--json` on every command.
- ✅ **Flexible at the edges:** pick your file layout (by permission set or by user) and your sync mode.
- ✅ **GitOps for access, the SFDX way:** assignments live in source and ship through the same git and CI pipeline as your metadata, instead of being clicked into Setup by hand.
- ✅ **Fewer hands in Setup for higher environments:** because access is applied from git through CI, fewer people need direct Setup access in UAT and production, and every change is a reviewed pull request with a git audit trail.

## Install

```bash
sf plugins install sf-plugin-permission-sets
```

Or pin a version:

```bash
sf plugins install sf-plugin-permission-sets@x.y.z
```

Requires Salesforce CLI (`sf`) and Node.js 22.13+.

## Org permissions

What the user behind `--target-org` needs:

| Command | API Enabled | View Setup and Configuration | View Roles and Role Hierarchy | Assign Permission Sets |
| --- | :---: | :---: | :---: | :---: |
| `sf ps check` | - | - | - | - |
| `sf ps validate` | ✓ | ✓ | ✓ | - |
| `sf ps plan` | ✓ | ✓ | ✓ | - |
| `sf ps export` | ✓ | ✓ | ✓ | - |
| `sf ps apply` | ✓ | ✓ | ✓ | ✓ |

✓ Required, - Not required. `Manage Users` is not required, not even for permission set licenses.

Two permission sets, so a pull request job cannot change the org:

- [PS_Plugin_Read](setup/permissionsets/PS_Plugin_Read.permissionset-meta.xml): reads permission set assignments.
- [PS_Plugin_Write](setup/permissionsets/PS_Plugin_Write.permissionset-meta.xml): reads and modifies permission set assignments.

## Quick start

```bash
# 1. Bootstrap YAML from an existing org (so you don't start from scratch)
sf ps export --target-org dev --output-file permissions/dev.yml

# 2. Edit the files, commit, open a PR. Check them, no org needed:
sf ps check --file "permissions/*.yml"

# 3. Validate against a real org (do the users/permission sets exist?)
sf ps validate --file "permissions/*.yml" --target-org dev

# 4. See what would change
sf ps plan --file "permissions/*.yml" --target-org dev

# 5. Apply it (additive by default, only adds)
sf ps apply --file "permissions/*.yml" --target-org dev

# 6. Full reconcile, including removals (opt-in)
sf ps apply --file "permissions/*.yml" --target-org prod --mode sync
```

## Permission files

`check`, `validate`, `plan`, and `apply` read one or more YAML files with `--file` (alias `-f`). (`export` writes YAML rather than reading it, so there `-f` is the output file.)

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

### Names are matched case-insensitively

Salesforce compares usernames and API names without regard to case, and so does this plugin. `JDoe@acme.com` and `jdoe@acme.com` are the same user, `Sales_Manager` and `sales_manager` are the same permission set, and every comparison the plugin makes (merging files, de-duplicating, diffing against the org, filtering an export) follows that rule. The spelling you write is the spelling that gets displayed and written back, so a file is never rewritten just to normalize case.

The practical consequence is that declaring the same user twice under different spellings merges the two blocks rather than creating two users, and listing a target twice under different spellings is the same duplicate `check` already warns about.

### Timed access (expiration)

A permission set or permission set group entry can be a plain name or an object with an `expiration`. The expiration is an ISO 8601 datetime, and Salesforce removes access automatically when it passes. Plain names never expire.

```yaml
users:
  contractor@acme.com:
    permissionSets:
      - Read_Only                              # permanent
      - name: Sales_Manager                    # expires automatically
        expiration: 2026-12-31T23:59:59Z
    permissionSetGroups:
      - name: Project_Phoenix_Bundle
        expiration: 2026-09-30T00:00:00Z
```

Expiration is a property of the grant, so `plan` and `apply` treat a changed `expiration` on an already-assigned target as an **update** (the `~` line, which shows the `old → new` transition), not an add or a remove. Updates ride with the additive half: they run in `additive` and `sync` modes and never count against `--max-deletes`. Permission set **licenses** cannot expire (Salesforce has no expiration on `PermissionSetLicenseAssign`), so the object form is rejected there. `export` writes the object form for any assignment that currently has an expiration in the org.

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

A run performs three operations: **add** missing assignments, **update** changed expirations on declared ones, and **remove** undeclared ones. Updates ride with the additive half (they touch a declared grant, never revoke access). The mode selects which it actually executes. Set it with `--mode` (default `additive`):

| Mode          | Adds missing | Updates expirations | Removes undeclared | Use when…                                                              |
| ------------- | :----------: | :-----------------: | :----------------: | --------------------------------------------------------------------- |
| `sync`        | ✅           | ✅                  | ✅                 | Full reconcile: make the org exactly match the YAML (`sync` = `additive` + `destructive`). |
| `additive`    | ✅           | ✅                  | ❌                 | **Default.** Grant access, never revoke. Safe rollout.                |
| `destructive` | ❌           | ❌                  | ✅                 | Prune/revoke access that isn't declared, without granting anything new. |

`plan` and `apply` preview and act on exactly what the selected mode covers, so the body shows only those operations and what `plan` shows is what `apply` does. Anything the mode won't touch (an undeclared assignment under `additive`, a missing grant under `destructive`) is reported beneath the plan as **drift**, naming the mode that would include it. `sync` covers everything, so it never reports drift.

## Validations

Every run checks the files first. `check` runs the file checks with no org, `validate` adds the org-side checks, and `plan` and `apply` run both before they touch anything. When files merge, most overlaps are unions rather than errors.

| Situation | Checked by | Severity | Result |
| --- | --- | :---: | --- |
| Same user in two files with different targets | `check` | ✅ ok | Merged into one model, the point of slicing |
| Same user under two spellings that differ only in case | `check` | ✅ ok | Merged into one user, matching how the org compares usernames |
| Same target listed twice for a user (case-insensitively) | `check` | ⚠️ warning | Deduped |
| A user with no scopes, or an empty list | `check` | ⚠️ warning | Ignored as a no-op |
| Same username key appears twice in one file | `check` | ❌ error | Rejected, the intent is ambiguous |
| Declared user, permission set, group, or license missing or not unique | `validate` | ❌ error | Run fails before any change |

An ❌ error stops any run. A ⚠️ warning stops one only under `--strict`, which `check`, `plan`, and `apply` all accept and all read the same way. The decision happens before the org is queried, so a strict refusal costs no query and no DML. Pass `--strict` to `plan` and to `apply` together, or the preview refuses a file that the run then applies anyway.

## Commands

| Command          | Purpose                                                                 |
| ---------------- | ---------------------------------------------------------------------- |
| `sf ps check`    | Static analysis of the files alone: schema, duplicates, conflicts, identifier shape. No org, no auth. |
| `sf ps validate` | Everything `check` does, plus resolving every user/permission set against the org. |
| `sf ps plan`     | Compute and display the change set: a read-only preview of what `apply` would do. |
| `sf ps export`   | Generate YAML from the current org state to bootstrap adoption.        |
| `sf ps apply`    | Reconcile the org. Honors `--mode`, prompts before deletes, enforces guardrails. |

### `sf ps check`

Needs no org: runs in any CI job or pre-commit hook without org credentials.

```
USAGE
  $ sf ps check -f <glob>... [--strict] [--json]

FLAGS
  -f, --file=<glob>...     (required) YAML file(s) to read. Repeatable, globs are expanded by the plugin.
  --strict                 Treat warnings as errors.

CHECKS
  - valid YAML & schema (unknown keys rejected)
  - duplicate assignees / duplicate (user, target) pairs
  - conflicting intent across files
  - empty or malformed assignee usernames
  - internal referential integrity
```

### `sf ps validate`

```
USAGE
  $ sf ps validate -o <org> -f <glob>... [--json]

FLAGS
  -o, --target-org=<org>   (required) Org to resolve against.
  -f, --file=<glob>...     (required) YAML file(s) to read. Repeatable, globs expanded by the plugin.

Runs everything `check` does, then verifies that every user (active), permission set,
group, and license referenced actually exists and resolves uniquely.
```

### `sf ps plan`

```
USAGE
  $ sf ps plan -o <org> -f <glob>... [--mode <value>] [--show-unchanged] [--strict] [--json]

FLAGS
  -o, --target-org=<org>   (required)
  -f, --file=<glob>...     (required) YAML file(s) to read. Repeatable, globs expanded by the plugin.
  --mode=<value>           additive | destructive | sync   [default: additive]
  --show-unchanged         List assignments that already match, instead of only counting them.
  --strict                 Treat warnings as errors.
```

`--strict` means the same thing it means on `check`: a warning stops the run. It is refused before the org is ever queried, so a plan that trips it costs nothing and tells you the same thing `check --strict` would have.

The body shows only what the mode will do, and unchanged assignments are summarized as a count (pass `--show-unchanged` to list them). The default `additive` run previews only what it grants, and reports the undeclared assignment it won't remove as drift:

```text
$ sf ps plan -o prod -f "permissions/*.yml"

Permission Set Assignments Plan
Org: prod (00D5g0000000abcEAA)   Mode: additive

Permission Sets
  Report_Builder
    + jdoe@acme.com
  Sales_Manager
    + asmith@acme.com
    ~ csmith@acme.com   expires 2026-12-31T23:59:59Z → 2027-06-30T23:59:59Z

Plan: 2 to add, 1 to update. 3 users affected.
Drift: 1 undeclared assignment not removed in additive mode. Run --mode sync to remove it.
Unchanged: 4 assignments (--show-unchanged to list).

Next: sf ps apply -o prod -f "permissions/*.yml"
```

The same files under `--mode sync` act on that drift too, so the removal now appears in the body and the drift line is gone:

```text
$ sf ps plan -o prod -f "permissions/*.yml" --mode sync

Permission Set Assignments Plan
Org: prod (00D5g0000000abcEAA)   Mode: sync

Permission Sets
  Report_Builder
    + jdoe@acme.com
  Sales_Manager
    + asmith@acme.com
    ~ csmith@acme.com   expires 2026-12-31T23:59:59Z → 2027-06-30T23:59:59Z
    - bwayne@acme.com

Plan: 2 to add, 1 to update, 1 to remove. 4 users affected.
Unchanged: 4 assignments (--show-unchanged to list).

Next: sf ps apply -o prod -f "permissions/*.yml" --mode sync
```

### `sf ps export`

Read-only. Snapshots the org's current assignments as YAML you can commit and then feed back into the other commands. Writes to a file with `--output-file`, or to stdout when that flag is omitted.

```
USAGE
  $ sf ps export -o <org> [-f <file>] [--user <username>...]
                 [--kind <scope>...] [--json]

FLAGS
  -o, --target-org=<org>   (required) Org to read assignments from.
  -f, --output-file=<file> Path of the YAML file to write. Parent directories are created; an existing file is overwritten. Omit to write to stdout.
  --user=<username>...      Only export these users. Repeatable, matched case-insensitively.
  --kind=<scope>...         Only export these scopes: permissionSets | permissionSetGroups | permissionSetLicenses. Repeatable.
```

It exports every assignable permission set, group, and license assignment held by active users, keyed by username, so the result is immediately valid input for `check`, `validate`, `plan`, and `apply`. Profile-owned permission sets and inactive users are skipped.

With `--output-file` the command writes the file and prints a one-line summary. Omit the flag and the YAML goes to stdout instead, byte-for-byte identical to what the file would contain, so it pipes and diffs cleanly: in that mode only the document reaches stdout and warnings go to stderr, so there is nothing to strip. Under `--json` the envelope is the only thing on stdout, and when `--output-file` is omitted the document comes back in its `content` field.

```bash
# Diff the org's live state against a committed snapshot
sf ps export -o prod | diff - permissions/prod.yml

# Redirect a scoped snapshot to a file of your choosing
sf ps export -o prod --user jdoe@acme.com > jdoe.yml
```

By default the whole org is exported. `--user` and `--kind` narrow the snapshot: pass either to scope it down, and pass both to intersect (the named users, restricted to the named scopes). Values within a flag are a union, so `--user jdoe@acme.com --user asmith@acme.com` exports both. A `--user` value is matched case-insensitively, so only a user the org really does not hold assignments for is reported as unmatched. The `--kind` values are the same scope keys the file uses, so `--kind permissionSetLicenses` reads back exactly the `permissionSetLicenses:` block.

```bash
# Snapshot one team's permission sets and groups only
sf ps export -o prod --output-file team.yml \
  --user jdoe@acme.com --user asmith@acme.com \
  --kind permissionSets --kind permissionSetGroups
```

A requested `--user` that has no matching assignments (a typo, or a user who genuinely holds nothing in scope) is reported as a warning and the export continues with whoever matched, so a mistyped username never masquerades as a clean empty file.

### `sf ps apply`

```
USAGE
  $ sf ps apply -o <org> -f <glob>... [--mode <value>] [--max-deletes <n>]
                [--dry-run] [--show-unchanged] [--no-prompt] [--strict] [--json]

FLAGS
  -o, --target-org=<org>   (required)
  -f, --file=<glob>...     (required) YAML file(s) to read. Repeatable, globs expanded by the plugin.
  --mode=<value>           additive | destructive | sync   [default: additive]
  --max-deletes=<n>        Abort if a run would remove more than n assignments. [default: 50]
  --dry-run                Resolve and diff, print what would happen, change nothing.
  --show-unchanged         List assignments that already match, instead of only counting them.
  --no-prompt              Skip the deletion confirmation prompt (for CI).
  --strict                 Treat warnings as errors.
```

`--strict` means the same thing it means on `check` and `plan`: a warning stops the run, before the org is queried and long before any DML. Pass it to the two the same way, or `plan --strict` refuses a file that `apply` then writes anyway.

`apply` recomputes from the files every run: it re-reads the YAML, re-resolves every reference to an org id, and re-diffs against live state, then acts per `--mode`. Run `plan` shortly before `apply` so the preview you review reflects what `apply` will do (an edited file, a renamed permission set, or another admin's change between the two shifts the outcome).

> [!CAUTION]
> `--mode sync` and `--mode destructive` revoke access. Deletions always prompt for confirmation unless `--no-prompt` is set, and are hard-capped by `--max-deletes` so a bad merge can't unassign your whole org.

DML is executed with the sObject Collections API and reports partial successes/failures per record.

## GitHub Actions

Three small workflows that build on each other: check pull requests with no org at all, validate the same files against the real org, then apply on merge.

Point the pull request workflows at a `PS_Plugin_Read` user and only the merge workflow at `PS_Plugin_Write` (see [Org permissions](#org-permissions)).

**1. Check pull requests to main** (no org, no secrets):

```yaml
# .github/workflows/permissions-check.yml
name: permissions-check

on:
  pull_request:
    branches: [main]

jobs:
  check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v7
      - uses: actions/setup-node@v7
        with:
          node-version: 22

      - name: Install Salesforce CLI
        run: npm install --global @salesforce/cli

      - name: Install the plugin
        run: sf plugins install sf-plugin-permission-sets

      - name: Check the permission files
        run: sf ps check --file "permissions/*.yml"
```

**2. Validate pull requests against the org** (needs org auth):

```yaml
# .github/workflows/permissions-validate.yml
name: permissions-validate

on:
  pull_request:
    branches: [main]
    paths:
      - "permissions/**"

jobs:
  validate:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v7
      - uses: actions/setup-node@v7
        with:
          node-version: 22

      - name: Install Salesforce CLI
        run: npm install --global @salesforce/cli

      - name: Install the plugin
        run: sf plugins install sf-plugin-permission-sets

      - name: Log in to the org
        run: echo '${{ secrets.SFDX_AUTH_URL }}' | sf org login sfdx-url --sfdx-url-stdin --alias prod

      - name: Validate the permission files
        run: sf ps validate --file "permissions/*.yml" --target-org prod
```

**3. Apply on merge to main** (needs org auth):

```yaml
# .github/workflows/permissions-apply.yml
name: permissions-apply

on:
  push:
    branches: [main]

jobs:
  apply:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v7
      - uses: actions/setup-node@v7
        with:
          node-version: 22

      - name: Install Salesforce CLI
        run: npm install --global @salesforce/cli

      - name: Install the plugin
        run: sf plugins install sf-plugin-permission-sets

      - name: Log in to the org
        run: echo '${{ secrets.SFDX_AUTH_URL }}' | sf org login sfdx-url --sfdx-url-stdin --alias prod

      - name: Apply the assignments
        run: sf ps apply --file "permissions/*.yml" --target-org prod --mode sync --no-prompt
```

Workflows 2 and 3 share one secret. Get the auth URL once with `sf org display --verbose --target-org prod`, copy the `Sfdx Auth Url` value, and save it as a repository secret named `SFDX_AUTH_URL`.

Want the diff on the PR before merging? Add a `sf ps plan --file "permissions/*.yml" --target-org prod` step to workflow 2, right after the login step, so reviewers see the change set that `apply` will carry out on merge.

## Versioning

Releases follow [semantic versioning](https://semver.org). Snapshots are automatic, real releases are a manual decision.

**Automatic, no action needed:**

- Every push to `main` publishes a snapshot `0.0.0-dev.<run>` to the `dev` dist-tag.
- Creating a release triggers CI to build, stamp the version from the tag, publish it with provenance, and smoke-test the result.

**Manual, you decide and trigger:**

- Choosing the version bump (patch, minor, or major).
- Creating the GitHub Release, which is what triggers the publish above.

**While on `0.x`:** breaking changes may ship in **any** release, including minor bumps. The plugin is under active development and the public API is not yet stable. The table below describes the contract that takes effect at `v1.0.0`.

| Bump | When | Example tag |
| --- | --- | --- |
| patch | bug fix, no behavior change | `v0.1.1` |
| minor | new backward-compatible feature | `v0.2.0` |
| major | breaking change to a command, flag, or the YAML schema | `v1.0.0` |

Cut a release with a tag off `main`:

```bash
gh release create v0.2.0 --target main --title v0.2.0 --notes "Add ps export"
```

| dist-tag | Published by | Install |
| --- | --- | --- |
| `latest` | manual release with a normal tag like `v1.2.0` | `sf plugins install sf-plugin-permission-sets` |
| `dev` | automatic on every push to `main` | `sf plugins install sf-plugin-permission-sets@dev` |

## Architecture

The plugin is layered so every command reuses the same core. Commands stay thin, services hold the orchestration, core holds the reusable primitives, and a thin adapter layer isolates the Salesforce SDK.

- **Commands** (`src/commands/ps/`): oclif only. They parse flags, construct the service (wiring in the org adapter when the command needs one), render output, and set the exit code.
- **Services** (`src/services/`): one per command (`check`, `validate`, `export`, `apply`, and `plan`), plus `resolution`, which the org-facing ones share. Each is a class whose constructor takes only its dependencies (the org client, a confirmation callback), while the per-invocation inputs are `run()` parameters, so one instance serves any number of runs. A service also declares the ports it needs from the outside, like the `OrgClient` interface its adapter implements. Where one command's work contains another's, the service composes rather than repeats it: `apply` runs `plan`, and `plan` runs `check`, so each stage of the pipeline is owned in exactly one place and the three can never disagree about what a set of files means.
- **Core** (`src/core/`): the reusable building blocks. Pure, with no `@salesforce/*` imports, so every piece is unit-testable on its own.
- **Adapters** (`src/adapters/`): the boundary to the outside world. `ConnectionOrgClient` implements the `OrgClient` port (declared in services) with a Salesforce `Connection`, and owns all the SOQL and SObject detail. Services depend on the port, not the SDK, so they test against a fake and stay free of connection detail.

| Core module | Responsibility |
| --- | --- |
| `model` | Shared domain types (assignment, org). |
| `username`, `target-name` | The identifiers, owning the org's case-insensitive comparison so no caller has to remember it. |
| `finding` | The finding type and code vocabulary, plus the constructors that raise each one. `Findings` is the collection, and it answers everything asked of a run's findings: the counts, the merge, the rendering, and whether they block the run under `--strict`. |
| `outcome` | The per-record result of one add, update, or remove. `Outcomes` is the collection, answering what the org accepted per operation and what it rejected. |
| `schema` | The zod contract for a file, plus validation. |
| `parse` | File text to an object, with YAML and duplicate-key errors. |
| `normalize` | A validated file to canonical `(assignee, kind, target)` tuples, plus structural findings. |
| `serialize` | Canonical tuples back to a user-keyed YAML document (the inverse of `normalize`). |
| `load` | Expand globs, run parse then validate then normalize per file, and merge by union. |
| `resolve` | Pure rules that turn declared references and the org's answers into findings, plus id lookups for assigning. No SOQL: the adapter owns that. |
| `diff` | The desired model vs. the org's current state, producing adds, removes, and unchanged. The `Diff` it returns also scopes itself to a reconcile mode, reporting what that mode acts on and the drift it leaves alone. |
| `report` | Format a diff as a plan. |

Commands are slices of one pipeline. `check` runs the **load** stage only, with no org. `validate` adds **resolve**: it looks the declared references up through the `OrgClient` port (the adapter builds the SOQL) and evaluates the org's answers with resolve's pure rules. `export` runs in the opposite direction: it **fetch**es the org's current assignments through the port and **serialize**s them straight back to YAML, skipping load entirely. `plan` adds **fetch** and **diff** on top of check: it resolves to ids, reads the org's current assignments for the targets it manages, and diffs the desired model against them. `apply` is that plan carried through to the DML, inserting and deleting through the Collections API per the mode (guarded by `--max-deletes` and a confirmation). Those two are literal composition rather than a resemblance, which is why `apply --dry-run` and `plan` cannot drift apart.

## Development

```bash
npm ci
npm run build   # compile and lint
npm test        # compile, then run the suite
```

The suite is black-box: every spec spawns the real `sf ps ...` binary. Install the Salesforce CLI first (`npm install -g @salesforce/cli`). The test run links this plugin into `sf` before the first spec and unlinks it at the end.

### Test environment

Tests take their parameters from the environment, never from a committed file. Copy the template and fill it in:

```bash
cp .env.example .env
```

| Variable | Required | What it is |
| --- | --- | --- |
| `PS_TARGET_ORG` | yes | Username or alias of an already-authenticated org. The `plan`, `apply`, and `export` specs run against it. |

## License

BSD-3-Clause © Isaac Ferreira
