# Conventions

Guidelines for working in this repo (an `sf` CLI plugin). These override default behavior.

## Product mindset (DX & UX)

- Treat this plugin as a product, not just code. Weigh developer experience and user experience in every change, starting from the operator's workflow and pain points.
- Design for real usage: scoping and filtering flags, sensible defaults, safe destructive actions (confirmations and guards), clear output and error messages, stdout and pipe friendliness, and round-trip ergonomics between commands.
- When reviewing or building a command, call out UX and DX gaps proactively and recommend the highest-value improvement rather than listing every option.

## Architecture & layering

- Strict dependency direction: **commands → services → core**. Never the reverse.
- `src/core/` stays pure: no `@salesforce/*` imports, no I/O, no CLI concerns. Plain data, functions, and the domain classes below.
- `src/services/` may use `@salesforce/core` and talk to the org (through an injected client).
- `src/commands/` is the thin `SfCommand` layer: parse flags, construct a service, call `run()`, format output.
- Prefer official `@salesforce/*` libraries (especially types) over hand-rolled abstractions.

## Domain classes in `core/`

A rule that more than one call site has to remember belongs on an object, not in a comment. Two kinds live in `core/`, and both are data (unlike services, which are behavior with injected collaborators).

- **Value objects** wrap an identifier whose comparison rule is not the default one: `Username` and `TargetName` compare, index, and de-duplicate through `asKey()` (case-folded, matching the org), keep the text as written for display, and `toJSON()` back to a plain string so `--json` payloads stay unchanged. They are deliberately separate classes rather than one with a shared base: the `private` field is what makes them nominally distinct, so one cannot be passed where the other is expected. Convert at the boundary (adapter, flag parsing) and carry the object inward, so the compiler points at every site that compares a name.
- **Aggregates** own the derived questions asked of a record so nobody recomputes them: `Diff` answers `changeCount` and `scopeTo(mode)`, the `ScopedChange` that comes back answers `count`, `usersAffected`, and `drift`, and `Findings` answers `errors`, `warnings`, `hasErrors`, `hasWarnings`, and `concat`. A command that branches on a domain value (`mode === 'destructive'`) to derive data is a missing method here. Selecting a *message* for that value stays in the command.

A collection is where this hides best: two call sites doing the same `filter().length` over the same array is the same missing method, one level up. Reach for the aggregate the moment a second site asks the array a question, and let it own `toJSON()` so the `--json` payload stays the plain array it always was.

Every derived answer is a **method**, never a `get` accessor: `findings.errors()`, not `findings.errors`. A getter reads like a stored field while it actually runs a filter over the whole collection, so the call site cannot see what it costs or that it recomputes on every read. Plain `readonly` fields (`ScopedChange.additions`, `Diff.toAdd`) stay fields, because they are what the object was built with rather than something it works out.

Report DTOs (`Finding`, `AssignmentOutcome`) are the exception, but not because nothing reads them: `level` and `success` both drive the exit code. They carry plain strings because their fields are only ever *displayed*, never compared as identifiers, so a value object would buy nothing.

## Barrels (`index.ts`)

- Each layer/dir has an `index.ts` barrel: `core/`, `services/`, `adapters/`, `services/adapters/`.
- A barrel re-exports **only** the symbols used *outside* that dir, not everything. Add a symbol when an external importer needs it, drop it when none do.
- Consumers import from the barrel (`../../core/index.js`), never from individual files.
- Same-dir imports stay direct (a file in `core/` imports another `core/` file directly, not via the barrel) to avoid cycles.
- This is ESM / NodeNext: import specifiers need the explicit `.js` extension and the full path. There is no directory-index resolution, so `/index.js` cannot be omitted (the build is plain `tsc`, no bundler).

## Services

- Services are **classes**, not free functions (consistent shape; `class-methods-use-this` is on).
- The constructor takes **only injected dependencies** (collaborators like the org client, or a named callback port). A service with no dependencies has no constructor.
- Per-invocation **inputs are `run()` parameters**, not constructor fields. Example: `new PlanService(orgClient)` then `service.run(files, { mode })`.
- Bind the instance to a variable before calling `run()`: no inline `new X(...).run()`.
- Injected callbacks get a named type alias so the port reads like the other dependencies (e.g. `ConfirmDeletions = (count: number) => Promise<boolean>`), rather than a bare inline function type.

## Commands

- Every user-facing message call gets a named private method, prefixed by the sink and suffixed with the PascalCased message key: `this.log(...)` → `logHeaderTitle`/`logSummaryCounts`, `this.error(...)` → `errorInvalid`/`errorMaxDeletes`, `this.confirm(...)` → `confirmDelete`.
- That method takes the raw token values and passes options like `{ exit: 1 }` inside. Pass numbers as-is: `getMessage` tokens accept `number` and every placeholder is `%s`, so no `String()` wrapping.
- Call sites use the method, never `this.log(messages.getMessage(...))` / `this.error(messages.getMessage(...))` / `this.confirm({ message: messages.getMessage(...) })` inline.
- Guards like `if (!this.jsonEnabled())` stay at the call site.
- `messages.createError(...)` and string-returning builders (e.g. `countsLine`) stay as-is.
- Avoid clashing with `SfCommand` built-ins (e.g. `logSuccess` exists on the base class, so name it `logExportSuccess` instead).

## Code style

> Layering, barrel imports, cyclomatic complexity, file and function size and shape caps, braces on every block, four-space indentation, no single-letter names, no `=== undefined`, no `.then()`, no `console`, no `get` accessor, no member access on a fresh `new` or `await`, the trailing comma rule below, and the blank line after a run of `const` declarations are enforced by ESLint (`eslint.config.js`), over the whole repo. The rest are by convention.
>
> Formatting rules come from `@stylistic/eslint-plugin` rather than ESLint core, where they are deprecated and disappear in ESLint 11.

- Every `if`, `else`, and loop body gets braces, and the body starts on the line after the opening brace: no `if (x) return`, no `if (x) { return }` folded onto one line. `} else {` stays on a single line.
- Indentation is four spaces, matching `.editorconfig`, and no line ends in whitespace.

- The complexity and file/function size/shape caps live in `eslint.config.js`, set just above today's largest functions to block future growth, not as targets: prefer smaller. When a function trips a cap, split it into cohesive helpers (e.g. a `collect*` phase and a `render*`/`report*` phase), or bundle params into an options object, rather than raising the cap. A file that trips `max-lines` is holding more than one responsibility: move a cohesive group of helpers into a sibling module (`soql`, `dml`) and import it directly, since a same-dir import does not go through the barrel. Tighten a cap once the outliers shrink.
- `max-lines` and `max-lines-per-function` skip blank lines and comments, so the cap counts logic. The wrapping rules below and a comment explaining a rule must not be what pushes a file over.
- No single-letter variable names, including arrow-fn params and loop vars: use descriptive names.
- Module-level constants are `camelCase`, not `SCREAMING_SNAKE`.
- Prefer `!x` (or `== null` for null-or-undefined) over `x === undefined`.
- Prefer `async`/`await` over `.then()`. Keep parallelism by pushing promises from `async` helpers or `async` map callbacks into a `tasks`/`Promise.all` array, not by awaiting inline.
- Blank line after a run of `const` declarations before the next statement.
- Don't export a symbol unless another file imports it.
- Prefer two loops each doing one thing over one loop doing two things.
- An array or object literal built from more than one element (values, properties, or spreads) goes multiline, one element per line with a trailing comma: `[\n    ...a,\n    ...b,\n]` rather than `[...a, ...b]`. There is no exception for a list that reads as a single logical unit: an enum-style literal list (`options: ['additive', 'destructive', 'sync']`) and a tuple row of a lookup table wrap like everything else, because the rule counts elements and cannot be told what a row means. A destructuring pattern is the same list to `array-bracket-newline` and `object-curly-newline`, so it wraps on the same count. Inside an object pattern the one-name-per-line part is a review call rather than a lint error: `object-property-newline` visits `ObjectExpression`, `TSTypeLiteral` and `TSInterfaceBody`, never `ObjectPattern`, so `{\n    stdout, exitCode,\n}` passes and still has to be split by hand.
- The trailing comma belongs to a wrapped list of two or more, so a list of one is never wrapped in the first place: `f(oneArgument)` on a single line, not `f(\n    oneArgument,\n)`. ESLint gets there from both sides: `comma-dangle` is `always-multiline`, and `array-bracket-newline`, `array-element-newline`, `object-curly-newline`, and `object-property-newline` take the count threshold (`minItems`/`minProperties` of 2) that decides whether the wrap exists at all. A parameter or argument list is the exception, because wrapping one long parameter is what keeps a signature readable: there the comma is allowed rather than required, and dropping it on a list of one is a review call.
- An import or export specifier list is not a value literal: it stays on one line however many names it carries, and breaks only when a specifier itself spans lines.
- Avoid member access on a fresh expression: bind `new X()`, `await f()`, or a plain call `f(...)` to a variable before reading a property or calling a method on it. Prefer `const counts = countFindings(x); if (counts.errors > 0)` over `if (countFindings(x).errors > 0)`. (Fluent library chains like `z.string().min(1)` are exempt.)

## Testing

> One runner. **Mocha plus `@salesforce/cli-plugins-testkit`**, `test/nut/**/*.nut.ts`, which is the NUT convention the Salesforce CLI team standardizes on. Every test spawns the plugin through its own `bin/run.js` and asserts on what came back, so there are no module mocks, no fake timers, and no in-process imports of `src/`. It does not see the published package either: it reads the working tree's `lib/` and `messages/`.
>
> The layout is one directory per command, and inside it the split is by whether a test needs an org, because that decides where it can run. `test/nut/<command>/*.nut.ts` needs none and runs on every pull request including a fork's (`npm test`). `test/nut/<command>/org/*.nut.ts` needs a Dev Hub, uses a scratch org built from `test/nut/project`, and runs separately (`npm run test:org`). The two globs never overlap, which is what keeps a spec needing an org out of the fork-safe run. `run.ts` and `org-session.ts` sit above the command directories because every command shares them.
>
> A command whose offline surface is only its flags and its help text keeps them in one `cli.nut.ts`. `check` has no `org/` at all, because it is the one command with no `--target-org`.
>
> An org test **builds** the state it asserts against rather than borrowing it. Drift, a removal in sync mode, an expiring assignment: none of that exists in a fresh org, so the setup seeds each one on purpose. That is what makes a count exact instead of "whatever the org happens to hold", and what makes `apply` safe to exercise, because the org it writes into is deleted when the session is cleaned.
>
> One scratch org serves every org spec, because creating one costs a slot in the Dev Hub's daily allocation and about a minute. `test/nut/org-session.ts` is what makes that hold across files and across command directories: it registers its `before` and `after` at module level rather than inside a `describe`, so mocha runs them once for the whole glob however many files import the `org` context it fills. A spec reads that context inside an `it`, never at module level, because it is empty until the hook runs. Nothing under an offline path may import it, or `npm test` would try to create a scratch org.
>
> Independence comes from the fixture project instead: it deploys one permission set per job, so no test can observe what another did. Add a test that writes, add a permission set. Never make one test depend on the org state another left behind, and note that files run in glob order across command directories, so a dependency between two of them is not even visible in one place. The licence is the standing exception, because which licences an org has comes from its edition rather than from the fixture: planning it and applying it share `apply/org/license.nut.ts` in that order, which is also why that one file holds a `plan` case.
>
> Reach for `TestSession` only when a test needs an org or a command touches the home directory, the way `plugin-settings` does for `config list`. The offline tests need neither, so they create no session: an unresolvable `--target-org` fails the same on every machine without one.
>
> The one import a test may take from `src/` is a **type** (`import type { PsCheckResult }`), erased before anything runs and part of the published `--json` contract rather than an internal.

Scope and shape

- Black-box the plugin: drive `sf ps ...` and assert only on observable output (stdout, stderr, exit code, files written). Never import `src/` into a test or assert on internal structure: tests coupled to internals fail on every refactor, and those false alarms train us to ignore red builds.
- One behavior per test, written as arrange, act, assert. A failure should point at exactly one cause; when a test asserts five things the first failure masks the rest.
- Name the test after the behavior it asserts (`fails cleanly when the org cannot be resolved`), not after the function or flag it touches. CI shows the name, not the body.
- No conditionals or loops in a test body: a branch can silently skip every assertion and still report green. For a table of inputs give each case its own `it` so it is named and reported on its own, and keep a known gap visible as an `it` with no body, which mocha reports as pending. ESLint enforces this over `test/**/*.nut.ts`. A helper that does not end in `.nut.ts` (`run.ts`, `org-session.ts`, `check/helpers.ts`) is ordinary code and exempt, which is where the one loop the suite needs lives.
- The size caps apply to specs too, and in a spec file they land on the `describe` callback, so the cap is really on the file. That is the point: it keeps one file from accumulating every case for a command. When a file trips it, split it by theme within the command's directory (`plan/org/changes`, `plan/org/drift`, `plan/org/errors`) rather than raising the cap, and give each new file a `describe` named for the theme. Shared setup moves to a sibling helper, not into a fixture the specs then have to be read together to understand.
- In a NUT, always pass `ensureExitCode` to `execCmd` rather than asserting the code afterwards: it fails at the call with the command's stdout and stderr attached, which is the difference between a diagnosable CI failure and a bare number. Use `'nonZero'` where the exact code is not the point. Clean the `TestSession` in an `after()` that always runs, and never use double quotes inside an `execCmd` string, because they do not survive Windows.
- Spell out the state a test depends on instead of growing a shared fixture. Fixtures under `test/fixtures/` stay minimal and single-purpose (one valid file, one schema error, one malformed file), and anything a test needs to be specific about it builds itself.
- Prefer static data, files, and values in a fixture over state derived at run time. Naming users and targets literally makes the expected diff known up front, which turns a loose assertion (`/Plan: [1-9]\d* to add/`) into an exact one (`Plan: 1 to add, 0 to update. 1 users affected.`). Derive from the org only where the derivation is the behavior under test, as in the export round-trips, and keep anything the org decides at run time (the second user, the licence) inside the one hook in `org-session.ts`, so a spec never has to ask the org a question of its own.
- Fix bugs test-first: write the failing spec that reproduces the report, then the fix. Otherwise there is no proof the test detects the bug.
- Don't test the framework. oclif flag parsing, `yaml`, and `zod` are already tested; our validation rules, resolution logic, and messages are where our bugs are.
- Coverage is a diagnostic, not a target. Add a test because a behavior is unverified, never to move a number: executing code without asserting on it changes the metric and not the risk.

CLI contract

- Assert the exit code explicitly on every path, success and failure. Exit codes are the only thing `&&`, `set -e`, and CI can branch on, so an accidental `exit 0` on failure is invisible without an assertion.
- Assert stdout and stderr separately. Diagnostics belong on stderr so `sf ps ... --json | jq` keeps working: a warning leaking into stdout breaks every pipe.
- Cover `--json` and human output as distinct paths, unwrapping the envelope through `parseJson`.
- Treat `--help` text and error messages as interface, and assert the flags and phrasing users depend on. A silent rewording is the CLI equivalent of a breaking API change; the assertion turns it into a reviewed diff.
- Exercise error paths as thoroughly as happy paths: missing file, malformed YAML, schema violation, unresolvable org, guard tripped on a destructive apply. Happy paths get exercised by hand, error paths ship untested.

Determinism and isolation

- Every spec must pass alone and in any order. For the org specs that is the whole constraint, because they share one scratch org and run in glob order across command directories: a spec that only passes after another one wrote something is a bug in the spec, not an ordering to preserve.
- A spec that needs a file writes it into the `TestSession` directory (`org.dir`), never a fixed path under `test/`. The session directory is made per run and removed when the session is cleaned, so two runs on one machine cannot collide. `ps()` also points the child's cwd at the OS temp dir, which is what keeps `execCmd`'s stdout and stderr scratch files out of the repo.
- Offline specs target an alias that resolves nowhere (`unresolvableOrg`, `no-such-org-alias-xyz`) so they fail identically on any machine, without the network or a developer's default org. Nothing in the suite reads a target org from the environment.
- The org specs get their state from the one `before` in `org-session.ts`, seeded onto the permission sets `test/nut/project` deploys. A spec that needs state no other spec has adds a permission set to that project and seeds it in that hook, rather than creating one at run time.
- Reads and writes are split by user so they cannot collide. The export specs scope every command to `--user islandUser`, who holds only the two grants the hook gave them, which is what makes `assignments: 2` an exact count rather than whatever the org happens to hold.
- Users and permission set licences are the two things the fixture project cannot deploy: a user cannot be deleted, only deactivated, and a licence comes with the org's edition. Both are therefore built or discovered at run time (`createUser`, `unassignedLicense`), and the licence is the one resource a spec cannot have to itself.
- The environment the suite depends on is pinned in the wireit `env` block for `test` and `test:org` (`NO_COLOR`, `FORCE_COLOR`, `SF_DISABLE_TELEMETRY`), never read from the machine the suite happens to run on.
- `execCmd` runs synchronously here, so a spec has nothing to await and cannot float a promise. Keep it that way: the async variant settles after the test ends, which passes the test regardless of the outcome and surfaces the rejection inside an unrelated later one.
- Don't assert incidental ordering of rows, keys, or findings unless the command guarantees it: sort before comparing, or assert on membership.

## Testing principles

### General

1. **Test behavior, not implementation**: Tests coupled to internals fail on every refactor even when nothing broke. Those false alarms train the team to ignore failures, which is worse than having no tests.
2. **Arrange/Act/Assert, one behavior**: A failure should point at exactly one cause. When a test asserts five things, the first failure masks the rest and you debug in serial.
3. **Behavioral names**: CI shows you a name, not a body. If the name states the expected behavior, a red build is diagnostic before you open any code, and writing the name forces you to know what you're actually testing.
4. **Determinism**: A test that fails 1% of the time gets re-run instead of investigated, so it stops functioning as a signal. Non-determinism also hides real intermittent bugs in the noise.
5. **Independence**: Order-dependent tests break the moment you parallelize, filter, or run one in isolation to debug it. That's precisely when you most need the suite.
6. **No logic in tests**: Tests are unverified code, and there's no test for your test. Conditionals mean a branch may silently skip all assertions and still report green.
7. **Builders over shared fixtures**: A shared fixture accretes fields until no one knows which matter, so tests break when unrelated fields change. Spelling out only the relevant state makes the test self-documenting.
8. **Error paths**: Happy paths get exercised by manual use and demos, so error paths are what ship untested and surface in production. They're also where recovery logic and cleanup bugs hide.
9. **Coverage as diagnostic**: Coverage measures execution, not verification. Mandate a number and you get tests that call code without asserting on it: the metric goes green and the risk is unchanged.
10. **Failing test first**: It proves the test actually detects the bug. Write the fix first and you can easily end up with a test that would have passed before the change.

### CLI

1. **Exit codes**: They are the only thing shell scripts and CI can branch on. If a pipeline behaves wrong, that is your bug, and only an explicit assertion catches an accidental success code on failure.
2. **stdout vs stderr separately**: If a warning leaks into stdout, anyone piping the output into a JSON processor gets a parse error. The separation is the contract with the entire Unix ecosystem, so the tests have to enforce it.
3. **Inject ambient dependencies**: Anything read from the environment makes the test depend on the machine it runs on. Injection also lets you simulate conditions you can't easily produce for real, like a permission failure or a full disk.
4. **Real temp dirs**: A mocked filesystem encodes your beliefs about the filesystem, and those beliefs are wrong about permissions, symlinks, case-sensitivity, and atomicity. Real dirs are fast enough that the fidelity is nearly free.
5. **TTY and non-TTY**: Interactive niceties become garbage in a log file or a pipe. Untested, you ship escape codes into someone's CI output or a spinner that emits thousands of lines.
6. **Real spawns**: Packaging failures are invisible to in-process tests because they import source directly. A wrong binary path, a missing shebang, or a file left out of the published tarball breaks every user while the suite stays green.

### JS in general

1. **Never float a promise**: Without awaiting, the assertion is scheduled after the test ends, so the test passes regardless of outcome. Worse, the rejection may surface during an unrelated later test.
2. **Pin timezone and locale**: Date and number formatting are environment-dependent, so a suite that passes in São Paulo fails in a UTC CI container. Timezone bugs also cluster at DST boundaries, which only appear on certain machines.
3. **Fail on unhandled rejections**: Node's default is a warning, so an async error in a background handler leaves the test green while the code is broken. Making it fatal converts silent breakage into a visible failure.
4. **Clean up handles**: Node won't exit while a handle is open, so leaks manifest as a suite that hangs at 100% with no error message. Leaked listeners also fire in later tests and cause bewildering cross-talk.
5. **Deep-equality gotchas**: An assertion that treats a missing key and an explicitly undefined value as the same thing lets a bug that drops a field pass. Knowing the semantics is the difference between an assertion that checks something and one that merely looks like it does.
6. **Floats and ordering**: Binary floating point makes exact equality fail for arithmetic that is correct. Asserting incidental array or key order likewise fails on correct changes, making the test worse than useless.
7. **Don't test the framework**: Those tests always pass, so they add runtime and maintenance while catching nothing. Your validation *rules* are the part with your bugs in it.

## Workflow

- README is the source of truth: update it first, then implement to match.
- Commit directly to `main`; do not create branches.

## Prose (docs, comments, commit messages)

- No em-dash character; rewrite with a colon, comma, or parentheses.
- Avoid semicolons in prose; use a period or comma.
- Use markdown hyphen lists, never a literal bullet character.
