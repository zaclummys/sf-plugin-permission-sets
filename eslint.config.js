import js from "@eslint/js";
import stylistic from "@stylistic/eslint-plugin";
import globals from "globals";
import tseslint from "typescript-eslint";
import { defineConfig } from "eslint/config";

// The size and shape caps, applied to source and specs alike. In a spec file the size caps
// land on the describe callback rather than on a function anyone wrote, which is deliberate:
// they are what keeps one file from accumulating every case for a command. Splitting one is
// splitting the file, so every `test/nut/<command>/org` spec shares one scratch org through
// a module-level hook (see test/nut/org-session.ts) rather than creating one per file.
const sharedCaps = {
    complexity: [
        "error",
        10,
    ],
    "max-depth": [
        "error",
        3,
    ],
    "max-lines": [
        "error",
        {
            max: 350,
            skipBlankLines: true,
            skipComments: true,
        },
    ],
    "max-lines-per-function": [
        "error",
        {
            max: 60,
            skipBlankLines: true,
            skipComments: true,
        },
    ],
    "max-nested-callbacks": [
        "error",
        3,
    ],
    "max-params": [
        "error",
        4,
    ],
};

export default defineConfig([
    // Build output is generated JS: it never matches these rules, and linting it
    // buries the real findings under thousands of them.
    {
        ignores: [
            "lib/**",
            ".wireit/**",
            "tmp/**",
        ],
    },

    {
        files: ["**/*.{js,mjs,cjs,ts,mts,cts}"],
        extends: [js.configs.recommended],
        languageOptions: { globals: globals.node },
        plugins: { "@stylistic": stylistic },
        rules: {
            // Always brace a block statement, even a single-line if: a braceless body
            // makes the next added line silently fall outside the branch.
            curly: [
                "error",
                "all",
            ],
            // A ternary inside a ternary hides which branch a reader is in: the cases
            // stop being a list and become precedence to rebuild. Split it into an if,
            // an early return, or a lookup table. The two typed rules that replace a
            // ternary with ?? and ?. come from stylisticTypeChecked below, already on.
            "no-nested-ternary": "error",
            // A ternary whose branches are `true` and `false` is the condition itself,
            // and one that repeats its test (`x ? x : y`) is a default. Both spell out
            // in three parts what one already says.
            "no-unneeded-ternary": "error",
            // The body starts on the line after the opening brace, and `} else {` stays
            // on one line, so every branch body reads at the same indent.
            "@stylistic/brace-style": [
                "error",
                "1tbs",
                { allowSingleLine: false },
            ],
            // Four spaces, matching .editorconfig, so an editor and the linter never
            // disagree about a line.
            "@stylistic/indent": [
                "error",
                4,
                { SwitchCase: 1 },
            ],

            // A trailing comma on a multiline literal keeps the next added element to a
            // one-line diff, and keeps the last line from moving when one is appended.
            // Only a list of two or more carries one, which the rule cannot express: it
            // has no count threshold. The bracket rules below get there instead, by
            // keeping a list of one from ever being wrapped. A parameter or argument
            // list is the exception: wrapping one long parameter is what keeps a
            // signature readable, so there the comma is allowed rather than required.
            "@stylistic/comma-dangle": [
                "error",
                {
                    arrays: "always-multiline",
                    objects: "always-multiline",
                    imports: "always-multiline",
                    exports: "always-multiline",
                    enums: "always-multiline",
                    tuples: "always-multiline",
                    generics: "always-multiline",
                    functions: "only-multiline",
                },
            ],

            "@stylistic/array-bracket-newline": [
                "error",
                {
                    "multiline": true,
                    "minItems": 2,
                },
            ],

            "@stylistic/array-element-newline": [
                "error",
                {
                    "multiline": true,
                    "minItems": 2,
                },
            ],

            "@stylistic/object-curly-newline": [
                "error",
                {
                    "ObjectExpression": {
                        "multiline": true,
                        "minProperties": 2,
                    },
                    "ObjectPattern": {
                        "multiline": true,
                        "minProperties": 2,
                    },
                    // An import or export specifier list is not a value literal: it
                    // stays on one line however many names it carries, and breaks only
                    // when a specifier itself spans lines.
                    "ImportDeclaration": { "multiline": true },
                    "ExportDeclaration": { "multiline": true },
                },
            ],

            // Only visits ObjectExpression, TSTypeLiteral and TSInterfaceBody: a
            // destructuring pattern wraps its braces on the count above, but nothing
            // enforces one name per line inside it. That part is a review call.
            "@stylistic/object-property-newline": [
                "error",
                { "allowAllPropertiesOnSameLine": false },
            ],

            "@stylistic/no-trailing-spaces": "error",

            "@stylistic/object-curly-spacing": [
                "error",
                "always",
            ],
            // `smart` still allows `== null`, the null-or-undefined check the codebase
            // prefers, while every other loose comparison has to be explicit.
            eqeqeq: [
                "error",
                "smart",
            ],
            // A blank line after a run of const declarations separates what a function
            // gathered from what it does with it. A const following a const is the run.
            "@stylistic/padding-line-between-statements": [
                "error",
                {
                    blankLine: "always",
                    prev: "const",
                    next: "*",
                },
                {
                    blankLine: "any",
                    prev: "const",
                    next: "const",
                },
            ],
        },
    },

    // Typed linting: rules that need the type checker. no-floating-promises and
    // no-misused-promises catch the async mistakes that matter in org calls, and the
    // strict tier adds the ones that catch dead code (no-unnecessary-condition) and
    // unchecked assumptions (no-non-null-assertion).
    {
        files: ["**/*.{ts,mts,cts}"],
        extends: [
            tseslint.configs.strictTypeChecked,
            tseslint.configs.stylisticTypeChecked,
        ],
        languageOptions: {
            parserOptions: {
                projectService: true,
                tsconfigRootDir: import.meta.dirname,
            },
        },
        rules: {
            // A number in a template literal needs no formatting decision (`file:line`),
            // so keep the recommended allowance rather than wrap it in String().
            "@typescript-eslint/restrict-template-expressions": [
                "error",
                { allowNumber: true },
            ],
            // Both type and interface are allowed: the two differ in declaration merging
            // and in what they can express, so the choice is the declaration's to make.
            "@typescript-eslint/consistent-type-definitions": "off",
            // An annotation the compiler could infer is still the one place a reader sees
            // the type without hovering, so writing it is the author's call.
            "@typescript-eslint/no-inferrable-types": "off",
            // A leading underscore is how a signature says "required here, deliberately
            // unused", which is a claim the rule cannot make on its own.
            "@typescript-eslint/no-unused-vars": [
                "error",
                {
                    argsIgnorePattern: "^_",
                    varsIgnorePattern: "^_",
                    caughtErrorsIgnorePattern: "^_",
                },
            ],
            // A private field never written outside the constructor is readonly, and
            // saying so is what stops a later method from reassigning it.
            "@typescript-eslint/prefer-readonly": "error",
            // `import type` must not carry a side effect: whether the import is erased
            // depends on a compiler flag, so the intent has to be written down.
            "@typescript-eslint/no-import-type-side-effects": "error",
            // A parameter property reassigned in the constructor body is either dead or
            // a bug, and both read as if the assignment mattered.
            "@typescript-eslint/no-unnecessary-parameter-property-assignment": "error",
            // .sort() with no comparator compares as strings, so [10, 9] sorts to
            // [10, 9]. String arrays are exempt by default, which covers the assignee
            // sort in report.ts, where comparing as strings is the point.
            "@typescript-eslint/require-array-sort-compare": "error",
            // A switch over a union has to handle every member, or adding a Kind falls
            // through the gap it opened instead of failing the build.
            "@typescript-eslint/switch-exhaustiveness-check": "error",
        },
    },

    // Project conventions (see CLAUDE.md).
    {
        files: ["src/**/*.ts"],
        rules: {
            ...sharedCaps,
            // Source only, because a describe callback is a list of cases rather than a
            // procedure: counting its statements would measure how many a file holds.
            "max-statements": [
                "error",
                25,
            ],
            // No single-letter identifiers.
            "id-length": [
                "error",
                {
                    min: 2,
                    properties: "never",
                },
            ],
            // Every user-facing byte goes through SfCommand, which knows about --json:
            // a stray console.log lands in stdout and breaks `sf ps ... | jq`.
            "no-console": "error",
            // One array, because no-restricted-syntax is replaced between config
            // objects rather than merged: a second block would silently drop these.
            "no-restricted-syntax": [
                "error",
                // Prefer !x or == null over an explicit === undefined comparison.
                {
                    selector:
                        "BinaryExpression[operator='==='][right.type='Identifier'][right.name='undefined']",
                    message: "Use !x or == null instead of === undefined.",
                },
                {
                    selector:
                        "BinaryExpression[operator='!=='][right.type='Identifier'][right.name='undefined']",
                    message: "Use x or != null instead of !== undefined.",
                },
                {
                    selector: "CallExpression[callee.property.name='then']",
                    message: "Prefer async/await over .then().",
                },
                // A getter reads like a stored field while it runs a filter over the
                // whole collection, so the call site cannot see what it costs.
                {
                    selector: "MethodDefinition[kind='get']",
                    message: "Every derived answer is a method, never a get accessor: findings.errors(), not findings.errors.",
                },
                // Bind a fresh expression before reading through it, so the call site
                // shows what it built and how often it built it.
                {
                    selector: "MemberExpression[object.type='NewExpression']",
                    message: "Bind the instance to a variable before calling a method on it.",
                },
                {
                    selector: "MemberExpression[object.type='AwaitExpression']",
                    message: "Bind the awaited value to a variable before reading a property on it.",
                },
            ],
        },
    },

    // Layering: core/ stays pure (no @salesforce, no outer layers).
    {
        files: ["src/core/**/*.ts"],
        rules: {
            "no-restricted-imports": [
                "error",
                {
                    patterns: [
                        {
                            group: [
                                "@salesforce/*",
                                "@salesforce/**",
                            ],
                            message: "core/ must stay pure: no @salesforce imports.",
                        },
                        {
                            group: [
                                "**/services/**",
                                "**/commands/**",
                                "**/adapters/**",
                                "**/ui/**",
                            ],
                            message: "core/ must not import from outer layers (commands -> services -> core).",
                        },
                    ],
                },
            ],
        },
    },

    // Layering + barrels: services/ may not import commands, and reach core through its barrel.
    {
        files: ["src/services/**/*.ts"],
        rules: {
            "no-restricted-imports": [
                "error",
                {
                    patterns: [
                        {
                            group: [
                                "**/commands/**",
                                "**/ui/**",
                            ],
                            message: "services/ must not import commands or ui (commands -> services -> core).",
                        },
                        {
                            group: [
                                "**/core/*",
                                "!**/core/index.js",
                            ],
                            message: "Import core through its index.js barrel.",
                        },
                        {
                            group: [
                                "**/adapters/*",
                                "!**/adapters/index.js",
                            ],
                            message: "Import adapters through its index.js barrel.",
                        },
                    ],
                },
            ],
        },
    },

    // Barrels: commands reach every inner layer through its index.js barrel.
    {
        files: ["src/commands/**/*.ts"],
        rules: {
            "no-restricted-imports": [
                "error",
                {
                    patterns: [
                        {
                            group: [
                                "**/core/*",
                                "!**/core/index.js",
                            ],
                            message: "Import core through its index.js barrel.",
                        },
                        {
                            group: [
                                "**/services/*",
                                "!**/services/index.js",
                            ],
                            message: "Import services through its index.js barrel.",
                        },
                        {
                            group: [
                                "**/adapters/*",
                                "!**/adapters/index.js",
                            ],
                            message: "Import adapters through its index.js barrel.",
                        },
                        {
                            group: [
                                "**/ui/*",
                                "!**/ui/index.js",
                            ],
                            message: "Import ui through its index.js barrel.",
                        },
                    ],
                },
            ],
        },
    },

    // Layering: ui/ is the terminal's side of the boundary, so it may reach core and
    // nothing else. Colour depends on a TTY and on the environment, which is exactly
    // what core/ may not know about.
    {
        files: ["src/ui/**/*.ts"],
        rules: {
            "no-restricted-imports": [
                "error",
                {
                    patterns: [
                        {
                            group: [
                                "**/commands/**",
                                "**/services/**",
                                "**/adapters/**",
                            ],
                            message: "ui/ must not import from outer layers (commands -> ui -> core).",
                        },
                        {
                            group: [
                                "**/core/*",
                                "!**/core/index.js",
                            ],
                            message: "Import core through its index.js barrel.",
                        },
                    ],
                },
            ],
        },
    },

    // Test code, specs and helpers alike: a spec is code, so the caps that measure a body
    // rather than a file's structure hold there too.
    {
        files: ["test/**/*.ts"],
        rules: { ...sharedCaps },
    },

    // Specs only (see CLAUDE.md): a branch in a test body can skip every assertion and
    // still report green. A helper that does not end in .nut.ts or .test.ts is exempt
    // (test/nut/run.ts, test/unit/fake-org-client.ts): it is ordinary code, and the loops
    // and branches the suite needs live there for exactly that reason.
    {
        files: [
            "test/**/*.nut.ts",
            "test/**/*.test.ts",
        ],
        rules: {
            "no-restricted-syntax": [
                "error",
                {
                    selector: "IfStatement",
                    message: "No conditionals in a test body: use it.each for a table of inputs, it.todo for a known gap.",
                },
                {
                    selector: "ConditionalExpression",
                    message: "No conditionals in a test body: use it.each for a table of inputs, it.todo for a known gap.",
                },
                {
                    selector: "ForStatement",
                    message: "No loops in a test body: use it.each so each case is named and reported on its own.",
                },
                {
                    selector: "ForOfStatement",
                    message: "No loops in a test body: use it.each so each case is named and reported on its own.",
                },
            ],
        },
    },
]);
