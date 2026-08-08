#!/usr/bin/env bash
#
# Merge every suite's raw V8 coverage into one report.
#
# The three suites run under one NODE_V8_COVERAGE, so the unit specs and both NUT
# runs land in the same dumps and c8 reports them together. This is not the
# services gate: that one is `npm run test:unit`, which owns .unit-coverage and
# fails on anything under 100%.
#
# The collection's exit status is kept and re-raised at the end rather than
# short-circuiting the rest. A failing suite still has coverage worth reading,
# and which branch stopped executing is usually the fastest way to see why it
# failed. Re-raising is what the chained form this replaced got wrong: the last
# command in the list decided the status, so a broken suite still reported
# success as long as the report itself rendered.

set -uo pipefail

npm run compile || exit $?

rm -rf coverage-dumps coverage

NODE_V8_COVERAGE=coverage-dumps npm run coverage:collect
collected=$?

node scripts/prune-coverage.js || exit $?
c8 report --config .c8rc.report.json || exit $?

exit $collected
