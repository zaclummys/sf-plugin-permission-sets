// Drop everything but this plugin from the raw V8 coverage dumps.
//
// NODE_V8_COVERAGE records every script a process loaded, and the processes here are the
// whole Salesforce CLI: one `sf ps check` writes about 21000 script entries, of which 300
// are ours. Across the three suites that is 1.3 GB, and c8 loads all of it into one heap
// before its own --include filter ever runs, which is an out-of-memory abort rather than a
// report. Filtering the files first is the difference between needing an 8 GB heap and
// needing none.

import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const tempDirectory = '.v8-coverage';
const ours = `${path.resolve('lib')}/`;

let kept = 0;
let dropped = 0;

for (const name of readdirSync(tempDirectory)) {
    const file = path.join(tempDirectory, name);
    const dump = JSON.parse(readFileSync(file, 'utf8'));
    const mine = dump.result.filter((script) => script.url.includes(ours));

    kept += mine.length;
    dropped += dump.result.length - mine.length;

    writeFileSync(file, JSON.stringify({
        ...dump,
        result: mine,
    }));
}

process.stdout.write(`pruned v8 coverage: kept ${kept} scripts, dropped ${dropped}\n`);
