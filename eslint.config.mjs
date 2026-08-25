import eslint from '@eslint/js'
import { defineConfig } from 'eslint/config'
import tseslint from 'typescript-eslint'

export default defineConfig(
  {
    ignores: ['**/build/**', '**/coverage/**', '**/node_modules/**'],
  },
  eslint.configs.recommended,
  {
    rules: {
      // 300 code lines leaves room for cohesive modules while forcing large files to split by responsibility.
      'max-lines': ['error', { max: 300, skipBlankLines: true, skipComments: true }],
      // 50 code lines keeps functions reviewable without penalizing whitespace or explanatory comments.
      'max-lines-per-function': ['error', { max: 50, skipBlankLines: true, skipComments: true }],
      // These complement the size caps without penalizing the codebase's existing straightforward branching.
      complexity: ['error', 12],
      'max-depth': ['error', 3],
    },
  },
  {
    files: ['**/*.ts'],
    extends: [tseslint.configs.recommendedTypeChecked],
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      '@typescript-eslint/consistent-type-imports': 'error',
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
        },
      ],

    },
  }
)
