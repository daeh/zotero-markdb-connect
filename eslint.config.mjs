import { dirname, resolve } from 'path'
import { fileURLToPath } from 'url'

import defaultStylisticPlugin from '@stylistic/eslint-plugin'
import javascriptStylisticPlugin from '@stylistic/eslint-plugin-js'
import typescriptStylisticPlugin from '@stylistic/eslint-plugin-ts'
import typescriptEslintPlugin from '@typescript-eslint/eslint-plugin'
import typescriptEslintParser from '@typescript-eslint/parser'
import prettierConfig from 'eslint-config-prettier'
import pluginImport from 'eslint-plugin-import'
import pluginImportConfig from 'eslint-plugin-import/config/recommended.js'
import prettierPlugin from 'eslint-plugin-prettier'
import globals from 'globals'

const projectDirname = dirname(fileURLToPath(import.meta.url))

const allTsExtensionsArray = ['ts', 'mts', 'cts', 'tsx', 'mtsx']
const allJsExtensionsArray = ['js', 'mjs', 'cjs', 'jsx', 'mjsx']
const allTsExtensions = allTsExtensionsArray.join(',')
const allJsExtensions = allJsExtensionsArray.join(',')
const allExtensions = [...allTsExtensionsArray, ...allJsExtensionsArray].join(',')

const env = (() => {
  if (typeof process.env.NODE_ENV === 'undefined') return 'base'
  if (process.env.NODE_ENV === 'development') return 'development'
  if (process.env.NODE_ENV === 'production') return 'production'
  return 'error'
})()

const importRules = {
  'import/no-unresolved': 'error',
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
  'import/order': [
    'error',
    {
      'groups': [
        'builtin', // Built-in imports (come from NodeJS native) go first
        'external', // External imports
        'internal', // Absolute imports
        'parent', // Relative imports
        'sibling', // Relative imports
        // ['sibling', 'parent'], // Relative imports, the sibling and parent types they can be mingled together
        'index', // index imports
        'unknown', // unknown
      ],
      'newlines-between': 'always',
      'alphabetize': {
        order: 'asc',
        caseInsensitive: true, // ignore case
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
  '@stylistic/quotes': ['warn', 'single', { avoidEscape: true, allowTemplateLiterals: false }],
  '@stylistic/object-curly-spacing': ['warn', 'always'],
  '@stylistic/array-element-newline': ['error', 'consistent'],
  // '@stylistic/multiline-ternary': ['warn', 'always'],
}

const typescriptRules = {}

const javascriptRules = {}

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
  // '@typescript-eslint/dot-notation': ['off'],
  // '@typescript-eslint/no-non-null-assertion': 'off',
  '@typescript-eslint/ban-ts-comment': [
    'warn',
    {
      'ts-expect-error': 'allow-with-description',
      'ts-ignore': 'allow-with-description',
      'ts-nocheck': 'allow-with-description',
      'ts-check': 'allow-with-description',
    },
  ],
}

const javascriptRulesDev = {
  '@typescript-eslint/no-unused-vars': ['warn'],
  '@typescript-eslint/no-explicit-any': ['warn', { ignoreRestArgs: true }],
  '@typescript-eslint/no-unsafe-assignment': ['warn'],
  '@typescript-eslint/no-unsafe-member-access': ['off'],
  '@typescript-eslint/no-unsafe-return': ['warn'],
  '@typescript-eslint/no-unsafe-argument': ['warn'],
  '@typescript-eslint/no-unsafe-call': ['off'],
  '@typescript-eslint/restrict-template-expressions': ['off'],
}

const config = [
  {
    /* setup parser for all files */
    files: [`**/*.{${allExtensions}}`],
    languageOptions: {
      sourceType: 'module',
      parser: typescriptEslintParser,
      parserOptions: {
        ecmaVersion: 'latest', // 2024 sets the ecmaVersion parser option to 15
        tsconfigRootDir: resolve(projectDirname),
        project: env === 'production' ? './tsconfig.prod.json' : './tsconfig.json',
      },
    },
  },
  {
    /* all typescript files, except config files */
    files: [`**/*.{${allTsExtensions}}`],
    ignores: [`**/*.config.{${allTsExtensions}}`],
    languageOptions: {
      globals: {
        ...globals.browser,
        // ...globals.node,
        ...globals.es2021,
      },
    },
    plugins: {
      '@typescript-eslint': typescriptEslintPlugin,
      '@stylistic': defaultStylisticPlugin,
      'import': pluginImport,
      'prettier': prettierPlugin,
    },
    rules: {
      ...prettierConfig.rules,
      ...pluginImportConfig.rules,
      ...typescriptEslintPlugin.configs.recommended.rules,
      ...typescriptEslintPlugin.configs['recommended-type-checked'].rules,
      //
      // ...typescriptEslintPlugin.configs.strict.rules,
      // ...typescriptEslintPlugin.configs['strict-type-checked'].rules,
      //
      ...typescriptEslintPlugin.configs['stylistic-type-checked'].rules,
      ...typescriptStylisticPlugin.configs['disable-legacy'].rules,
      ...importRules,
      ...baseRules,
      ...typescriptRules,
    },
  },
  {
    /* +lenient for typescript files in ./src/ folder */
    files: [`src/**/*.{${allTsExtensions}}`],
    ignores: [`**/*.config.{${allTsExtensions}}`],
    settings: {
      'import/resolver': {
        node: {
          extensions: ['.ts'],
        },
        typescript: {
          extensions: ['.ts', '.d.ts'],
        },
      },
    },
    rules: {
      ...typescriptRulesDev,
    },
  },
  {
    /* +strict for typescript files NOT in ./src/ folder (ignoring configs) */
    files: [`**/*.{${allTsExtensions}}`],
    ignores: [`src/**/*.{${allTsExtensions}}`, `**/*.config.{${allTsExtensions}}`],
    rules: {
      ...typescriptEslintPlugin.configs.strict.rules,
      ...typescriptEslintPlugin.configs['strict-type-checked'].rules,
    },
  },
  {
    /* config files: typescript */
    files: [`**/*.config.{${allTsExtensions}}`],
    settings: {
      'import/resolver': {
        typescript: {
          // alwaysTryTypes: true, // always try to resolve types under `<root>@types` directory even it doesn't contain any source code, like `@types/unist`
          project: './tsconfig.json',
        },
      },
    },
    plugins: {
      '@typescript-eslint': typescriptEslintPlugin,
      '@stylistic': defaultStylisticPlugin,
      'import': pluginImport,
      'prettier': prettierPlugin,
    },
    rules: {
      ...prettierConfig.rules,
      ...pluginImportConfig.rules,
      //
      // ...typescriptEslintPlugin.configs.recommended.rules,
      // ...typescriptEslintPlugin.configs['recommended-type-checked'].rules,
      //
      // ...typescriptEslintPlugin.configs.strict.rules,
      // ...typescriptEslintPlugin.configs['strict-type-checked'].rules,
      //
      ...typescriptEslintPlugin.configs['stylistic-type-checked'].rules,
      ...typescriptStylisticPlugin.configs['disable-legacy'].rules,
      ...importRules,
      ...baseRules,
      ...typescriptRules,
      '@typescript-eslint/prefer-nullish-coalescing': ['off'],
    },
  },
  {
    /* all javascript files, except config */
    files: [`**/*.{${allJsExtensions}}`],
    ignores: [`**/*.config.{${allJsExtensions}}`],
    languageOptions: {
      globals: {
        ...globals.browser,
        ...globals.node,
        ...globals.es2021,
      },
    },
    plugins: {
      '@typescript-eslint': typescriptEslintPlugin,
      '@stylistic': defaultStylisticPlugin,
      'import': pluginImport,
      'prettier': prettierPlugin,
    },
    rules: {
      ...prettierConfig.rules,
      ...pluginImportConfig.rules,
      ...typescriptEslintPlugin.configs.recommended.rules,
      ...typescriptEslintPlugin.configs['recommended-type-checked'].rules,
      //
      // ...typescriptEslintPlugin.configs.strict.rules,
      // ...typescriptEslintPlugin.configs['strict-type-checked'].rules,
      //
      ...typescriptEslintPlugin.configs['stylistic'].rules,
      ...javascriptStylisticPlugin.configs['disable-legacy'].rules,
      ...importRules,
      ...baseRules,
      ...javascriptRules,
      ...javascriptRulesDev,
    },
  },
  {
    /* config files: javascript */
    files: [`**/*.config.{${allJsExtensions}}`],
    settings: {
      'import/resolver': {
        typescript: {
          // alwaysTryTypes: true, // always try to resolve types under `<root>@types` directory even it doesn't contain any source code, like `@types/unist`
          project: './tsconfig.json',
        },
      },
    },
    plugins: {
      '@typescript-eslint': typescriptEslintPlugin,
      '@stylistic': defaultStylisticPlugin,
      'import': pluginImport,
      'prettier': prettierPlugin,
    },
    rules: {
      ...prettierConfig.rules,
      ...pluginImportConfig.rules,
      ...typescriptEslintPlugin.configs.recommended.rules,
      ...typescriptEslintPlugin.configs['recommended-type-checked'].rules,
      ...typescriptEslintPlugin.configs.strict.rules,
      ...typescriptEslintPlugin.configs['stylistic'].rules,
      ...javascriptStylisticPlugin.configs['disable-legacy'].rules,
      ...importRules,
      ...baseRules,
      ...javascriptRules,
      '@typescript-eslint/no-unused-vars': ['warn'],
      '@typescript-eslint/no-unsafe-member-access': ['off'],
      '@typescript-eslint/no-unsafe-assignment': ['off'],
      // '@typescript-eslint/no-unsafe-call': ['off'],
    },
  },
  {
    ignores: ['dist', 'build', '_ignores'],
  },
]

export default config
