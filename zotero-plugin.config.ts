import { createHash } from 'node:crypto'
import { copyFile, cp, mkdir, readFile } from 'node:fs/promises'
import { resolve } from 'node:path'

import { defineConfig } from 'zotero-plugin-scaffold'

import pkg from './package.json' with { type: 'json' }

const CHAI_SHA256 = 'bdc229d660afad0313fc10d6afb5a339956a18c4c6e819d3eb5d8b94f314c202'
const MOCHA_SHA256 = '7ac4696c5a84aa2c0daa5d01d6be813d5ac94da0c4722e0545bad26606a2b638'

const chaiSource = resolve('tests/zotero/vendor/chai.js')
const mochaSource = resolve('node_modules/mocha/mocha.js')
const scaffoldCache = resolve('.scaffold/cache')
const scaffoldTestVault = resolve('.scaffold/test/data/fixture-vault')
const testFixtureVault = resolve('tests/zotero/fixtures/vault')

async function verifySha256(filePath: string, expected: string): Promise<void> {
  const actual = createHash('sha256')
    .update(await readFile(filePath))
    .digest('hex')
  if (actual !== expected) {
    throw new Error(`SHA-256 mismatch for ${filePath}: expected ${expected}, got ${actual}`)
  }
}

async function prepareZoteroTestHarness(): Promise<void> {
  await Promise.all([verifySha256(chaiSource, CHAI_SHA256), verifySha256(mochaSource, MOCHA_SHA256)])
  await Promise.all([
    mkdir(scaffoldCache, { recursive: true }),
    cp(testFixtureVault, scaffoldTestVault, { recursive: true }),
  ])
  await Promise.all([
    copyFile(chaiSource, resolve(scaffoldCache, 'chai.js')),
    copyFile(mochaSource, resolve(scaffoldCache, 'mocha.js')),
  ])
}

export default defineConfig({
  source: ['src', 'addon'],
  dist: '.scaffold/build',
  name: pkg.config.addonName,
  id: pkg.config.addonID,
  namespace: pkg.config.addonRef,
  // Keep the XPI basename at markdb-connect.xpi to match update manifest links.
  xpiName: pkg.name,
  // The permanent `release` GitHub release serves the update feed; the frozen raw-main manifests only bridge
  // installs from before it.
  updateURL: `https://github.com/{{owner}}/{{repo}}/releases/download/release/${
    pkg.version.includes('-') ? 'update-beta.json' : 'update.json'
  }`,
  xpiDownloadLink: 'https://github.com/{{owner}}/{{repo}}/releases/download/v{{version}}/{{xpiName}}.xpi',

  build: {
    assets: ['addon/**/*.*'],
    define: {
      ...pkg.config,
      author: pkg.author,
      description: pkg.description,
      homepage: pkg.homepage,
      buildVersion: pkg.version,
      buildTime: '{{buildTime}}',
    },
    prefs: {
      prefix: pkg.config.prefsPrefix,
    },
    esbuildOptions: [
      {
        entryPoints: ['src/index.ts'],
        define: {
          __env__: `"${process.env.NODE_ENV}"`,
        },
        bundle: true,
        format: 'iife',
        platform: 'browser',
        target: 'firefox140',
        outfile: `.scaffold/build/addon/content/scripts/${pkg.config.addonRef}.js`,
      },
    ],
    // The generated manifests supply only this release's entry (version, link, hash, range); the release script
    // prepends it to the live feed, which keeps every earlier entry.
    makeUpdateJson: {
      hash: true,
    },
  },

  test: {
    entries: 'tests/zotero',
    waitForPlugin: `() => Zotero.${pkg.config.addonInstance}.data.initialized`,
    hooks: {
      'test:init': async (ctx) => {
        await prepareZoteroTestHarness()
        ctx.test.prefs[`${pkg.config.prefsPrefix}.sourcedir`] = scaffoldTestVault
        // Verify startup repairs an invalid persisted debug mode.
        ctx.test.prefs[`${pkg.config.prefsPrefix}.debugmode`] = 'invalid-test-value'
      },
    },
  },
})
