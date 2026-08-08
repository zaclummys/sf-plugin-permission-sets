# Unit testing

How `test/unit/**/*.test.ts` works and why it is built this way. It covers `src/core/`,
`src/services/`, and `src/ui/`, gated at 100% statements, branches, functions, and lines. Those
are the three layers a test can reach without spawning the CLI or touching an org, which is what
lets the gate run on every push. `src/commands/` and `src/adapters/` belong to the NUTs, which
[README.md](README.md) and CLAUDE.md document.

The survey in section 1 is the Salesforce CLI ecosystem as it stands in 2026. Every decision in
section 2 was run in this repo before being written down.

## 1. What the Salesforce ecosystem does

### Layout and naming

The official guidance is to split by file extension inside one `test/` tree: `*.test.ts` for unit
tests, `*.nut.ts` for NUTs, so one mocha glob can pick either. Every plugin surveyed follows it:

- `salesforcecli/plugin-limits`: `test/commands/display.test.ts` beside `display.nut.ts`.
- `salesforcecli/plugin-info`: `test/shared/*.test.ts` for plain modules, `test/nuts/` for NUTs.
- `salesforcecli/plugin-org`: `test/shared/orgListUtil.test.ts`, `test/nut/**`.
- `salesforcecli/plugin-data`: `test/api/**/*.test.ts` for the non-command API layer.

The closest analogue to this repo's pure layers is `plugin-info/test/shared/` and
`plugin-data/test/api/`: plain classes and functions, tested directly, no oclif involved.

### Stack

| Piece | What they use | Notes |
| --- | --- | --- |
| Runner | mocha | `nyc mocha "test/**/*.test.ts"` under wireit |
| Assertions | chai (`expect`, `assert`) | chai 6 is ESM only |
| Doubles | sinon, `sinon.createSandbox()` | restored in `afterEach` |
| Typed doubles | `@salesforce/ts-sinon` | `stubMethod`, `spyMethod`, `stubInterface`, `fromStub` |
| Assertion sugar | `sinon-chai` | `chaiUse(SinonChai)`, optional |
| Org fakes | `@salesforce/core/testSetup` | `TestContext`, `MockTestOrgData`, `$$.SANDBOX` |
| Command UX fakes | `stubSfCommandUx` from `@salesforce/sf-plugins-core` | used by the `sf dev generate plugin` template |
| Coverage | nyc via `@salesforce/dev-config/nyc` | thresholds at 90 across the board |
| TS execution | `ts-node/esm` loader in `.mocharc.json` | `{"node-option": ["loader=ts-node/esm"]}` |

The generated template for a brand new plugin (`plugin-dev/templates/test/esm-command.test.ts.ejs`)
is a command-level unit test: `new TestContext()`, `stubSfCommandUx($$.SANDBOX)`,
`await Command.run([])`, assert on the captured `log` calls, `$$.restore()` in `afterEach`.

### What this repo does not take from it

- **`TestContext` / `MockTestOrgData`.** Those exist to fake `AuthInfo`, `Org`, and `Connection`
  for code that reaches `@salesforce/core` directly. Nothing in the three layers under test does:
  services take an injected `OrgClient` port, and core and ui import nothing at all beyond `yaml`,
  `zod`, and `@oclif/core`'s `ux`. The whole authentication fake is dead weight.
- **`stubSfCommandUx`.** Command-layer only, and commands belong to the NUTs.
- **`ts-node/esm`.** See 2.1, this repo already runs `.ts` natively.
- **nyc.** This repo is on c8, driven by `NODE_V8_COVERAGE`.
- **`@salesforce/ts-sinon`.** Still published (1.4.36, June 2026) but it declares `sinon: ^5.1.1`
  as a real dependency while current sinon is 22, so installing it drags a second sinon into
  `node_modules` whose `SinonStub` types are not the ones your sandbox produces. Its value is
  `stubInterface<T>()`, which is one small helper we can write ourselves against an interface
  we own.

## 2. How the suite is built

### 2.1 Tests import `lib/`, not `src/`

Node 24 strips types natively and this repo has no loader (`.mocharc.json` carries no `require`
and no `node-option`). Native type stripping does **not** rewrite a `.js` specifier back to the
`.ts` on disk:

```
Error [ERR_MODULE_NOT_FOUND]: Cannot find module '.../dep.js' imported from '.../main.ts'
```

Every file under `src/` imports its neighbours as `'../core/index.js'`, so a test cannot import
`src/core/diff.ts` without adding `ts-node/esm` or `tsx` back. The alternative is what the NUTs
already do: read the working tree's `lib/`.

```ts
import { Diff, formatDiff } from '../../../lib/core/index.js';
import type { OrgClient } from '../../lib/services/adapters/index.js';
```

Consequences:

- `test:unit` depends on `compile`, exactly like `test:nut` and `test:org` already do.
- Types come from the emitted `.d.ts`, which is the published contract, so a test cannot reach a
  symbol the barrel does not export. That is a feature.
- c8 remaps the result back to `src/**/*.ts` through the source maps the build already emits, so
  the report names the file you edit.
- `ResolutionService` is the one exception to the barrel rule: it is not in `services/index.ts`,
  because inside `src/` only its own directory uses it, so `test/unit/resolution/*` imports
  `lib/services/resolution.js` directly.

### 2.2 Test files must use erasable syntax only

Specs and helpers are run by the same type stripper, which cannot emit code:

```
SyntaxError [ERR_UNSUPPORTED_TYPESCRIPT_SYNTAX]: TypeScript parameter property is not
supported in strip-only mode
```

So no parameter properties (`constructor(private readonly x: T) {}`), no `enum`, no `namespace`
with runtime content. Assign in the constructor body instead. `src/` is free of this because tsc
compiles it, which is why the rule bites only in `test/`.

### 2.3 Sociable units: fake the port, keep the pure layers real

`core/` and `ui/` are what the services are made of, and faking either would test the mock. A
service has exactly three boundaries:

| Boundary | Double |
| --- | --- |
| `OrgClient` | `test/unit/fake-org-client.ts`, answers from data and records every call |
| `ConfirmDeletions` | `test/unit/confirmations.ts`, one fixed answer and a call log |
| The filesystem | `test/unit/workspace.ts`, a real `mkdtemp` directory |

No sinon. Official plugins reach for it because they stub modules and `@salesforce/core` classes,
which is exactly what a hand-rolled port lets us avoid. `FakeOrgClient` is deliberately dumb: it
never filters by the argument it was handed, so what a spec puts in the state is what the service
sees, and a count in an assertion is exact rather than derived. `test/unit/builders.ts` is
separate from it, so a `core/` spec can build a `DesiredAssignment` without pulling in the org.

### 2.4 Job files are files

`CheckService` reads YAML off disk, so the input is YAML on disk. It lives in
`test/unit/fixtures/*.yml`, reached through `jobFile(name)`, never as a template literal inside a
`.ts`. The fixtures are separate from `test/fixtures/`, which the NUTs own and pin exact counts
against.

`one-assignment.yml` and `expiring.yml` double as the expected output of `serializeAssignments`,
read back through `jobFileText(name)`, which makes those assertions a round trip rather than a
restatement of the serializer.

`ExportService` is the other direction: it writes, so its specs assert on a real file under the
workspace, including the `mkdir(..., { recursive: true })` branch for a path whose directory does
not exist yet.

### 2.5 The two c8 configs

There are two coverage artifacts with different jobs, so there are two configs and both are named
on the command line. Neither is `.c8rc.json`, because that is the file c8 picks up implicitly, and
an implicit config is one a stray `npx c8` inherits by accident.

| File | Job | Who reads it |
| --- | --- | --- |
| `.c8rc.gate.json` | fail the build under 100% over core, services, and ui | `npm run test:unit`, on every push |
| `.c8rc.report.json` | merge every suite into one lcov, no threshold | `npm run coverage` and the codecov upload in CI |

Both share three settings that took a while to get right:

- `all: true`. Without it c8 reports only the files that were loaded, so a file no test imports
  shows 100% by absence rather than 0% by fact.
- `extension: [".js"]`. With `all` on and no extension list, c8 walks the emitted `.d.ts` files
  too and reports them as uncovered source. Restricting to `.js` measures what actually runs.
- The exclusions are the modules with no runtime behaviour: `lib/core/model.js` and
  `lib/services/adapters/org-client.js` are pure interfaces that compile to `export {};`, and
  `lib/index.js` is the oclif entry stub. With `all` on they would each report 0% forever.

The gate owns `.unit-coverage` and cleans it on every run. Sharing `coverage-dumps` with the NUTs
was tried and rejected: a stale dump from a previous run kept the gate green after a spec was
deleted, which is a gate that cannot fail. It has since been seen to fail: removing
`test/unit/core/report/expirations.test.ts` exits 1 and names the lines it stopped reaching.

### 2.6 Wiring

| File | What it holds |
| --- | --- |
| `package.json` | `test:unit` (wireit, depends on `compile`) and `coverage:unit` |
| `.mocharc.unit.json` | the spec glob and the timeout, named once for both of those |
| `.c8rc.gate.json`, `.c8rc.report.json` | see 2.5 |
| `test/tsconfig.json` | `./unit/**/*.ts` in `include` |
| `eslint.config.js` | the no-conditionals, no-loops rule extended to `test/**/*.test.ts` |
| `.github/workflows/ci.yml` | `npm test` runs the gate and the NUTs together, before anything needing an org |

The unit run needs a mocha config of its own because it disagrees with `.mocharc.json` on the
timeout: 600000 is right for a NUT that spawns the CLI and wrong for a spec measured in
milliseconds. Carrying `spec` there too keeps the glob in one place, since the gate and
`coverage:unit` run the same files for different reasons. The two NUT globs stay as command line
arguments, because those runs agree with `.mocharc.json` on everything but the glob.

`TZ=UTC` is pinned in the wireit `env`, because expirations are instants and a suite that passes
in São Paulo has to pass in a UTC container.

`scripts/coverage.sh` is the other report: it runs all three suites under one `NODE_V8_COVERAGE`
and merges them. It lives in a file rather than in `package.json` because it keeps the
collection's exit status and re-raises it after the report, so a broken suite still renders a
report and still fails.

## 3. What the gate changed in `src/`

Chasing the last few percent is what the gate is for. Almost every line it could not reach turned
out to be defensive code the pipeline cannot execute, and the rule that sorted them was this: a
guard on a **local invariant the same function builds** comes out, a guard on **input a caller
supplies** stays and gets a test.

Removed:

- `TargetName.equals()` had no caller anywhere in `src/`.
- `kindForScopeKey` searched `kindKeys` and threw on a miss, for a `ScopeKey` union that is closed.
  It is a lookup table now, and there is no miss to answer for.
- The `=== 0` arm of the comparators in `report.ts` and `serialize.ts`. Both sort a collection
  already de-duplicated by key, so no two rows can compare equal.
- The two empty-bucket guards in `formatDiff`. `bucketFor` is only ever called immediately before
  a write, so a bucket that exists has content, and the invariant is stated there now.

Kept and tested directly:

- `Expiration.of` throwing on text that is not a datetime.
- `diffAssignments` de-duplicating a desired assignment it is handed twice.
- `colourFindings` leaving a line alone when it has no `:` separator. That guard is not redundant:
  without it, `errorX` slices to `error`, matches a level, and the function rebuilds the line as
  `error:errorX`.
- The `(root)` fallback in `schema.ts`, reachable with a YAML document that is a bare scalar.

The gate also forced the layering fix that was overdue: `core/load.ts` did its own `readFile` and
`globby` inside a layer CLAUDE.md documents as pure. The disk half moved into `CheckService`,
which is where `ExportService` already writes from, `core/load.ts` is now `checkContent` and
`mergeAssignments` over text, and eslint enforces it: `core/` may not import `node:*` or `globby`.

## 4. Coverage map

`core/`

- `diff.ts` and the `Diff`/`ScopedChange` aggregates: add, update, remove, unchanged, the
  duplicate-desired guard, case folding, and every mode through `scopeTo` including its drift.
- `expiration.ts`: canonical form, offset spellings, sub-second truncation, `same` on each of the
  four null combinations, and the throw.
- `finding.ts`: the counts, `blocks` under both strictness values, `concat`, and `format` with and
  without a line number.
- `load.ts`: `checkContent` through all three stages, `mergeAssignments` union and de-duplication,
  `mergeFindings` ordering.
- `report.ts`: line shapes, expirations and transitions, assignee and target and kind ordering,
  and the mode plus `showUnchanged` scoping.
- `outcome.ts`, `resolve.ts`, `schema.ts`, `scope-key.ts`, `serialize.ts`, `username.ts`,
  `target-name.ts`: their own contracts, directly.

`services/`

- `CheckService`: files matched, assignments read, warnings, errors, `strict` both ways, no match.
- `ValidateService`: resolved, unknown user, inactive user, and the merge order of the two stages.
- `ExportService`: to stdout, to a file, to a directory that does not exist, and every arm of the
  filter.
- `PlanService`: aborting before the org, aborting after resolution, and each of add, update,
  remove, and no-op.
- `ResolutionService` and `Resolution`: one lookup per kind, the empty short circuits, the managed
  target and assignee sets, and the `?? ''` fallbacks.
- `ApplyService`: invalid, the delete cap and its boundary, dry run, declined, applied, each of
  the three operations, and each `ReconcileMode`.

`ui/`

- `colourDiff` and `colourFindings` on every marker and level, plus the two lines they must pass
  through untouched. The suite runs under `NO_COLOR`, where `ux.colorize` is the identity, so what
  it pins is that painting never alters a line's text, which is the property every NUT assertion
  rests on. The colour itself is `test/nut/check/colour.nut.ts`, which spawns the CLI.

## 5. Traps

- A `.js` specifier in a spec must point at a real `.js` file. Under `lib/` it always does. A
  helper is imported by its real name, `'../workspace.ts'`.
- `Username` and `TargetName` hold a private field. Never `deep.equal` them against a literal:
  compare `asKey()` or `toString()`.
- `Findings`, `Diff`, and `Outcomes` expose methods, not getters. `findings.errors()` runs a
  filter, so bind the result before asserting on it twice.
- Narrowing a discriminated union in a spec needs chai's `assert(plan.status === 'planned')`,
  because `expect(...).to.equal(...)` does not narrow and an `if` is banned in a test body.
- Excluding a file by its `.js` name is not enough when `all` is on and no `extension` list is
  given, because the `.d.ts` beside it is picked up separately.
- `execCmd` from the testkit has no place here. It spawns the CLI, which is what a NUT is for.
- A unit test must not assert on text from `messages/`. That is the command layer's contract, and
  the NUTs already pin it.

## Sources

- [sfdx-core TEST_SETUP.md](https://github.com/forcedotcom/sfdx-core/blob/main/TEST_SETUP.md)
- [salesforcecli/cli-plugins-testkit](https://github.com/salesforcecli/cli-plugins-testkit)
- [Salesforce CLI Plugin Developer Guide: Use Libraries](https://developer.salesforce.com/docs/platform/salesforce-cli-plugin/guide/use-libraries.html)
- [salesforcecli/plugin-dev unit test template](https://github.com/salesforcecli/plugin-dev/blob/main/templates/test/esm-command.test.ts.ejs)
- [salesforcecli/plugin-info test/shared](https://github.com/salesforcecli/plugin-info/tree/main/test/shared)
- [salesforcecli/plugin-org test/shared/orgListUtil.test.ts](https://github.com/salesforcecli/plugin-org/blob/main/test/shared/orgListUtil.test.ts)
- [salesforcecli/plugin-data test/api](https://github.com/salesforcecli/plugin-data/tree/main/test/api)
- [salesforcecli/plugin-limits package.json](https://github.com/salesforcecli/plugin-limits/blob/main/package.json)
- [@salesforce/dev-config nyc thresholds](https://github.com/forcedotcom/sfdx-dev-packages/blob/main/packages/dev-config/nyc.json)
- [@salesforce/ts-sinon](https://github.com/forcedotcom/sfdx-dev-packages/tree/main/packages/ts-sinon)
- [c8](https://github.com/bcoe/c8)
- [Mocha: TypeScript](https://mochajs.org/explainers/typescript/)
- [Node.js: Running TypeScript Natively](https://nodejs.org/learn/typescript/run-natively)
