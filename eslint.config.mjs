import { dirname, resolve } from 'path'
import { fileURLToPath } from 'url'

import stylisticPlugin from '@stylistic/eslint-plugin'
import zotero from '@zotero-plugin/eslint-config'
import prettierConfig from 'eslint-config-prettier'
import importPlugin from 'eslint-plugin-import-x'
import prettierPlugin from 'eslint-plugin-prettier'
import globals from 'globals'
import tseslint from 'typescript-eslint'

const projectDirname = dirname(fileURLToPath(import.meta.url))

const context = (() => {
  if (typeof process.env.NODE_ENV === 'undefined') return 'default'
  if (process.env.NODE_ENV === 'development') return 'development'
  if (process.env.NODE_ENV === 'production') return 'production'
  if (process.env.NODE_ENV === 'repo') return 'repository'
  return 'error'
})()

const tsconfig = (() => {
  if (context === 'default') return './tsconfig.json'
  if (context === 'development') return './tsconfig.dev.json'
  if (context === 'production') return './tsconfig.prod.json'
  if (context === 'repository') return './tsconfig.repo.json'
  return 'error'
})()

const projectFilesToIgnore =
  context === 'repository' ? [] : ['.release-it.ts', 'zotero-plugin.config.ts', '*.config.mjs']

console.log(`env: ${process.env.NODE_ENV}, context: ${context}, tsconfig: ${tsconfig}`)

const allTsExtensionsArray = ['ts', 'mts', 'cts', 'tsx', 'mtsx']
const allJsExtensionsArray = ['js', 'mjs', 'cjs', 'jsx', 'mjsx']
const allTsExtensions = allTsExtensionsArray.join(',')
const allExtensions = [...allTsExtensionsArray, ...allJsExtensionsArray].join(',')

// Merge rules across a typescript-eslint config array (v8 returns an array of
// entries; rules may be split across multiple entries).
const mergeRules = (configArray) => configArray.reduce((acc, entry) => ({ ...acc, ...(entry.rules ?? {}) }), {})

const typeCheckedPresetRules = {
  ...mergeRules(tseslint.configs.recommendedTypeChecked),
  ...mergeRules(tseslint.configs.stylisticTypeChecked),
}

const strictTypeCheckedPresetRules = mergeRules(tseslint.configs.strictTypeChecked)

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

const baseRules = {
  'prettier/prettier': 'warn',
  '@stylistic/max-len': [
    'warn',
    { code: 120, ignoreComments: true, ignoreTrailingComments: true, ignoreStrings: true, ignoreUrls: true },
  ],
  '@stylistic/indent': ['error', 2, { SwitchCase: 1 }],
  '@stylistic/semi': ['error', 'never'],
  '@stylistic/quotes': ['warn', 'single', { avoidEscape: true, allowTemplateLiterals: 'never' }],
  '@stylistic/object-curly-spacing': ['warn', 'always'],
  '@stylistic/array-element-newline': ['error', 'consistent'],
}

const typescriptRulesDev = {
  '@typescript-eslint/no-explicit-any': ['off', { ignoreRestArgs: true }],
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

export default zotero({
  overrides: [
    // 1. Parser + tsconfig injection for all TS files.
    {
      files: [`**/*.{${allTsExtensions}}`],
      languageOptions: {
        parserOptions: {
          project: tsconfig,
          tsconfigRootDir: resolve(projectDirname),
          ecmaVersion: 'latest',
          sourceType: 'module',
        },
      },
    },

    // 2. Re-layer type-checked presets that the shared config omits.
    //    Applies to all TS files (inside and outside src/).
    {
      files: [`**/*.{${allTsExtensions}}`],
      ignores: [`**/*.config.{${allTsExtensions}}`],
      rules: {
        ...typeCheckedPresetRules,
        ...prettierConfig.rules,
        ...stylisticPlugin.configs['disable-legacy'].rules,
      },
    },

    // 3. +strict-type-checked tier for TS files OUTSIDE src/ and typings/.
    {
      files: [`**/*.{${allTsExtensions}}`],
      ignores: [`src/**/*.{${allTsExtensions}}`, 'typings/**/*.d.ts', `**/*.config.{${allTsExtensions}}`],
      rules: strictTypeCheckedPresetRules,
    },

    // 4. Import rules + stylistic/prettier base rules for all lintable files.
    {
      files: [`**/*.{${allExtensions}}`],
      plugins: {
        '@stylistic': stylisticPlugin,
        'import-x': importPlugin,
        'prettier': prettierPlugin,
      },
      settings: {
        'import-x/resolver': {
          typescript: { project: tsconfig, alwaysTryTypes: true },
          node: { extensions: ['.ts', '.tsx'], moduleDirectory: ['node_modules', 'src/'] },
        },
        'import-x/parsers': {
          '@typescript-eslint/parser': ['.ts', '.tsx'],
        },
      },
      rules: {
        ...importRules,
        ...baseRules,
      },
    },

    // 5. Lenient rules + no-restricted-globals for src/ and typings/.
    //    Layered last so it overrides the stricter presets above.
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

    // 6. Node globals for config files and build scripts (repo-lint mode).
    {
      files: [`**/*.config.{${allJsExtensionsArray.join(',')}}`, `**/*.config.{${allTsExtensions}}`, '.release-it.ts'],
      languageOptions: {
        globals: {
          ...globals.node,
        },
      },
      rules: {
        '@typescript-eslint/no-unsafe-assignment': 'off',
        '@typescript-eslint/no-unsafe-member-access': 'off',
      },
    },

    // 7. Final ignores.
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
        ...projectFilesToIgnore,
      ],
    },
  ],
})
