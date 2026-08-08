# Unit testing the services layer

How `test/unit/**/*.test.ts` works and why it is built this way. Scope: `src/services/` only,
gated at 100% statements, branches, functions, and lines. The NUTs cover the commands and are
documented in [README.md](README.md) and CLAUDE.md instead.

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

The closest analogue to this repo's `services/` is `plugin-info/test/shared/` and
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
  for code that reaches `@salesforce/core` directly. Services here never import `@salesforce/*`:
  they take an injected `OrgClient` port. The whole authentication fake is dead weight.
- **`stubSfCommandUx`.** Command-layer only, and commands are out of scope.
- **`ts-node/esm`.** See 2.1, this repo already runs `.ts` natively.
- **nyc.** This repo is on c8, driven by `NODE_V8_COVERAGE` and `.c8rc.json`.
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
`src/services/plan.ts` without adding `ts-node/esm` or `tsx` back. The alternative is what the
NUTs already do, and what `.c8rc.json` already measures: read the working tree's `lib/`.

```ts
import { PlanService } from '../../../lib/services/index.js';
import type { OrgClient } from '../../lib/services/adapters/index.js';
import { Username, TargetName } from '../../lib/core/index.js';
```

Consequences:

- `test:unit` depends on `compile`, exactly like `test` and `test:org` already do.
- Types come from the emitted `.d.ts`, which is the published contract, so a test cannot reach a
  symbol the barrel does not export. That is a feature.
- c8 remaps the result back to `src/services/*.ts` through the source maps the build already
  emits, so the report names the file you edit.
- `ResolutionService` is the one exception to the barrel rule: it is not in
  `services/index.ts`, because inside `src/` only its own directory uses it, so
  `test/unit/resolution/*` imports `lib/services/resolution.js` directly.

### 2.2 Test files must use erasable syntax only

Specs and helpers are run by the same type stripper, which cannot emit code:

```
SyntaxError [ERR_UNSUPPORTED_TYPESCRIPT_SYNTAX]: TypeScript parameter property is not
supported in strip-only mode
```

So no parameter properties (`constructor(private readonly x: T) {}`), no `enum`, no `namespace`
with runtime content. Assign in the constructor body instead. `src/` is free of this because tsc
compiles it, which is why the rule bites only in `test/`.

### 2.3 Sociable units: fake the port, keep `core/` real

`core/` is pure, synchronous, and deterministic. Faking it would test the mock. A service has
exactly three boundaries:

| Boundary | Double |
| --- | --- |
| `OrgClient` | `test/unit/fake-org-client.ts`, answers from data and records every call |
| `ConfirmDeletions` | `test/unit/confirmations.ts`, one fixed answer and a call log |
| The filesystem | `test/unit/workspace.ts`, a real `mkdtemp` directory |

No sinon. Official plugins reach for it because they stub modules and `@salesforce/core` classes,
which is exactly what a hand-rolled port lets us avoid. `FakeOrgClient` is deliberately dumb: it
never filters by the argument it was handed, so what a spec puts in the state is what the service
sees, and a count in an assertion is exact rather than derived.

### 2.4 Job files are files

Every service except `ExportService` starts at `loadFiles(files)`, so the input is YAML on disk.
It lives in `test/unit/fixtures/*.yml`, reached through `jobFile(name)`, never as a template
literal inside a `.ts`. The fixtures are separate from `test/fixtures/`, which the NUTs own and
assert exact counts against.

`one-assignment.yml` doubles as the expected output of `serializeAssignments`, which is what makes
the export assertion a round trip rather than a restatement of the serializer.

`ExportService` is the other direction: it writes, so its specs assert on a real file under the
workspace, including the `mkdir(..., { recursive: true })` branch for a path whose directory does
not exist yet.

### 2.5 The coverage gate

`.c8rc.services.json`, applied by `npm run test:unit`:

- `include: ["lib/services/**"]` filters the V8 dump **before** source-map remapping, which is why
  it names `lib/` while the report prints `src/services/*.ts`.
- `all: true` stops a service file that no test imports from vanishing from the report instead of
  failing it.
- `exclude: ["lib/services/adapters/**"]` is required once `all` is on: `org-client.ts` is a pure
  interface and compiles to `export {};`, so it would report 0% forever.
- `temp-directory: ".unit-coverage"`, cleaned on every run. Sharing `coverage-dumps` with the NUTs
  was tried and rejected: a stale dump from a previous run kept the gate green after a spec was
  deleted, which is a gate that cannot fail.

The gate has been seen to fail. Removing `test/unit/apply/dry-run.test.ts` exits 1 and names
`apply.ts:97-101`.

`npm run coverage` and the CI report are a separate artifact: `coverage:unit` runs the same specs
under the shared `NODE_V8_COVERAGE`, so the repo-wide lcov counts them alongside the NUTs.

### 2.6 Wiring

| File | What it holds |
| --- | --- |
| `package.json` | `test:unit` (wireit, depends on `compile`) and `coverage:unit` |
| `.mocharc.unit.json` | the spec glob and the timeout, named once for both of those |
| `.c8rc.services.json` | the gate |
| `test/tsconfig.json` | `./unit/**/*.ts` in `include` |
| `eslint.config.js` | the no-conditionals, no-loops rule extended to `test/**/*.test.ts` |
| `.github/workflows/ci.yml` | `test:unit` first, before anything that needs the CLI or an org |

The unit run needs a config file of its own because it disagrees with `.mocharc.json` on the
timeout: 600000 is right for a NUT that spawns the CLI and wrong for a spec that should finish in
milliseconds. Having it also carry `spec` is what keeps the glob in one place, since the gate and
`coverage:unit` both run the same files for different reasons. The two NUT globs stay as command
line arguments, because those runs agree with `.mocharc.json` on everything but the glob.

`TZ=UTC` is pinned in the wireit `env`, because expirations are instants and a suite that passes
in São Paulo has to pass in a UTC container.

`npm run coverage` is the other report and not this gate: `scripts/coverage.sh` runs all three
suites under one `NODE_V8_COVERAGE` and merges them. It lives in a file rather than in
`package.json` because it keeps the collection's exit status and re-raises it at the end, so a
broken suite still renders a report and still fails.

## 3. Coverage map

What each service needs for 100%, read off the branches in the source.

**`CheckService`** (`check/`)

- clean file, `strict` defaulted: `failed` false, no findings.
- a repeated target: one warning, `failed` false, the assignment kept once.
- the same file with `strict` true: `failed` true.
- a schema violation: `failed` true either way, no assignments read.
- no file matched, and malformed YAML: `failed` true.

**`ValidateService`** (`validate/`)

- every reference resolves: `failed` false.
- an unknown user, and an inactive one: `failed` true.
- a file warning plus an org error: both present, file finding first.

**`ExportService`** (`export/`)

- no output file: `outputFile` null, the document returned.
- an output file whose directory does not exist: created, contents match.
- two assignments for one user: `users` 1, `assignments` 2.
- a filter naming a user with nothing: that name in `unmatchedUsers`, spelled as requested.
- a filter naming a user whose case differs from the org: not unmatched, because comparison goes
  through `asKey()`.
- a filter naming no user at all, and no filter: `unmatchedUsers` empty. Two separate branches.

**`PlanService`** (`plan/`)

- load errors, and load warnings under `strict`: status `invalid` before the org is touched.
- resolution errors: status `invalid`, and `listCurrentAssignments` never called.
- everything resolves: status `planned`, with the managed targets and the managed assignees both
  read, plus an addition, an update, a removal, and a no-op.

**`ResolutionService` and `Resolution`** (`resolution/`)

- no assignments at all: `findUsers` never called.
- one kind declared: the other two finders short-circuit on `targets.length === 0`.
- all three kinds: every arm of `findTargetsOfKind`.
- `managedAssignees`: a user that resolved, one that did not, the same kind twice, two kinds.
- `resolveAdditions`: ids attached, and the `?? ''` fallback for an unresolved user, an unresolved
  target, and a target whose name is not unique in the org.

**`ApplyService`** (`apply/`)

- invalid plan: no DML, no outcomes.
- removals over `maxDeletes`: `max-deletes-exceeded`, no confirmation asked. Exactly on the cap
  goes ahead, which is the boundary the `>` is written at.
- `dryRun`: no DML, no confirmation, the diff still reported.
- removals present, declined: nothing written.
- removals present, confirmed: asked with the count.
- no removals: never asked.
- `executeResolved` has six branches, one empty and one non-empty per operation. Additions,
  updates, and removals each get a spec, and a mode run covers two at once.
- one run per `ReconcileMode`.

## 4. Traps

- A `.js` specifier in a spec must point at a real `.js` file. Under `lib/` it always does. A
  helper is imported by its real name, `'../workspace.ts'`.
- `Username` and `TargetName` hold a private field. Never `deep.equal` them against a literal:
  compare `asKey()` or `toString()`.
- `Findings`, `Diff`, and `Outcomes` expose methods, not getters. `findings.errors()` runs a
  filter, so bind the result before asserting on it twice.
- Narrowing a discriminated union in a spec needs chai's `assert(plan.status === 'planned')`,
  because `expect(...).to.equal(...)` does not narrow and an `if` is banned in a test body.
- c8 without `all` only reports files that were loaded, so a new service nobody imports would show
  100% by absence.
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
