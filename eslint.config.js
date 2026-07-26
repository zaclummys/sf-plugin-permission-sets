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
            // Prefer !x or == null over an explicit === undefined comparison.
            "no-restricted-syntax": [
                "error",
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
]);
