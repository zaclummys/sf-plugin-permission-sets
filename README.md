# sf-plugin-permission-sets

[![NPM](https://img.shields.io/npm/v/sf-plugin-permission-sets.svg?label=sf-plugin-permission-sets)](https://www.npmjs.com/package/sf-plugin-permission-sets) [![Downloads/week](https://img.shields.io/npm/dw/sf-plugin-permission-sets.svg)](https://npmjs.org/package/sf-plugin-permission-sets) [![Stability: experimental](https://img.shields.io/badge/stability-experimental-orange.svg)](https://semver.org/#spec-item-4) [![License](https://img.shields.io/badge/License-BSD%203--Clause-brightgreen.svg)](https://raw.githubusercontent.com/zaclummys/sf-plugin-permission-sets/main/LICENSE.txt)

> Declarative, GitOps-style management of **permission set assignments** for Salesforce orgs.
> Define who gets what in version-controlled YAML. The plugin reconciles your org to match it: `plan` then `apply`, just like Terraform.

> ⚠️ **Under active development.** This plugin is `0.x`. Per [semver's major-version-zero rule](https://semver.org/#spec-item-4), anything (commands, flags, the YAML schema) may change in a breaking way between `0.x` releases. Pin a version in CI. The public API stabilizes at `v1.0.0`.

Stop clicking through Setup to grant access. Commit a YAML file, open a PR, let CI show the diff, and merge to apply. Your git history becomes the audit log of who-had-access-when.

---

## Table of contents

- [Why](#why)
- [Install](#install)
- [Quick start](#quick-start)
- [Permission files](#permission-files)
- [Organizing files](#organizing-files)
- [Modes](#modes)
- [Validations](#validations)
- [Commands](#commands)
- [Inspiration & equivalents](#inspiration--equivalents)
- [Versioning](#versioning)
- [Architecture](#architecture)

---

## Why

Permission set assignments drift. People get access for a project and keep it forever. Offboarding misses a set. Nobody can answer "who can see X and why?" without a SOQL spelunking session. And in higher environments those grants happen by hand in Setup, with no review and no trail.

This plugin makes the desired state **declarative and reviewable**:

- ✅ **Single source of truth:** the YAML in git is authoritative, and the org is reconciled to it.
- ✅ **Plan before apply:** see exactly what will be added/removed before anything changes.
- ✅ **Safe by default:** deletions are opt-in and guarded by a delete threshold.
- ✅ **CI-native:** fully offline `check`, exit codes for gating, and `--json` on every command.
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

Requires Salesforce CLI (`sf`) and Node.js 18+.

## Quick start

```bash
# 1. Bootstrap YAML from an existing org (so you don't start from scratch)
sf ps export --target-org dev --output-file permissions.yml

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

Expiration is a property of the grant, so `plan` and `apply` treat a changed `expiration` on an already-assigned target as an **update** (the `~` line), not an add or a remove. Updates ride with the additive half: they run in `additive` and `sync` modes and never count against `--max-deletes`. Permission set **licenses** cannot expire (Salesforce has no expiration on `PermissionSetLicenseAssign`), so the object form is rejected there. `export` writes the object form for any assignment that currently has an expiration in the org.

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
| `additive`    | ✅           | ✅                  | ❌                 | **Default.** Grant access, never revoke. Safe rollout.                |
| `destructive` | ❌           | ❌                  | ✅                 | Prune/revoke access that isn't declared, without granting anything new. |
| `sync`        | ✅           | ✅                  | ✅                 | Full reconcile: make the org exactly match the YAML (`sync` = `additive` + `destructive`). |

`plan` always shows the *full* picture (adds, expiration updates, **and** would-be removes) regardless of mode, so you can preview the impact before running it. Whatever the chosen mode won't act on is surfaced as **drift**.

## Validations

Every run checks the files first. `check` runs the offline checks with no org, and `validate` adds the org-side checks. When files merge, most overlaps are unions rather than errors.

| Situation | Checked by | Severity | Result |
| --- | --- | :---: | --- |
| Same username key appears twice in one file | `check` (offline) | ❌ error | Rejected, the intent is ambiguous |
| Same target listed twice for a user | `check` (offline) | ⚠️ warning | Deduped |
| A user with no scopes, or an empty list | `check` (offline) | ⚠️ warning | Ignored as a no-op |
| Same user in two files with different targets | `check` (offline) | ✅ ok | Merged into one model, the point of slicing |
| Declared user, permission set, group, or license missing or not unique | `validate` (online) | ❌ error | Run fails before any change |

## Commands

| Command          | Purpose                                                                 |
| ---------------- | ---------------------------------------------------------------------- |
| `sf ps check`    | Static analysis of the files alone: schema, duplicates, conflicts, identifier shape. No org, no auth. |
| `sf ps validate` | Everything `check` does, plus resolving every user/permission set against the org. |
| `sf ps plan`     | Compute and display the change set: a read-only preview of what `apply` would do. |
| `sf ps apply`    | Reconcile the org. Honors `--mode`, prompts before deletes, enforces guardrails. |
| `sf ps export`   | Generate YAML from the current org state to bootstrap adoption.        |

### `sf ps check`

Fully offline: runs in any CI job or pre-commit hook without org credentials.

```
USAGE
  $ sf ps check -f <glob>... [--strict] [--watch] [--json]

FLAGS
  -f, --file=<glob>...     (required) YAML file(s) to read. Repeatable, globs are expanded by the plugin.
  --strict                 Treat warnings as errors.
  -w, --watch              Re-run on every change to a matched file. Stays in the foreground until you stop it (Ctrl-C).

CHECKS
  - valid YAML & schema (unknown keys rejected)
  - duplicate assignees / duplicate (user, target) pairs
  - conflicting intent across files
  - empty or malformed assignee usernames
  - internal referential integrity
```

`--watch` is for the local edit loop: leave it running while you tweak the YAML and the findings refresh on every save. It re-expands the globs each run, so files you add or delete are picked up too. It's a foreground, interactive mode, so it can't be combined with `--json` and isn't meant for CI, where a single gated `check` run is what you want.

### `sf ps validate`

```
USAGE
  $ sf ps validate -o <org> -f <glob>... [--watch] [--json]

FLAGS
  -o, --target-org=<org>   (required) Org to resolve against.
  -f, --file=<glob>...     (required) YAML file(s) to read. Repeatable, globs expanded by the plugin.
  -w, --watch              Re-run on every change to a matched file. Read-only, but each run queries the org, so point it at a scratch or dev org.

Runs all offline checks, then verifies that every user (active), permission set,
group, and license referenced actually exists and resolves uniquely.
```

### `sf ps plan`

```
USAGE
  $ sf ps plan -o <org> -f <glob>... [--mode <value>] [--watch] [--json]

FLAGS
  -o, --target-org=<org>   (required)
  -f, --file=<glob>...     (required) YAML file(s) to read. Repeatable, globs expanded by the plugin.
  --mode=<value>           additive | destructive | sync   [default: additive]
  -w, --watch              Re-diff against the org on every change to a matched file. Read-only (never applies), but each run queries the org.
```

Example output:

```text
$ sf ps plan -o prod --mode sync

Permission Set Assignments Plan
Org: prod (00D5g0000000abcEAA)   Mode: sync

permissionSets:
  Sales_Manager
    + asmith@acme.com
    ~ csmith@acme.com (expires 2026-12-31T23:59:59Z)
    - bwayne@acme.com        (undeclared, will be removed)
    = jdoe@acme.com          (no change)
  Report_Builder
    + jdoe@acme.com

permissionSetGroups:
  Sales_Team_Bundle          (no changes)

Plan: 2 to add, 1 to update, 1 to remove, 1 unchanged.
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

Read-only. Snapshots the org's current assignments into a single YAML file you can commit and then feed back into the other commands.

```
USAGE
  $ sf ps export -o <org> --output-file <file> [--json]

FLAGS
  -o, --target-org=<org>   (required) Org to read assignments from.
  --output-file=<file>     (required) Path of the YAML file to write. Parent directories are created; an existing file is overwritten.
```

It exports every assignable permission set, group, and license assignment held by active users, keyed by username, so the result is immediately valid input for `check`, `validate`, `plan`, and `apply`. Profile-owned permission sets and inactive users are skipped.

## Inspiration & equivalents

This plugin's command surface borrows ideas from tools you already know:

- [Terraform](https://developer.hashicorp.com/terraform/docs)
- [AWS CLI](https://docs.aws.amazon.com/cli/latest/userguide/)
- [AWS SAM](https://docs.aws.amazon.com/serverless-application-model/latest/developerguide/)
- [Salesforce CLI](https://developer.salesforce.com/docs/atlas.en-us.sfdx_cli_reference.meta/sfdx_cli_reference/cli_reference.htm)

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
| `next` | manual release with a hyphenated tag like `v1.3.0-beta.1` | `sf plugins install sf-plugin-permission-sets@next` |
| `dev` | automatic on every push to `main` | `sf plugins install sf-plugin-permission-sets@dev` |

The `next` tag is selected whenever the version contains a hyphen, not by GitHub's prerelease checkbox.

## Architecture

The plugin is layered so every command reuses the same core. Commands stay thin, services hold the orchestration, core holds the reusable primitives, and a thin adapter layer isolates the Salesforce SDK.

- **Commands** (`src/commands/ps/`): oclif only. They parse flags, construct the service (wiring in the org adapter when the command needs one), render output, and set the exit code.
- **Services** (`src/services/`): one per command (`check`, `validate`, `export`, `apply`, and `plan`). Each is a class built from its dependencies and inputs, with a parameterless `run()` that turns the core into a command's behavior. A service also declares the ports it needs from the outside, like the `OrgClient` interface its adapter implements.
- **Core** (`src/core/`): the reusable building blocks. Pure, with no `@salesforce/*` imports, so every piece is unit-testable on its own.
- **Adapters** (`src/adapters/`): the boundary to the outside world. `ConnectionOrgClient` implements the `OrgClient` port (declared in services) with a Salesforce `Connection`, and owns all the SOQL and SObject detail. Services depend on the port, not the SDK, so they test against a fake and stay free of connection detail.

| Core module | Responsibility |
| --- | --- |
| `model` | Shared domain types (assignment, org, diff). |
| `finding` | The finding type and code vocabulary, plus constructors, formatting, and counting. |
| `schema` | The zod contract for a file, plus validation. |
| `parse` | File text to an object, with YAML and duplicate-key errors. |
| `normalize` | A validated file to canonical `(assignee, kind, target)` tuples, plus structural findings. |
| `serialize` | Canonical tuples back to a user-keyed YAML document (the inverse of `normalize`). |
| `load` | Expand globs, run parse then validate then normalize per file, and merge by union. |
| `resolve` | Pure rules that turn declared references and the org's answers into findings, plus id lookups for assigning. No SOQL: the adapter owns that. |
| `diff` | The desired model vs. the org's current state, producing adds, removes, and unchanged. |
| `report` | Format a diff as a plan. |

Commands are slices of one pipeline. `check` runs the offline **load** stage only. `validate` adds **resolve**: it looks the declared references up through the `OrgClient` port (the adapter builds the SOQL) and evaluates the org's answers with resolve's pure rules. `export` runs in the opposite direction: it **fetch**es the org's current assignments through the port and **serialize**s them straight back to YAML, skipping load entirely. `apply` is the full pipeline: load, resolve to ids, **fetch** current state, **diff**, then insert and delete through the Collections API per the mode (guarded by `--max-deletes` and a confirmation). `plan` is that same pipeline stopping before the DML: load, resolve to ids, **fetch** current state, **diff**, and report, the same preview `apply --dry-run` produces.

## License

BSD-3-Clause © Isaac Ferreira
