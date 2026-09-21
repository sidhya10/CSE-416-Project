import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: ['**/dist/**', '**/coverage/**', '**/node_modules/**', 'prisma/migrations/**'],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['**/*.{js,mjs,cjs}'],
    languageOptions: { globals: globals.node },
  },
  {
    files: ['client/**/*.{ts,tsx}'],
    languageOptions: { globals: { ...globals.browser, ...globals.es2022 } },
  },
  {
    files: ['server/**/*.ts', 'prisma/**/*.ts', 'shared/**/*.ts'],
    languageOptions: { globals: { ...globals.node, ...globals.es2022 } },
  },
);
