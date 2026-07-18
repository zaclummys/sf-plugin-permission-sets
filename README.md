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

Every run checks the files first. `check` runs the offline checks with no org, and `validate` adds the org-side checks. When files merge, most overlaps are unions rather than errors.

| Situation | Checked by | Severity | Result |
| --- | --- | :---: | --- |
| Same user in two files with different targets | `check` (offline) | ✅ ok | Merged into one model, the point of slicing |
| Same target listed twice for a user | `check` (offline) | ⚠️ warning | Deduped |
| A user with no scopes, or an empty list | `check` (offline) | ⚠️ warning | Ignored as a no-op |
| Same username key appears twice in one file | `check` (offline) | ❌ error | Rejected, the intent is ambiguous |
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

Runs all offline checks, then verifies that every user (active), permission set,
group, and license referenced actually exists and resolves uniquely.
```

### `sf ps plan`

```
USAGE
  $ sf ps plan -o <org> -f <glob>... [--mode <value>] [--show-unchanged]
               [--out <file>] [--json]

FLAGS
  -o, --target-org=<org>   (required)
  -f, --file=<glob>...     (required) YAML file(s) to read. Repeatable, globs expanded by the plugin.
  --mode=<value>           additive | destructive | sync   [default: additive]
  --show-unchanged         List assignments that already match, instead of only counting them.
  --out=<file>             Write the computed change set to a plan file that `apply` can run verbatim.
```

With `--out` the plan is also saved to a file: the resolved change set (adds, updates, removes with their record ids), the mode it was computed for, and the org it targets. Feed that file to `apply --plan` to execute exactly what you reviewed, with no recomputation. See [Saved plans](#saved-plans).

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

### `sf ps apply`

```
USAGE
  $ sf ps apply -o <org> (-f <glob>... | --plan <file>) [--mode <value>]
                [--max-deletes <n>] [--dry-run] [--show-unchanged] [--no-prompt] [--json]

FLAGS
  -o, --target-org=<org>   (required)
  -f, --file=<glob>...     YAML file(s) to read. Repeatable, globs expanded by the plugin.
  --plan=<file>            Apply a saved plan file from `plan --out` instead of re-reading YAML.
  --mode=<value>           additive | destructive | sync   [default: additive]
  --max-deletes=<n>        Abort if a run would remove more than n assignments. [default: 50]
  --dry-run                Resolve and diff, print what would happen, change nothing.
  --show-unchanged         List assignments that already match, instead of only counting them.
  --no-prompt              Skip the deletion confirmation prompt (for CI).
```

Provide exactly one source: `--file` (read and diff the YAML now) or `--plan` (run a saved plan). They cannot be combined, and `--mode` cannot accompany `--plan` (the plan already carries its mode). `--max-deletes`, `--dry-run`, and `--no-prompt` apply to both.

Deletions always prompt for confirmation unless `--no-prompt` is set, and are hard-capped by `--max-deletes` so a bad merge can't unassign your whole org. DML is executed with the sObject Collections API and reports partial successes/failures per record.

#### Saved plans

`plan --out` and `apply --plan` split review from execution, so what you approve is exactly what runs:

```bash
sf ps plan  -o prod -f "permissions/*.yml" --mode sync --out prod.plan
# ... review prod.plan, get sign-off ...
sf ps apply -o prod --plan prod.plan
```

Without a saved plan, `apply` recomputes from the files: it re-reads the YAML, re-resolves every reference to an org id, and re-diffs against live state. Anything that changed since you ran `plan` (an edited file, a renamed permission set, another admin's assignment) silently changes what `apply` does. A saved plan freezes the resolved change set, so `apply --plan` executes those exact records with no recomputation.

Guardrails:

- `apply --plan` refuses a plan built for a different org (the plan records the org id).
- It refuses a plan file it cannot parse or whose format version it does not recognize.
- The plan is executed as recorded. If the org drifted after the plan was written, individual records may fail (a removed target, an already-deleted assignment); those surface as per-record failures in the outcome report rather than aborting the run. Re-run `plan` to get a fresh plan when in doubt.

### `sf ps export`

Read-only. Snapshots the org's current assignments as YAML you can commit and then feed back into the other commands. Writes to a file with `--output-file`, or to stdout when that flag is omitted.

```
USAGE
  $ sf ps export -o <org> [-f <file>] [--user <username>...]
                 [--kind <scope>...] [--json]

FLAGS
  -o, --target-org=<org>   (required) Org to read assignments from.
  -f, --output-file=<file> Path of the YAML file to write. Parent directories are created; an existing file is overwritten. Omit to write to stdout.
  --user=<username>...      Only export these users. Repeatable, matched on exact username.
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

By default the whole org is exported. `--user` and `--kind` narrow the snapshot: pass either to scope it down, and pass both to intersect (the named users, restricted to the named scopes). Values within a flag are a union, so `--user jdoe@acme.com --user asmith@acme.com` exports both. The `--kind` values are the same scope keys the file uses, so `--kind permissionSetLicenses` reads back exactly the `permissionSetLicenses:` block.

```bash
# Snapshot one team's permission sets and groups only
sf ps export -o prod --output-file team.yml \
  --user jdoe@acme.com --user asmith@acme.com \
  --kind permissionSets --kind permissionSetGroups
```

A requested `--user` that has no matching assignments (a typo, or a user who genuinely holds nothing in scope) is reported as a warning and the export continues with whoever matched, so a mistyped username never masquerades as a clean empty file.

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
