import zotero from '@zotero-plugin/eslint-config'
import { defineConfig } from 'eslint/config'
import prettierConfig from 'eslint-config-prettier'
import { createTypeScriptImportResolver } from 'eslint-import-resolver-typescript'
import importPlugin from 'eslint-plugin-import-x'
import globals from 'globals'
import tseslint from 'typescript-eslint'

const allTsExtensionsArray = ['ts', 'mts', 'cts', 'tsx', 'mtsx']
const allJsExtensionsArray = ['js', 'mjs', 'cjs', 'jsx', 'mjsx']
const allTsExtensions = allTsExtensionsArray.join(',')
const allExtensions = [...allTsExtensionsArray, ...allJsExtensionsArray].join(',')

const importRules = {
  ...importPlugin.flatConfigs.recommended.rules,
  'import-x/no-unresolved': 'error',
  'import-x/namespace': 'off',
  'sort-imports': [
    'error',
    {
      allowSeparatedGroups: true,
      ignoreCase: true,
      ignoreDeclarationSort: true,
      ignoreMemberSort: false,
      memberSyntaxSortOrder: ['none', 'all', 'multiple', 'single'],
    },
  ],
  'import-x/order': [
    'error',
    {
      'groups': ['builtin', 'external', 'internal', 'parent', 'sibling', 'index', 'type', 'object', 'unknown'],
      'newlines-between': 'always',
      'alphabetize': {
        order: 'asc',
        caseInsensitive: true,
      },
    },
  ],
}

const typescriptRulesDev = {
  '@typescript-eslint/no-explicit-any': 'error',
  '@typescript-eslint/no-unsafe-assignment': ['warn'],
  '@typescript-eslint/no-unsafe-member-access': ['off'],
  '@typescript-eslint/no-unsafe-return': ['warn'],
  '@typescript-eslint/no-unsafe-argument': ['warn'],
  '@typescript-eslint/no-unsafe-call': ['off'],
  '@typescript-eslint/no-unused-vars': ['off'],
  '@typescript-eslint/prefer-nullish-coalescing': ['off'],
  '@typescript-eslint/no-inferrable-types': ['off'],
  '@typescript-eslint/no-floating-promises': ['warn'],
  '@typescript-eslint/require-await': ['warn'],
  '@typescript-eslint/no-non-null-assertion': 'off',
  '@typescript-eslint/ban-ts-comment': [
    'warn',
    {
      'ts-expect-error': 'allow-with-description',
      'ts-ignore': 'allow-with-description',
      'ts-nocheck': 'allow-with-description',
      'ts-check': 'allow-with-description',
    },
  ],
  '@typescript-eslint/consistent-type-imports': ['error', { prefer: 'type-imports' }],
}

export default defineConfig([
  ...zotero(),

  // Type-aware parsing for TypeScript.
  {
    files: [`**/*.{${allTsExtensions}}`],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      parserOptions: {
        projectService: {
          allowDefaultProject: ['zotero-plugin.config.ts'],
          defaultProject: 'tsconfig.repo.json',
        },
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },

  // Type-checked rules outside config files.
  {
    files: ['**/*.{ts,mts,cts,tsx}'],
    ignores: ['**/*.config.*'],
    extends: [tseslint.configs.recommendedTypeChecked, tseslint.configs.stylisticTypeChecked],
  },

  // Strict rules for tests and other maintained TypeScript.
  {
    files: ['**/*.{ts,mts,cts,tsx}'],
    ignores: ['src/**', 'typings/**', '**/*.config.*'],
    extends: [tseslint.configs.strictTypeChecked],
  },

  // Import rules.
  {
    files: [`**/*.{${allExtensions}}`],
    plugins: {
      'import-x': importPlugin,
    },
    settings: {
      'import-x/resolver-next': [
        createTypeScriptImportResolver({
          project: ['./tsconfig.json', './tests/tsconfig.json', './test/tsconfig.json', './tsconfig.repo.json'],
          noWarnOnMultipleProjects: true,
          alwaysTryTypes: true,
        }),
      ],
      'import-x/parsers': {
        '@typescript-eslint/parser': ['.ts', '.tsx'],
      },
    },
    rules: {
      ...importRules,
    },
  },

  // Scaffold-compatible exceptions for plugin source and typings.
  {
    files: [`src/**/*.{${allTsExtensions}}`, 'typings/**/*.d.ts'],
    ignores: [`**/*.config.{${allTsExtensions}}`],
    rules: {
      ...typescriptRulesDev,
      'no-empty': 'off',
      'no-restricted-globals': [
        'error',
        { message: 'Use `Zotero.getMainWindow()` instead.', name: 'window' },
        { message: 'Use `Zotero.getMainWindow().document` instead.', name: 'document' },
        { message: 'Use `Zotero.getActiveZoteroPane()` instead.', name: 'ZoteroPane' },
        'Zotero_Tabs',
      ],
    },
  },

  // Node globals for config files and build scripts.
  {
    files: [`**/*.config.{${allJsExtensionsArray.join(',')}}`, `**/*.config.{${allTsExtensions}}`, '.release-it.ts'],
    languageOptions: {
      globals: {
        ...globals.nodeBuiltin,
      },
    },
    rules: {
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-unsafe-member-access': 'off',
      'import-x/no-named-as-default-member': 'off',
    },
  },

  // Reject explicit `any` throughout maintained TypeScript.
  {
    files: [
      `src/**/*.{${allTsExtensions}}`,
      `tests/**/*.{${allTsExtensions}}`,
      `test/**/*.{${allTsExtensions}}`,
      'typings/**/*.d.ts',
      `*.config.{${allTsExtensions}}`,
    ],
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
    },
  },

  // Node test runner.
  {
    files: ['tests/**/*.ts'],
    languageOptions: {
      globals: {
        ...globals.node,
      },
    },
    rules: {
      'mocha/handle-done-callback': 'off',
      'mocha/max-top-level-suites': 'off',
      'mocha/no-async-suite': 'off',
      'mocha/no-exclusive-tests': 'off',
      'mocha/no-exports': 'off',
      'mocha/no-global-tests': 'off',
      'mocha/no-hooks': 'off',
      'mocha/no-hooks-for-single-case': 'off',
      'mocha/no-identical-title': 'off',
      'mocha/no-mocha-arrows': 'off',
      'mocha/no-nested-tests': 'off',
      'mocha/no-pending-tests': 'off',
      'mocha/no-return-and-callback': 'off',
      'mocha/no-return-from-async': 'off',
      'mocha/no-setup-in-describe': 'off',
      'mocha/no-sibling-hooks': 'off',
      'mocha/no-synchronous-tests': 'off',
      'mocha/no-top-level-hooks': 'off',
      'mocha/prefer-arrow-callback': 'off',
      'mocha/valid-suite-title': 'off',
      'mocha/valid-test-title': 'off',
      'mocha/no-empty-title': 'off',
      'mocha/consistent-spacing-between-blocks': 'off',
      'chai-friendly/no-unused-expressions': 'off',
      '@typescript-eslint/no-unused-expressions': 'off',
    },
  },

  // In-Zotero Mocha/Chai tests.
  {
    files: ['test/**/*.ts'],
    languageOptions: {
      globals: {
        ...globals.mocha,
      },
    },
  },

  // Global ignores.
  {
    ignores: [
      'build/**',
      '.scaffold/**',
      'node_modules/**',
      'scripts/',
      '**/*.js',
      '**/*.bak',
      '**/*-lintignore*',
      '**/*_lintignore*',
    ],
  },

  // Disable lint rules that conflict with Prettier.
  prettierConfig,
])
