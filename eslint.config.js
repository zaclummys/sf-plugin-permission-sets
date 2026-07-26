import js from "@eslint/js";
import stylistic from "@stylistic/eslint-plugin";
import globals from "globals";
import tseslint from "typescript-eslint";
import { defineConfig } from "eslint/config";

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
            curly: ["error", "all"],
            // The body starts on the line after the opening brace, and `} else {` stays
            // on one line, so every branch body reads at the same indent.
            "@stylistic/brace-style": ["error", "1tbs", { allowSingleLine: false }],
            // Four spaces, matching .editorconfig, so an editor and the linter never
            // disagree about a line.
            "@stylistic/indent": ["error", 4, { SwitchCase: 1 }],
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
            // Wrap a literal only when it holds more than one element, so the trailing
            // comma above lands only where it buys the one-line diff. Both rules break
            // the line when an element spans lines, and forbid it otherwise.
            "@stylistic/array-bracket-newline": ["error", { multiline: true }],
            "@stylistic/object-curly-newline": ["error", { multiline: true }],
            // Joining a wrapped object back onto one line has to produce { a: 1 }, the
            // spacing the codebase already uses everywhere.
            "@stylistic/object-curly-spacing": ["error", "always"],
            // `smart` still allows `== null`, the null-or-undefined check the codebase
            // prefers, while every other loose comparison has to be explicit.
            eqeqeq: ["error", "smart"],
            // A blank line after a run of const declarations separates what a function
            // gathered from what it does with it. A const following a const is the run.
            "@stylistic/padding-line-between-statements": [
                "error",
                { blankLine: "always", prev: "const", next: "*" },
                { blankLine: "any", prev: "const", next: "const" },
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
            "@typescript-eslint/restrict-template-expressions": ["error", { allowNumber: true }],
            // Both type and interface are allowed: the two differ in declaration merging
            // and in what they can express, so the choice is the declaration's to make.
            "@typescript-eslint/consistent-type-definitions": "off",
        },
    },

    // Project conventions (see CLAUDE.md).
    {
        files: ["src/**/*.ts"],
        rules: {
            // Cap cyclomatic complexity; split branchy functions into helpers.
            complexity: ["error", 10],
            // Size/shape guards, set just above today's max to block future growth
            // (see CLAUDE.md); tighten as functions get split into helpers.
            "max-depth": ["error", 4],
            "max-params": ["error", 5],
            "max-nested-callbacks": ["error", 3],
            "max-statements": ["error", 25],
            "max-lines-per-function": ["error", 65],
            // No single-letter identifiers.
            "id-length": ["error", { min: 2, properties: "never" }],
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
                            group: ["@salesforce/*", "@salesforce/**"],
                            message: "core/ must stay pure: no @salesforce imports.",
                        },
                        {
                            group: ["**/services/**", "**/commands/**", "**/adapters/**"],
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
                            group: ["**/commands/**"],
                            message: "services/ must not import commands (commands -> services -> core).",
                        },
                        {
                            group: ["**/core/*", "!**/core/index.js"],
                            message: "Import core through its index.js barrel.",
                        },
                        {
                            group: ["**/adapters/*", "!**/adapters/index.js"],
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
                            group: ["**/core/*", "!**/core/index.js"],
                            message: "Import core through its index.js barrel.",
                        },
                        {
                            group: ["**/services/*", "!**/services/index.js"],
                            message: "Import services through its index.js barrel.",
                        },
                        {
                            group: ["**/adapters/*", "!**/adapters/index.js"],
                            message: "Import adapters through its index.js barrel.",
                        },
                    ],
                },
            ],
        },
    },

    // Specs only (see CLAUDE.md): a branch in a test body can skip every assertion and
    // still report green. Helpers under test/ are exempt: they are ordinary code.
    {
        files: ["test/**/*.test.js"],
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
