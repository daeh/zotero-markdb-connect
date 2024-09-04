import { dirname, resolve } from 'path'
import { fileURLToPath } from 'url'

import stylisticPlugin from '@stylistic/eslint-plugin'
import typescriptEslintPlugin from '@typescript-eslint/eslint-plugin'
import typescriptEslintParser from '@typescript-eslint/parser'
import prettierConfig from 'eslint-config-prettier'
import importPlugin from 'eslint-plugin-import'
import prettierPlugin from 'eslint-plugin-prettier'
import globals from 'globals'

const projectDirname = dirname(fileURLToPath(import.meta.url))

const context = (() => {
  if (typeof process.env.NODE_ENV === 'undefined') return 'default'
  if (process.env.NODE_ENV === 'development') return 'development'
  if (process.env.NODE_ENV === 'production') return 'production'
  if (process.env.NODE_ENV === 'repo') return 'repository'
  new Error('Invalid NODE_ENV')
  return 'error'
})()

const projectFilesToIgnore =
  context === 'repository' ? [] : ['.release-it.ts', 'zotero-plugin.config.ts', '*.config.mjs']

const tsconfig = (() => {
  if (context === 'default') return './tsconfig.json'
  if (context === 'development') return './tsconfig.dev.json'
  if (context === 'production') return './tsconfig.prod.json'
  if (context === 'repository') return './tsconfig.repo.json'
  new Error('Invalid context')
  return 'error'
})()

console.log(`env: ${process.env.NODE_ENV}, context: ${context}, tsconfig: ${tsconfig}`)

const allTsExtensionsArray = ['ts', 'mts', 'cts', 'tsx', 'mtsx']
const allJsExtensionsArray = ['js', 'mjs', 'cjs', 'jsx', 'mjsx']
const allTsExtensions = allTsExtensionsArray.join(',')
const allJsExtensions = allJsExtensionsArray.join(',')
const allExtensions = [...allTsExtensionsArray, ...allJsExtensionsArray].join(',')

const importRules = {
  ...importPlugin.flatConfigs.recommended.rules,
  'import/no-unresolved': 'error',
  'import/namespace': 'off',
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
        'type', // type imports
        'object', // object imports
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

const typescriptRules = {
  ...prettierConfig.rules,
  ...typescriptEslintPlugin.configs.recommended.rules,
  ...typescriptEslintPlugin.configs['recommended-type-checked'].rules,
  //
  // ...typescriptEslintPlugin.configs.strict.rules,
  // ...typescriptEslintPlugin.configs['strict-type-checked'].rules,
  //
  ...typescriptEslintPlugin.configs['stylistic-type-checked'].rules,
  ...stylisticPlugin.configs['disable-legacy'].rules,
  ...importRules,
  ...baseRules,
}

const javascriptRules = {
  ...prettierConfig.rules,
  ...typescriptEslintPlugin.configs.recommended.rules,
  ...typescriptEslintPlugin.configs.strict.rules,
  ...typescriptEslintPlugin.configs.stylistic.rules,
  ...stylisticPlugin.configs['disable-legacy'].rules,
  ...importRules,
  ...baseRules,
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
  '@typescript-eslint/consistent-type-imports': ['error', { prefer: 'type-imports' }],
}

const javascriptRulesDev = {}

const config = [
  {
    /* setup parser for all files */
    files: [`**/*.{${allExtensions}}`],
    languageOptions: {
      parser: typescriptEslintParser,
      parserOptions: {
        ecmaVersion: 'latest', // 2024 sets the ecmaVersion parser option to 15
        sourceType: 'module',
        tsconfigRootDir: resolve(projectDirname),
        project: tsconfig,
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
      '@stylistic': stylisticPlugin,
      'import': importPlugin,
      'prettier': prettierPlugin,
    },
    rules: {
      ...typescriptRules,
    },
  },
  {
    /* +strict for typescript files NOT in ./src/ folder */
    files: [`**/*.{${allTsExtensions}}`],
    ignores: [`src/**/*.{${allTsExtensions}}`, 'typing/**/*.d.ts', `**/*.config.{${allTsExtensions}}`],
    plugins: {
      '@typescript-eslint': typescriptEslintPlugin,
      '@stylistic': stylisticPlugin,
    },
    rules: {
      ...typescriptEslintPlugin.configs.strict.rules,
      ...typescriptEslintPlugin.configs['strict-type-checked'].rules,
    },
  },
  {
    /* +lenient for typescript files in ./src/ folder */
    files: [`src/**/*.{${allTsExtensions}}`, 'typing/**/*.d.ts'],
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
    /* config files: javascript */
    files: [`**/*.config.{${allJsExtensions}}`],
    settings: {
      'import/resolver': {
        node: {},
        typescript: {
          extensions: ['.ts', '.d.ts'],
        },
      },
      // 'import/ignore': ['node_modules/firebase'],
    },
    // languageOptions: {
    //   globals: {
    //     ...globals.browser,
    //     ...globals.node,
    //     ...globals.es2021,
    //   },
    // },
    // 'import/resolver': {
    //   // node: {},
    //   typescript: {
    //     extensions: ['.ts', '.d.ts'],
    //   },
    // },
    plugins: {
      '@typescript-eslint': typescriptEslintPlugin,
      '@stylistic': stylisticPlugin,
      'import': importPlugin,
      'prettier': prettierPlugin,
    },
    rules: {
      ...javascriptRules,
      '@typescript-eslint/no-unsafe-assignment': ['off'],
      '@typescript-eslint/no-unused-vars': ['off'],
      '@typescript-eslint/no-unsafe-member-access': ['off'],
    },
  },
  {
    ignores: ['build', 'scripts', '**/*.js', '**/*.bak', ...projectFilesToIgnore],
  },
]

export default config
