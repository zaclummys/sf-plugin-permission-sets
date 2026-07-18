import js from "@eslint/js";
import globals from "globals";
import tseslint from "typescript-eslint";
import { defineConfig } from "eslint/config";

export default defineConfig([
  { files: ["**/*.{js,mjs,cjs,ts,mts,cts}"], plugins: { js }, extends: ["js/recommended"], languageOptions: { globals: globals.browser } },
  tseslint.configs.recommended,

  // Project conventions (see CLAUDE.md).
  {
    files: ["src/**/*.ts"],
    rules: {
      // No single-letter identifiers.
      "id-length": ["error", { min: 2, properties: "never" }],
      // Prefer !x or == null over an explicit === undefined comparison.
      "no-restricted-syntax": [
        "error",
        {
          selector: "BinaryExpression[operator='==='][right.type='Identifier'][right.name='undefined']",
          message: "Use !x or == null instead of === undefined.",
        },
        {
          selector: "BinaryExpression[operator='!=='][right.type='Identifier'][right.name='undefined']",
          message: "Use x or != null instead of !== undefined.",
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
