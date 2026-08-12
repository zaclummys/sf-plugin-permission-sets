# Road to v1.0

`v1.0.0` is the release where the command surface, the flags, and the YAML schema stop being
allowed to change under a minor bump. Everything below is therefore scoped by one question:
what would we regret freezing? Two kinds of work qualify. A correctness bug whose fix changes
what a command prints or does, and a contract decision that is cheap now and breaking later.

Work not on this list is deliberately out of scope. Coverage of `commands/` and `adapters/` is
measured only by the org NUTs, which do not run on a push, and that is acceptable: the 100% gate
covers `core/`, `services/`, and `ui/`, which is where the logic lives.

## Milestones

| Milestone | Holds | Ships as |
| --- | --- | --- |
| M1: reads and writes survive a large org | 1, 2, 3 | a `0.9.x` minor, so the behaviour change lands under the `0.x` rule |
| M2: freeze the contract | 4, 5 | the same minor, or the one before the cut |
| M3: cut the release | 6, 7, 8 | `v1.0.0` |

M1 is the only milestone with a hard ordering: item 1 first, alone, because it is the one that
produces a wrong artifact in silence.

---

## M1. Reads and writes survive a large org

All three are invisible in a scratch org and in every org the test suite has ever seen. They are
listed first because each fix changes observable output, which is exactly what `1.0` gives up the
right to do.

### 1. A query over 10,000 rows is silently truncated

**What is wrong.** `ConnectionOrgClient.query` (`src/adapters/connection-org-client/client.ts`)
calls `autoFetchQuery` without `maxFetch`. The default in `@salesforce/core` is 10,000. Past that
it emits a Lifecycle warning and returns the partial result, so every caller receives a short list
that is indistinguishable from a complete one.

**Why it blocks 1.0.** Each command turns the truncation into a different wrong answer:

- `export` writes a snapshot that looks complete, and that file is what gets committed as the
  source of truth.
- `plan` and `apply` under `additive` do not see assignments that already exist, propose adding
  them again, and collect `DUPLICATE_VALUE` in the failure lines.
- `plan` and `apply` under `sync` miscount unchanged and misreport drift.

None of these reads is meaningful when partial.

**The change.** Read `totalSize` alongside the records and fail when it exceeds what came back,
naming `SF_ORG_MAX_QUERY_LIMIT` and the value the org needs. An error is a better answer than a
plan built on a partial read. Failing is itself the behaviour change that has to land before the
freeze, because after it a user who relies on the truncated result has a case that we broke them.

**How it is tested.** The truncation lives in the adapter, which today is exercised only by the org
NUTs. Testing it needs a fake `Connection` that answers with `totalSize` larger than `records`,
which extends the unit-tested surface from `core`/`services`/`ui` to `adapters`. That is a
convention change worth making on purpose rather than by accident: see the note in
[UNIT_TESTING.md](UNIT_TESTING.md) and update it in the same commit.

### 2. `IN` lists are never chunked

**What is wrong.** Every builder in `src/adapters/connection-org-client/soql.ts` renders one
`IN(...)` holding every username, every target name, or every id it was given. Query length grows
linearly with the size of the permission files.

**Why it blocks 1.0.** SOQL has a statement length limit, and the transport has its own shorter
one, so a file set naming a few thousand users fails before it ever reaches the 10,000 row limit
above. The failure arrives as a transport error rather than as anything the user can act on.

**The change.** Split each list into fixed-size batches, run the batches, and concatenate the
records. The query count per command changes, which is why this belongs before the freeze rather
than after.

**How it is tested.** The builders are pure and take arrays, so the batching is unit-testable
directly on the same fake `Connection` introduced by item 1.

### 3. DML fan-out has no ceiling

**What is wrong.** `runJobs` in `src/adapters/connection-org-client/dml.ts` hands every batch to
one `Promise.all`. The batches are already capped at 200 records each, but their number is not
capped at all, so twenty thousand additions become one hundred simultaneous API calls.

**Why it blocks 1.0.** The org answers with rate limiting or timeouts, and a half-applied run is
the worst outcome this plugin can produce. `UNABLE_TO_LOCK_ROW` is also the ordinary failure of
bulk `PermissionSetAssignment` writes, and today it is reported as a per-record failure rather than
retried.

**The change.** Run the jobs through a pool with a fixed ceiling, and retry a lock contention
failure with backoff before reporting it. Keep the positional pairing of results to records that
`runJobs` documents, since that is what lets a partial success name the rejected rows.

**How it is tested.** The pool and the retry are both observable through the fake `Connection`:
count the concurrent in-flight calls, and answer `UNABLE_TO_LOCK_ROW` once before succeeding.

---

## M2. Freeze the contract

### 4. The result types are not importable

**What is wrong.** [CLAUDE.md](CLAUDE.md) calls `PsCheckResult` and its siblings "part of the
published `--json` contract rather than an internal", and the NUTs import them from `src/`. But
`src/index.ts` is `export default {}`, and `"exports": "./lib/index.js"` in `package.json` blocks
subpath imports, so nobody outside this repo can reach them. The contract is asserted in one place
and withheld in another.

**Why it blocks 1.0.** Publishing them later is additive and harmless. Publishing them and then
discovering the shape is wrong is a major bump. Decide which one it is while the schema is still
free to move.

**The change.** Pick one and make both places agree. Either `src/index.ts` re-exports the four
result types and the README documents them as the typed view of `--json`, or CLAUDE.md stops
calling them a published contract and the NUT import is justified as reaching into our own source.

### 5. `--api-version` is missing

**What is wrong.** No command exposes `Flags.orgApiVersion()`. Every `sf` command that talks to an
org does.

**Why it is here.** Adding a flag is additive, so this does not strictly block the freeze. It is on
the list because it is cheap, it is what the platform's users expect to find, and pinning an api
version is the ordinary way to work around an org-side regression without pinning the plugin.

**The change.** Add the flag to `validate`, `plan`, `export`, and `apply`, and pass it through to
the connection. `check` takes no org and does not get it.

---

## M3. Cut the release

### 6. There is no CHANGELOG

Release notes live only on the GitHub releases page. Under `0.x` that is enough, because the README
already says anything may break. From `1.0` the user needs one file that answers what changed
between two versions, and the semver contract is only as useful as the record of what it protected.
Add `CHANGELOG.md`, backfill it from the existing tags, and note in the README's versioning section
that a release updates it.

### 7. CI tests one point inside the range we promise

`.github/workflows/ci.yml` runs `ubuntu-latest` on Node 24. `engines` promises `>=22.13.0`. The
NUTs already avoid double quotes in `execCmd` because of Windows, and Windows has never run them.
Add a matrix over the ends of both ranges (Node 22.13 and 24, ubuntu and windows) for the jobs that
need no org. The org suite stays on one runner, because a scratch org costs a slot in the Dev Hub's
daily allocation.

### 8. Drop the experimental framing

Three places say this is `0.x` and have to change together at the cut:

- the stability badge at the top of the README
- the major-version-zero warning under it
- the "While on `0.x`" paragraph in the versioning section, whose table already describes the
  contract that takes effect here
