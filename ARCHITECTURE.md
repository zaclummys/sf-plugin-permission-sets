# Architecture

The plugin is layered so every command reuses the same core. The dependency direction is strict: commands depend on services, services depend on core, and nothing depends the other way.

## Layers

- **Commands** (`src/commands/ps/`): oclif only. They parse flags, construct the service (wiring in the org adapter when the command needs one), render output, and set the exit code.
- **Services** (`src/services/`): one per command (`check`, `validate`, `export`, `plan`, and `apply`), plus `resolution`, which the org-facing ones share. Each is a class whose constructor takes only its dependencies (the org client, a confirmation callback), while the per-invocation inputs are `run()` parameters, so one instance serves any number of runs. A service also declares the ports it needs from the outside, like the `OrgClient` interface its adapter implements.
- **Core** (`src/core/`): the reusable building blocks. Pure, with no `@salesforce/*` imports, so every piece is testable on its own.
- **Adapters** (`src/adapters/`): the boundary to the outside world. `ConnectionOrgClient` implements the `OrgClient` port with a Salesforce `Connection`, and owns all the SOQL and SObject detail: the query text in `soql`, the Collections API grouping and chunking in `dml`. Services depend on the port, not the SDK.

Where one command's work contains another's, the service composes rather than repeats it: `apply` runs `plan`, and `plan` runs `check`. Each stage of the pipeline is owned in exactly one place, which is why `apply --dry-run` and `plan` cannot drift apart.

## Core modules

| Module | Responsibility |
| --- | --- |
| `model` | Shared domain types (assignment, org). |
| `username`, `target-name` | The identifiers, owning the org's case-insensitive comparison so no caller has to remember it. |
| `expiration` | A grant's expiration as an instant, owning the comparison (to the second) and the one canonical UTC form everything written comes back in. |
| `finding` | The finding type and code vocabulary, plus the constructors that raise each one. `Findings` is the collection, and it answers everything asked of a run's findings: the counts, the merge, the rendering, and whether they block the run under `--strict`. |
| `outcome` | The per-record result of one add, update, or remove. `Outcomes` is the collection, answering what the org accepted per operation and what it rejected. |
| `schema` | The zod contract for a file, plus validation. |
| `parse` | File text to an object, with YAML and duplicate-key errors. |
| `scope-key` | The one place the (kind, file scope key) pairing is written down, shared by `normalize`, `serialize`, and `report`. Adding a scope means adding a row. |
| `normalize` | A validated file to canonical `(assignee, kind, target)` tuples, plus structural findings. |
| `serialize` | Canonical tuples back to a user-keyed YAML document (the inverse of `normalize`). |
| `load` | Expand globs, run parse then validate then normalize per file, and merge by union. |
| `resolve` | Pure rules that turn declared references and the org's answers into findings, plus id lookups for assigning. No SOQL: the adapter owns that. |
| `diff` | The desired model against the org's current state, producing adds, updates, removes, and unchanged. The `Diff` it returns also scopes itself to a reconcile mode, reporting what that mode acts on and the drift it leaves alone. |
| `report` | Format a diff as a plan body. |

## The pipeline per command

Every command is a slice of one pipeline: **load**, **resolve**, **fetch**, **diff**, **apply**.

| Command | Stages |
| --- | --- |
| `check` | load |
| `validate` | load, resolve |
| `plan` | load, resolve, fetch, diff |
| `apply` | load, resolve, fetch, diff, apply |
| `export` | fetch, serialize |

`validate` looks the declared references up through the `OrgClient` port (the adapter builds the SOQL) and evaluates the org's answers with resolve's pure rules. `export` runs in the opposite direction: it fetches the org's current assignments and serializes them straight back to YAML, skipping load entirely. `apply` carries the plan through to the DML, inserting and deleting through the Collections API per the mode, guarded by `--max-deletes` and a confirmation.

## Barrels

Each layer has an `index.ts` that re-exports only the symbols used outside that directory. Consumers import from the barrel (`../../core/index.js`), while a file inside the directory imports its siblings directly, which is what keeps the barrel from creating cycles. This is ESM with NodeNext resolution, so every specifier carries the explicit `.js` extension and the full path.
