# Conventions

Guidelines for working in this repo (an `sf` CLI plugin). These override default behavior.

## Architecture & layering

- Strict dependency direction: **commands → services → core**. Never the reverse.
- `src/core/` stays pure: no `@salesforce/*` imports, no I/O, no CLI concerns. It is plain data + functions.
- `src/services/` may use `@salesforce/core` and talk to the org (through an injected client).
- `src/commands/` is the thin `SfCommand` layer: parse flags, construct a service, call `run()`, format output.
- Prefer official `@salesforce/*` libraries (especially types) over hand-rolled abstractions.

## Barrels (`index.ts`)

- Each layer/dir has an `index.ts` barrel: `core/`, `services/`, `adapters/`, `services/adapters/`.
- A barrel re-exports **only** the symbols used *outside* that dir — not everything. Add a symbol when an external importer needs it, drop it when none do.
- Consumers import from the barrel (`../../core/index.js`), never from individual files.
- Same-dir imports stay direct (a file in `core/` imports another `core/` file directly, not via the barrel) to avoid cycles.
- This is ESM / NodeNext: import specifiers need the explicit `.js` extension and the full path. There is no directory-index resolution, so `/index.js` cannot be omitted (the build is plain `tsc`, no bundler).

## Services

- Services are **classes**, not free functions (consistent shape; `class-methods-use-this` is on).
- The constructor takes **only injected dependencies** (collaborators like the org client, or a named callback port). A service with no dependencies has no constructor.
- Per-invocation **inputs are `run()` parameters**, not constructor fields. Example: `new PlanService(orgClient)` then `service.run(files, { mode })`.
- Bind the instance to a variable before calling `run()` — no inline `new X(...).run()`.
- Injected callbacks get a named type alias so the port reads like the other dependencies (e.g. `ConfirmDeletions = (count: number) => Promise<boolean>`), rather than a bare inline function type.

## Code style

> Layering, barrel imports, no single-letter names, and no `=== undefined` are enforced by ESLint (`eslint.config.js`); the rest are by convention.


- No single-letter variable names, including arrow-fn params and loop vars — use descriptive names.
- Module-level constants are `camelCase`, not `SCREAMING_SNAKE`.
- Prefer `!x` (or `== null` for null-or-undefined) over `x === undefined`.
- Blank line after a run of `const` declarations before the next statement.
- Don't export a symbol unless another file imports it.
- Prefer two loops each doing one thing over one loop doing two things.
- An array literal built from more than one element (values or spreads) goes multiline, one element per line with a trailing comma: `[\n    ...a,\n    ...b,\n]` rather than `[...a, ...b]`. Exceptions that read as a single logical unit stay inline: enum-style literal lists (`options: ['additive', 'destructive', 'sync']`) and tuple rows of a lookup table.
- Avoid member access on a fresh expression: bind `new X()`, `await f()`, or a plain call `f(...)` to a variable before reading a property or calling a method on it. Prefer `const counts = countFindings(x); if (counts.errors > 0)` over `if (countFindings(x).errors > 0)`. (Fluent library chains like `z.string().min(1)` are exempt.)

## Testing

- Black-box the plugin: drive `sf ps ...` and assert only on observable output.
- Real-org tests target the org in `$PS_TARGET_ORG`.

## Workflow

- README is the source of truth: update it first, then implement to match.
- Commit directly to `main`; do not create branches.

## Prose (docs, comments, commit messages)

- No em-dash character; rewrite with a colon, comma, or parentheses.
- Avoid semicolons in prose; use a period or comma.
- Use markdown hyphen lists, never a literal bullet character.
