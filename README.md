# sf-plugin-permission-sets

[![NPM](https://img.shields.io/npm/v/sf-plugin-permission-sets.svg?label=sf-plugin-permission-sets)](https://www.npmjs.com/package/sf-plugin-permission-sets) [![Downloads/week](https://img.shields.io/npm/dw/sf-plugin-permission-sets.svg)](https://npmjs.org/package/sf-plugin-permission-sets) [![Coverage](https://codecov.io/gh/zaclummys/sf-plugin-permission-sets/branch/main/graph/badge.svg)](https://app.codecov.io/gh/zaclummys/sf-plugin-permission-sets/tree/main) [![Stability: experimental](https://img.shields.io/badge/stability-experimental-orange.svg)](https://semver.org/#spec-item-4) [![License](https://img.shields.io/badge/License-BSD%203--Clause-brightgreen.svg)](https://raw.githubusercontent.com/zaclummys/sf-plugin-permission-sets/main/LICENSE.md)

> Declarative, GitOps-style management of **permission set assignments** for Salesforce orgs.
> Permission sets, permission set groups, and permission set licenses, all in one file.
> Define who gets what in version-controlled YAML. The plugin reconciles your org to match it: `plan` then `apply`, just like Terraform.

> ⚠️ **Under active development.** This plugin is `0.x`. Per [semver's major-version-zero rule](https://semver.org/#spec-item-4), anything (commands, flags, the YAML schema) may change in a breaking way between `0.x` releases. Pin a version in CI. The public API stabilizes at `v1.0.0`.

Stop clicking through Setup to grant access. Commit a YAML file, open a pull request, let CI show the diff, and merge to apply. Your git history becomes the audit log: who had what access, and when.

If you're looking for an alternative to [`sf org assign permset`](https://developer.salesforce.com/docs/atlas.en-us.sfdx_dev.meta/sfdx_dev/sfdx_dev_assign_permset.htm), please give it a try. We'd love your feedback!

---

## Table of contents

- [Why](#why)
- [Install](#install)
- [Quick start](#quick-start)
- [Permission files](#permission-files)
- [Modes](#modes)
- [Validations](#validations)
- [Commands](#commands)
- [Org permissions](#org-permissions)
- [GitHub Actions](#github-actions)
- [Versioning](#versioning)
- [Architecture](#architecture)
- [Development](#development)
- [License](#license)

---

## Why

Permission set assignments drift: access granted for one project is never revoked, offboarding misses a set, and nobody can answer "who can see this, and why?" without a SOQL session. In higher environments those grants happen by hand in Setup, with no review and no trail.

This plugin makes the desired state declarative and reviewable:

- **Single source of truth:** the YAML in git is authoritative, and the org is reconciled to it.
- **Scales past the click:** granting one permission set to 40 users is one line per user in a file, not 40 trips through Setup.
- **Plan before apply:** see every add, update, and removal before anything changes.
- **Safe by default:** removals are opt-in, capped by `--max-deletes`, and confirmed before they run.
- **CI-native:** `check` needs no org, every command exits non-zero on failure, and every command speaks `--json`.
- **Fewer hands in Setup:** access ships through the same pull request and CI pipeline as your metadata, so fewer people need Setup access in UAT and production.

### Compared to `sf org assign permset`

|                     | `sf org assign permset`                        | `sf ps apply`                                                    |
| ------------------- | ---------------------------------------------- | ---------------------------------------------------------------- |
| Model               | Imperative, run by hand                        | Declarative, a file in git                                       |
| Review              | Applies when you run it                        | A pull request before it applies                                 |
| Revoking access     | No command for it                              | `--mode destructive` or `--mode sync`, capped by `--max-deletes` |
| Preview             | None                                           | `sf ps plan`                                                     |
| Groups and licenses | A second command for licenses, none for groups | One file covers all three                                        |
| Timed access        | Not supported                                  | `expiration` on any grant                                        |
| Bulk writes         | One API call per assignment                    | One Collections API call per 200 records                         |

The native command is still the right tool for a one-off grant in a scratch org. This plugin is for the access you want to keep true over time.

## Install

```bash
sf plugins install sf-plugin-permission-sets
```

Or pin a version:

```bash
sf plugins install sf-plugin-permission-sets@x.y.z
```

Requires Salesforce CLI (`sf`) and Node.js 22.13+.

## Quick start

```bash
# 1. Bootstrap YAML from an existing org, so you don't start from scratch
sf ps export --target-org dev --output-file permissions/dev.yml

# 2. Edit the files, commit, open a pull request. Check them, no org needed:
sf ps check --file "permissions/*.yml"

# 3. Validate against a real org: do the users and permission sets exist?
sf ps validate --file "permissions/*.yml" --target-org dev

# 4. See what would change
sf ps plan --file "permissions/*.yml" --target-org dev

# 5. Apply it (additive by default, only adds)
sf ps apply --file "permissions/*.yml" --target-org dev

# 6. Full reconcile, including removals (opt-in)
sf ps apply --file "permissions/*.yml" --target-org prod --mode sync
```

## Permission files

`check`, `validate`, `plan`, and `apply` read one or more YAML files with `--file` (`-f`). Multiple files are merged into one model, so splitting by team is encouraged. (`export` writes YAML rather than reading it, so there `-f` is `--output-file`.) The files hold only declarative data: knobs like the mode are CLI flags, so there is no separate config format to learn.

Each file is a map of usernames, and every scope key under a user is optional:

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

The `--file` flag is repeatable and the plugin expands globs itself:

```bash
sf ps plan -o dev --file permissions/sales.yml
sf ps plan -o dev --file "permissions/*.yml"           # quote it, so the plugin expands it rather than the shell
sf ps plan -o dev --file permissions/sales.yml --file permissions/support.yml
```

### Names are matched case-insensitively

Salesforce compares usernames and API names without regard to case, and so does this plugin. `JDoe@acme.com` and `jdoe@acme.com` are the same user, `Sales_Manager` and `sales_manager` are the same permission set, and every comparison (merging files, de-duplicating, diffing against the org, filtering an export) follows that rule. The spelling you write is the spelling that gets displayed and written back, so a file is never rewritten just to normalize case.

### Timed access (expiration)

A permission set or group entry can be a plain name or an object with an `expiration`, an ISO 8601 datetime with an offset. Salesforce removes the access automatically when it passes. Plain names never expire.

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

- A changed `expiration` on an already-assigned target is an **update** (the `~` line), not an add or a remove. Updates ride with the additive half: they run in `additive` and `sync`, and never count against `--max-deletes`.
- Permission set **licenses** cannot expire, because Salesforce has no expiration on `PermissionSetLicenseAssign`. The object form is rejected there.
- An expiration names an instant, not a piece of text. `2026-12-31T23:59:59Z` and `2026-12-31T20:59:59-03:00` are the same moment and the plugin treats them as equal, comparing to the second, which is the precision Salesforce stores. Everything the plugin writes comes back in one canonical form: UTC, to the second, `Z`-suffixed.
- `export` writes the object form for any assignment that currently has an expiration in the org.

### Organizing files

Because `--file` merges everything it matches, the layout is yours. Two common setups, which compose:

**Per functional slice.** One file per team or domain, so `CODEOWNERS` and pull request reviews map onto it cleanly.

```
permissions/
  sales.yml
  service.yml
  marketing.yml
```

**Per environment.** Usernames differ per org (sandbox suffixes, different integration users), so a directory per environment sidesteps username portability entirely.

```
permissions/
  prod/sales.yml
  qa/sales.yml
  dev/sales.yml
```

```bash
sf ps apply -o prod --file "permissions/prod/*.yml"
sf ps apply -o qa   --file "permissions/qa/*.yml"
```

## Modes

A run performs three operations: **add** missing assignments, **update** changed expirations on declared ones, and **remove** undeclared ones. The mode selects which it executes. Set it with `--mode` (default `additive`):

| Mode          | Adds missing | Updates expirations | Removes undeclared | Use when                                                          |
| ------------- | :----------: | :-----------------: | :----------------: | ----------------------------------------------------------------- |
| `additive`    | ✅           | ✅                  | ❌                 | **Default.** Grant access, never revoke. Safe rollout.            |
| `destructive` | ❌           | ❌                  | ✅                 | Revoke access that isn't declared, without granting anything new.  |
| `sync`        | ✅           | ✅                  | ✅                 | Full reconcile: make the org exactly match the YAML.               |

`plan` and `apply` act on exactly what the mode covers, so what `plan` shows is what `apply` does. Anything the mode won't touch (an undeclared assignment under `additive`, a missing grant under `destructive`) is reported beneath the plan as **drift**, naming the mode that would include it. `sync` covers everything, so it never reports drift.

### What "undeclared" is measured against

Two things put an assignment in scope, and removal only ever considers what is in scope:

- **Every target your files name.** If a file grants `Sales_Manager` to anyone, every holder of `Sales_Manager` is compared against the files, including users no file mentions.
- **Every kind your files declare for a user they name.** Declaring `permissionSets` for `jdoe@acme.com` puts *all* of their permission sets in scope, which is what makes deleting a line the way to revoke a grant.

The second half is scoped by kind on purpose. Declaring `permissionSets` for someone says nothing about their licenses, so a key you never write for a user is never touched: omitting `permissionSetLicenses` does not mean "take them all away". A user's profile-owned permission set is never in scope either.

The practical consequence, worth knowing before your first `--mode sync`: a user in your files is fully managed for the kinds you declare for them. Anything granted to them by hand in Setup, under one of those keys, is undeclared and will be proposed for removal. That is the point of a declarative reconcile, and it is why removals are opt-in, capped by `--max-deletes`, and confirmed. Run `plan` first.

## Validations

Every run checks the files first: `check` runs the file checks with no org, `validate` adds the org-side checks, and `plan` and `apply` run both before they touch anything. When files merge, most overlaps are unions rather than errors.

| Situation | Checked by | Severity | Result |
| --- | --- | :---: | --- |
| Same user in two files with different targets | `check` | ✅ ok | Merged into one model, the point of slicing |
| Same user under two spellings that differ only in case | `check` | ✅ ok | Merged into one user, matching how the org compares usernames |
| Same target listed twice for a user (case-insensitively) | `check` | ⚠️ warning | Deduped |
| A user with no scopes, or an empty list | `check` | ⚠️ warning | Ignored as a no-op |
| Same username key appears twice in one file | `check` | ❌ error | Rejected, the intent is ambiguous |
| Declared user, permission set, group, or license missing or not unique | `validate` | ❌ error | Run fails before any change |

An ❌ error stops any run. A ⚠️ warning stops one only under `--strict`, which `check`, `plan`, and `apply` all accept and all read the same way. The decision happens before the org is queried, so a strict refusal costs no query and no DML. Pass `--strict` to `plan` and `apply` together, or the preview refuses a file that the run then applies anyway.

## Commands

| Command          | Purpose                                                                 |
| ---------------- | ---------------------------------------------------------------------- |
| `sf ps check`    | Static analysis of the files alone: schema, duplicates, conflicts, identifier shape. No org, no auth. |
| `sf ps validate` | Everything `check` does, plus resolving every user and target against the org. |
| `sf ps plan`     | A read-only preview of what `apply` would do. |
| `sf ps export`   | Generate YAML from the current org state, to bootstrap adoption. |
| `sf ps apply`    | Reconcile the org. Honors `--mode`, prompts before removals, enforces guardrails. |

Diffs and findings are coloured: additions green, expiration updates yellow, removals red, unchanged grey, and the `error:`/`warning:` label on a finding red or yellow. Colour is applied only when the terminal takes it, so a pipe, a redirect, or a CI log gets the same plain text it always did, which is what keeps `sf ps ... --json | jq` working. Nothing the plugin prints under `--json` is coloured at all: the syntax highlighting you see on the envelope on a terminal comes from the `sf` CLI itself, the same as on every other command. `NO_COLOR=1` turns colour off even on a terminal, `FORCE_COLOR=1` keeps it through a pipe, and `NO_COLOR` wins when both are set.

### `sf ps check`

Needs no org, so it runs in any CI job or pre-commit hook without credentials.

```
USAGE
  $ sf ps check -f <glob>... [--strict] [--json]

FLAGS
  -f, --file=<glob>...  (required) YAML file(s) to read. Repeatable, globs are expanded by the plugin.
      --strict          Treat warnings as errors.

CHECKS
  - valid YAML and schema (unknown keys rejected)
  - duplicate users, duplicate (user, target) pairs
  - empty or malformed usernames
  - empty scopes
```

### `sf ps validate`

Runs everything `check` does, then verifies that every user (active), permission set, group, and license referenced exists and resolves uniquely.

```
USAGE
  $ sf ps validate -o <org> -f <glob>... [--json]

FLAGS
  -o, --target-org=<org>  (required) Org to resolve against.
  -f, --file=<glob>...    (required) YAML file(s) to read. Repeatable, globs are expanded by the plugin.
```

### `sf ps plan`

```
USAGE
  $ sf ps plan -o <org> -f <glob>... [--mode <value>] [--show-unchanged] [--strict] [--json]

FLAGS
  -o, --target-org=<org>  (required) Org to plan against.
  -f, --file=<glob>...    (required) YAML file(s) to read. Repeatable, globs are expanded by the plugin.
      --mode=<value>      additive | destructive | sync   [default: additive]
      --show-unchanged    List assignments that already match, instead of only counting them.
      --strict            Treat warnings as errors.
```

The body shows only what the mode will do, and unchanged assignments are summarized as a count. A default `additive` run previews what it grants and reports the undeclared assignment it won't remove as drift:

```text
$ sf ps plan -o prod -f "permissions/*.yml"

Permission Set Assignments Plan
Org: deploy@acme.com (00D5g0000000abcEAA)   Mode: additive

Permission Sets
  Report_Builder
    + jdoe@acme.com
  Sales_Manager
    + asmith@acme.com
    ~ csmith@acme.com   expires 2026-12-31T23:59:59Z → 2027-06-30T23:59:59Z

Plan: 2 to add, 1 to update. 3 users affected.
Drift: 1 undeclared assignment(s) not removed in additive mode. Run --mode sync to remove them.
Unchanged: 4 assignments (--show-unchanged to list).

Next: sf ps apply -o deploy@acme.com -f "permissions/*.yml"
```

The same files under `--mode sync` act on that drift, so the removal joins the body as a `-` line and the drift line is gone.

### `sf ps export`

Read-only. Snapshots the org's current assignments as YAML you can commit and feed back into the other commands.

```
USAGE
  $ sf ps export -o <org> [-f <file>] [--user <username>...] [--kind <scope>...] [--json]

FLAGS
  -o, --target-org=<org>    (required) Org to read assignments from.
  -f, --output-file=<file>  Path of the YAML file to write. Parent directories are created, an existing file is overwritten. Omit to write to stdout.
      --user=<username>...  Only export these users. Repeatable, matched case-insensitively.
      --kind=<scope>...     Only export these scopes: permissionSets | permissionSetGroups | permissionSetLicenses. Repeatable.
```

It exports every assignable permission set, group, and license assignment held by active users, keyed by username, so the result is immediately valid input for the other commands. Profile-owned permission sets and inactive users are skipped.

With `--output-file` the command writes the file and prints a one-line summary. Omit the flag and the YAML goes to stdout instead, byte-for-byte identical to what the file would contain, with warnings on stderr so there is nothing to strip. Under `--json` the envelope is the only thing on stdout, and when `--output-file` is omitted the document comes back in its `content` field.

```bash
# Diff the org's live state against a committed snapshot
sf ps export -o prod | diff - permissions/prod.yml

# Snapshot one team's permission sets and groups only
sf ps export -o prod --output-file team.yml \
  --user jdoe@acme.com --user asmith@acme.com \
  --kind permissionSets --kind permissionSetGroups
```

By default the whole org is exported. Pass `--user` or `--kind` to scope it down, and pass both to intersect them. Values within a flag are a union. A requested `--user` with no matching assignments is reported as a warning and the export continues with whoever matched, so a mistyped username never masquerades as a clean empty file.

### `sf ps apply`

```
USAGE
  $ sf ps apply -o <org> -f <glob>... [--mode <value>] [--max-deletes <n>]
                [--dry-run] [--show-unchanged] [--no-prompt] [--strict] [--json]

FLAGS
  -o, --target-org=<org>  (required) Org to reconcile.
  -f, --file=<glob>...    (required) YAML file(s) to read. Repeatable, globs are expanded by the plugin.
      --mode=<value>      additive | destructive | sync   [default: additive]
      --max-deletes=<n>   Abort if the run would remove more than n assignments. [default: 50]
      --dry-run           Resolve and diff, print what would happen, change nothing.
      --show-unchanged    List assignments that already match, instead of only counting them.
      --no-prompt         Skip the removal confirmation prompt (for CI).
      --strict            Treat warnings as errors.
```

`apply` recomputes from the files every run: it re-reads the YAML, re-resolves every reference to an org id, and re-diffs against live state, then acts per `--mode`. Run `plan` shortly before `apply`, since an edited file, a renamed permission set, or another admin's change between the two shifts the outcome.

DML goes through the sObject Collections API, so a partial failure is reported per record instead of rolling back the rest.

> [!CAUTION]
> `--mode sync` and `--mode destructive` revoke access. Removals always prompt for confirmation unless `--no-prompt` is set, and are hard-capped by `--max-deletes`, so a bad merge can't unassign your whole org.

## Org permissions

What does the user behind `--target-org` need?

| Command | API Enabled | View Setup and Configuration | View Roles and Role Hierarchy | Assign Permission Sets |
| --- | :---: | :---: | :---: | :---: |
| `sf ps check` | - | - | - | - |
| `sf ps validate` | ✓ | ✓ | ✓ | - |
| `sf ps plan` | ✓ | ✓ | ✓ | - |
| `sf ps export` | ✓ | ✓ | ✓ | - |
| `sf ps apply` | ✓ | ✓ | ✓ | ✓ |

✓ Required, - Not required. `Manage Users` is not required, not even for permission set licenses.

Two permission sets ship with this repo, so a pull request job cannot change the org:

- [PS_Plugin_Read](setup/permissionsets/PS_Plugin_Read.permissionset-meta.xml): reads permission set assignments.
- [PS_Plugin_Write](setup/permissionsets/PS_Plugin_Write.permissionset-meta.xml): reads and modifies permission set assignments.

## GitHub Actions

Two workflows: review pull requests, then apply on merge. Point the review workflow at a `PS_Plugin_Read` user and only the merge workflow at `PS_Plugin_Write`.

**1. Review pull requests to main:**

```yaml
# .github/workflows/permissions-review.yml
name: permissions-review

on:
  pull_request:
    branches: [main]
    paths:
      - "permissions/**"

jobs:
  review:
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

      - name: Log in to the org
        run: echo '${{ secrets.SFDX_AUTH_URL }}' | sf org login sfdx-url --sfdx-url-stdin --alias prod

      - name: Validate against the org
        run: sf ps validate --file "permissions/*.yml" --target-org prod

      - name: Show the diff reviewers are approving
        run: sf ps plan --file "permissions/*.yml" --target-org prod --mode sync
```

Want a review that needs no org and no secrets? Drop the last three steps: what's left is the file check, and it runs on a fork's pull request too.

**2. Apply on merge to main:**

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

Both workflows share one secret. Get the auth url once with `sf org display --verbose --target-org prod`, copy the `Sfdx Auth Url` value, and save it as a repository secret named `SFDX_AUTH_URL`.

## Versioning

Releases follow [semantic versioning](https://semver.org). Publishing is a manual decision: a push to `main` builds and tests, and nothing reaches npm until a release exists. Creating the release is what triggers CI to build, stamp the version from the tag, publish it with provenance, and smoke-test the result.

| Bump | When | Example tag |
| --- | --- | --- |
| patch | bug fix, no behavior change | `v0.1.1` |
| minor | new backward-compatible feature | `v0.2.0` |
| major | breaking change to a command, flag, or the YAML schema | `v1.0.0` |

**While on `0.x`,** breaking changes may ship in any release, including minor bumps. The table above describes the contract that takes effect at `v1.0.0`.

Cut a release with a tag off `main`:

```bash
gh release create v0.2.0 --target main --title v0.2.0 --notes "Add ps export"
```

Every published version carries the `latest` dist-tag, so `sf plugins install sf-plugin-permission-sets` installs the newest release. There is no rolling `dev` channel, because the release gate creates a scratch org and a Dev Hub's allocation is daily.

## Architecture

The plugin is layered: commands are thin oclif classes, services hold the orchestration, core holds the pure primitives, and an adapter isolates the Salesforce SDK. The commands are also slices of one pipeline: `apply` runs `plan`, and `plan` runs `check`, so the three can never disagree about what a set of files means.

See [ARCHITECTURE.md](ARCHITECTURE.md) for the layers, the core modules, and how each command composes that pipeline.

## Development

```bash
npm ci
npm run build     # compile and lint
npm test          # everything that needs no org
npm run test:unit # the service specs alone, gated at 100% coverage
npm run test:nut  # the command specs alone, no org needed
npm run test:org  # the command specs that create a scratch org
```

Two suites, split by what they drive. `npm test` is both of the ones that need no credentials, which is exactly what runs on a fork's pull request.

`npm run test:unit` covers `src/services/` alone, at 100% statements, branches, functions, and lines: `test/unit/**/*.test.ts`, mocha, and chai. A service's only boundaries are the org, the confirmation prompt, and the filesystem, so the first two are hand-written fakes of the ports the service already takes, and the third is a real temp directory. Nothing is module-mocked. The gate is a c8 config of its own ([`.c8rc.services.json`](.c8rc.services.json)), so a service branch that no test reaches fails the run rather than showing up as a number nobody reads.

See [UNIT_TESTING.md](UNIT_TESTING.md) for why the suite reads `lib/` rather than `src/`, what each service needs for 100%, and what the Salesforce CLI ecosystem does differently.

The rest are NUTs, the Salesforce CLI team's convention for testing a plugin's commands: `test/nut/**/*.nut.ts`, mocha, and [`@salesforce/cli-plugins-testkit`](https://github.com/salesforcecli/cli-plugins-testkit). They are black box throughout. The plugin is driven through its own `bin/run.js`, every assertion is on what a command printed and the code it exited with, and the only thing a test takes from `src/` is a type.

`npm run test:nut` covers all five commands without touching an org: exit codes, the `--json` envelope, the flags, and the `--help` text.

`npm run test:org` needs a Dev Hub. It creates one scratch org from `test/nut/project`, seeds the state the assertions expect (drift, a removal, an expiring assignment), and deletes it when the run ends. Building the org rather than borrowing one is what makes the counts exact and `apply` safe to exercise end to end. Give it a hub nobody uses by hand, because the scratch org allocation is daily and per hub.

In CI those org tests are skipped on a push, so that a run of commits cannot spend the allocation the next release needs. They run on a pull request, on a manual dispatch, on the release gate, and every Monday at 06:00 UTC. The schedule is what keeps a break from waiting for a release to be found, since work here lands straight on `main` and there is no pull request to catch it.

Copy `.env.example` to `.env` and fill in one of the two:

| Variable | What it is |
| --- | --- |
| `TESTKIT_HUB_USERNAME` | An already-authenticated Dev Hub. |
| `TESTKIT_AUTH_URL` | An sfdx auth url for that Dev Hub. What CI passes in, from a repository secret of the same name. |

Set the CI secret without the credential passing through a terminal:

```bash
sf org display --verbose --json --target-org <your-devhub> \
  | jq -r '.result.sfdxAuthUrl' \
  | gh secret set TESTKIT_AUTH_URL
```

`npm run coverage` writes `coverage/lcov.info` and a browsable `coverage/lcov-report/`. It runs both suites, so it needs a Dev Hub and spends one scratch org. Nothing under test runs in the test process, so the number comes from the `NODE_V8_COVERAGE` dumps that `scripts/prune-coverage.js` trims down to this plugin before `c8` merges them.

The badge at the top comes from the `test` job in [ci.yml](.github/workflows/ci.yml), which runs both suites in one runner under `NODE_V8_COVERAGE`, prunes the dumps, and hands the merged `lcov.info` to Codecov with the `CODECOV_TOKEN` repository secret. The upload is skipped on a push, where the org suite is skipped too, so a number measured from the offline suite alone never reaches the badge. The release gate is one of the runs that does upload, which is why the number describes the version you can install and a release spends one scratch org rather than two. There the upload step is `continue-on-error`, so a failure cannot keep a version from shipping. On every other trigger that same failure turns the run red. Treat the number the same way, a diagnostic and never a target, because a line that ran is not a line that was verified.

### Running the org tests without creating a scratch org

A hub's scratch org allocation is daily, so iterating on an org spec can run it out. `TESTKIT_ORG_USERNAME` makes the testkit reuse an org you already have instead of creating one, and it also stops the session from deleting it:

```bash
TESTKIT_ORG_USERNAME=<username> npx mocha "test/nut/plan/org/undeclared-target.nut.ts"
```

Point it at an org you can throw away, and read what it does to it first. The setup deploys `test/nut/project` (ten `PS_Nut_*` permission sets), creates a user, and seeds assignments, and none of that is cleaned up, because the cleanup was the org being deleted. A second full run against the same org will also fail rather than pass: the `apply` specs assert on a grant landing, and it has already landed. Treat this as a way to watch one spec while working on it, never as a way to run the suite. CI and `npm run test:org` leave the variable unset and build the org they assert against.

Set `DEBUG=testkit:*` to see every command the testkit runs.

## License

BSD-3-Clause © Isaac Ferreira
