module.exports = {
    extends: ['eslint-config-salesforce-typescript', 'plugin:sf-plugin/recommended'],
    root: true,
    rules: {
        header: 'off',
        // Use interface for class-implemented contracts and type for data shapes; let the author choose.
        '@typescript-eslint/consistent-type-definitions': 'off',
    },
    overrides: [
        {
            // Co-located unit tests
            files: ['**/*.test.ts'],
            parserOptions: { project: './tsconfig.eslint.json' },
            env: { mocha: true },
            rules: {
                'no-unused-expressions': 'off',
                '@typescript-eslint/explicit-function-return-type': 'off',
                '@typescript-eslint/no-empty-function': 'off',
                '@typescript-eslint/require-await': 'off',
                'import/no-extraneous-dependencies': 'off',
            },
        },
    ],
};
