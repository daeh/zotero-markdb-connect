import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { test } from 'node:test'

/**
 * Structural invariants for the hand-maintained root updater manifests.
 *
 * These assertions deliberately require no version comparison, so they can run
 * under plain `node --test` with nothing to get subtly wrong. The semantic
 * question — which entry a given Zotero version is actually offered — needs the
 * real Mozilla version comparator and lives in `tests/zotero/updateRouting.test.ts`.
 *
 * The expected table below is the point: stating the intended shape explicitly
 * means a release that drops or mis-ranges an entry fails here rather than
 * silently stranding the users who depended on it.
 */

const repoRoot = join(import.meta.dirname, '..', '..')

/** Every entry the release add-on must advertise, newest first. */
const EXPECTED_ENTRIES = [
  { version: '0.2.3', min: '9.999', max: '10.*' },
  { version: '0.2.2', min: '8.999', max: '9.*' },
  { version: '0.1.8', min: '6.999', max: '8.*' },
] as const

/**
 * v0.0.27 predates the `applications.zotero` scheme and targets the toolkit via
 * `applications.gecko`. That is what makes it invisible to Zotero 7+ and keeps
 * Zotero 6 from ever being offered anything newer.
 */
const EXPECTED_LEGACY_ENTRY = { version: '0.0.27', geckoMin: '60.9', geckoMax: '60.9' } as const

const MANIFESTS = ['update.json', 'update-beta.json'] as const
type ManifestName = (typeof MANIFESTS)[number]

interface UpdateEntry {
  version: string
  update_link: string
  update_hash?: string
  applications: {
    zotero?: { strict_min_version: string; strict_max_version: string }
    gecko?: { strict_min_version: string; strict_max_version: string }
  }
}

interface Manifest {
  addons: Record<string, { updates: UpdateEntry[] }>
}

function readJson(name: string): unknown {
  return JSON.parse(readFileSync(join(repoRoot, name), 'utf8'))
}

const releaseAddonId = (readJson('package.json') as { config: { addonID: string } }).config.addonID
const manifests = new Map(MANIFESTS.map((name) => [name, readJson(name) as Manifest]))

function releaseEntries(name: ManifestName): UpdateEntry[] {
  const manifest = manifests.get(name)
  assert.ok(manifest, `${name} is readable`)
  const block = manifest.addons[releaseAddonId]
  assert.ok(block, `${name} has an ${releaseAddonId} block`)
  return block.updates
}

for (const name of MANIFESTS) {
  void test(`${name} advertises exactly the expected entries, newest first`, () => {
    const actual = releaseEntries(name).map((entry) => entry.version)
    assert.deepEqual(actual, [...EXPECTED_ENTRIES.map((e) => e.version), EXPECTED_LEGACY_ENTRY.version])
  })

  void test(`${name} declares the expected compatibility range for each entry`, () => {
    const entries = releaseEntries(name)
    for (const expected of EXPECTED_ENTRIES) {
      const entry = entries.find((candidate) => candidate.version === expected.version)
      assert.ok(entry, `${expected.version} is present`)
      assert.deepEqual(
        { min: entry.applications.zotero?.strict_min_version, max: entry.applications.zotero?.strict_max_version },
        { min: expected.min, max: expected.max },
        `${expected.version} range`,
      )
    }
  })

  void test(`${name} keeps v0.0.27 on the legacy gecko selector`, () => {
    const entry = releaseEntries(name).find((candidate) => candidate.version === EXPECTED_LEGACY_ENTRY.version)
    assert.ok(entry, 'v0.0.27 is present')
    // Zotero 7+ skips entries without `applications.zotero`; this is what caps Zotero 6.
    assert.equal(entry.applications.zotero, undefined)
    const gecko = entry.applications.gecko
    assert.ok(gecko, 'v0.0.27 declares a gecko selector')
    assert.equal(gecko.strict_min_version, EXPECTED_LEGACY_ENTRY.geckoMin)
    assert.equal(gecko.strict_max_version, EXPECTED_LEGACY_ENTRY.geckoMax)
  })

  void test(`${name} uses no mutable release links`, () => {
    for (const entry of releaseEntries(name)) {
      assert.doesNotMatch(
        entry.update_link,
        /\/releases\/latest\/download\//,
        `${entry.version} must not point at a mutable latest link`,
      )
    }
  })

  void test(`${name} points every entry at its own release tag`, () => {
    for (const entry of releaseEntries(name)) {
      assert.ok(
        entry.update_link.includes(`/releases/download/v${entry.version}/`),
        `${entry.version} link must reference tag v${entry.version}, got ${entry.update_link}`,
      )
    }
  })

  void test(`${name} declares no duplicate versions`, () => {
    const versions = releaseEntries(name).map((entry) => entry.version)
    assert.equal(new Set(versions).size, versions.length)
  })

  void test(`${name} uses sha512 wherever a hash is present`, () => {
    for (const entry of releaseEntries(name)) {
      if (entry.update_hash !== undefined) {
        assert.match(entry.update_hash, /^sha512:[0-9a-f]{128}$/, `${entry.version} hash format`)
      }
    }
  })
}

void test('the newest entry carries an update hash', () => {
  for (const name of MANIFESTS) {
    const newest = releaseEntries(name)[0]
    assert.ok(newest, `${name} has at least one entry`)
    assert.ok(newest.update_hash, `${name}: newest entry (${newest.version}) must be hashed`)
  }
})

void test('both manifests agree on the release add-on entries', () => {
  const [first, second] = MANIFESTS
  assert.deepEqual(releaseEntries(first), releaseEntries(second))
})

void test('the legacy dev@daeh.info block stays a single entry', () => {
  for (const name of MANIFESTS) {
    const manifest = manifests.get(name)
    assert.ok(manifest)
    const legacy = manifest.addons['dev@daeh.info']
    assert.ok(legacy, `${name} retains the dev@daeh.info block`)
    // It exists to tell stranded 2023 prerelease installs that something newer
    // exists; it is intentionally not an installable update path.
    assert.equal(legacy.updates.length, 1)
  }
})
