import { config } from '../../package.json'
import updateBetaManifest from '../../update-beta.json'
import updateManifest from '../../update.json'

/**
 * Which release does each Zotero version actually get offered?
 *
 * Version comparison here is the **real** `nsIVersionComparator` via `Services.vc`
 * — the subtle part, and the reason `9.0.6` is excluded by a `9.999` minimum
 * while `10.0` is admitted.
 *
 * What is modelled rather than executed: `parseJSONManifest` and the selection
 * loop from `modules/addons/AddonUpdateChecker.sys.mjs`, mirrored below in ~20
 * lines. Driving `AddonUpdateChecker.getNewestCompatibleUpdate()` directly is
 * possible — it is exported and takes `aAppVersion` as a parameter — but it
 * calls `Blocklist.getAddonBlocklistState()` per candidate, and a release gate
 * should not depend on blocklist data being fetchable.
 *
 * Both behaviours are taken from Zotero 10.0 (Firefox 140 ESR).
 */

declare const Services: {
  vc: { compare: (a: string, b: string) => number }
}

interface ZoteroApplication {
  strict_min_version: string
  strict_max_version: string
}

interface UpdateEntry {
  version: string
  update_link: string
  applications: { zotero?: ZoteroApplication; gecko?: ZoteroApplication }
}

interface Manifest {
  addons: Record<string, { updates: UpdateEntry[] }>
}

/** Mirrors `matchesVersions()` for a release build, where `strict_max_version` is enforced. */
function isCompatible(entry: UpdateEntry, appVersion: string): boolean {
  // parseJSONManifest skips any entry lacking `applications.zotero` outright.
  const app = entry.applications.zotero
  if (!app) return false
  const min = app.strict_min_version
  const max = app.strict_max_version
  if (Services.vc.compare(appVersion, min) < 0) return false
  if (max !== '*' && Services.vc.compare(appVersion, max) > 0) return false
  return true
}

/** Mirrors `getNewestCompatibleUpdate()`: highest compatible entry strictly newer than installed. */
function selectUpdate(entries: UpdateEntry[], appVersion: string, installedVersion: string): UpdateEntry | null {
  let newestVersion = installedVersion
  let newest: UpdateEntry | null = null
  for (const entry of entries) {
    if (!entry.update_link) continue
    if (Services.vc.compare(newestVersion, entry.version) >= 0) continue
    if (!isCompatible(entry, appVersion)) continue
    newest = entry
    newestVersion = entry.version
  }
  return newest
}

const releaseEntries = (updateManifest as Manifest).addons[config.addonID]?.updates ?? []
const betaEntries = (updateBetaManifest as Manifest).addons[config.addonID]?.updates ?? []

/**
 * Each supported Zotero line and the newest release it may be offered.
 * Add a row per release; a range left un-bumped fails here.
 */
const ROUTING = [
  { zotero: '10.0', installed: '0.0.1', expected: '0.2.4' },
  { zotero: '9.0.6', installed: '0.0.1', expected: '0.2.2' },
  { zotero: '8.0', installed: '0.0.1', expected: '0.1.8' },
  { zotero: '7.0.32', installed: '0.0.1', expected: '0.1.8' },
] as const

describe('updater routing', function () {
  it('has entries to route', function () {
    assert.isAbove(releaseEntries.length, 0)
    assert.deepEqual(releaseEntries, betaEntries)
  })

  for (const row of ROUTING) {
    const { zotero, installed, expected } = row

    it(`offers ${expected} to Zotero ${zotero}`, function () {
      const selected = selectUpdate(releaseEntries, zotero, installed)
      assert.isNotNull(selected, `Zotero ${zotero} must be offered an update`)
      assert.strictEqual(selected.version, expected)
    })
  }

  it('never offers a release above a version line’s ceiling', function () {
    // The complement of the table: each line must not reach the next line's release.
    const ceilings = [
      { zotero: '9.0.6', mustNotReach: '0.2.4' },
      { zotero: '8.0', mustNotReach: '0.2.2' },
      { zotero: '7.0.32', mustNotReach: '0.2.2' },
    ] as const
    for (const { zotero, mustNotReach } of ceilings) {
      const entry = releaseEntries.find((candidate) => candidate.version === mustNotReach)
      assert.ok(entry, `${mustNotReach} is present`)
      assert.isFalse(isCompatible(entry, zotero), `Zotero ${zotero} must not be offered ${mustNotReach}`)
    }
  })

  it('caps Zotero 6 by making newer entries structurally invisible to it', function () {
    // Zotero 6 predates `applications.zotero` and reads `applications.gecko`,
    // so entries carrying only the former can never be selected there.
    for (const entry of releaseEntries) {
      if (entry.version === '0.0.27') continue
      assert.isUndefined(entry.applications.gecko, `${entry.version} must not advertise a gecko selector`)
    }
    const legacy = releaseEntries.find((candidate) => candidate.version === '0.0.27')
    assert.ok(legacy, 'v0.0.27 is present')
    assert.isUndefined(legacy.applications.zotero, 'v0.0.27 must stay invisible to Zotero 7+')
  })

  it('offers nothing when the installed version is already newest', function () {
    assert.isNull(selectUpdate(releaseEntries, '9.0.6', '0.2.2'))
  })

  it('confirms the N.999 minimum excludes its own major line', function () {
    // The property the whole scheme rests on, asserted against the real comparator.
    assert.isBelow(Services.vc.compare('9.0.6', '9.999'), 0)
    assert.isAbove(Services.vc.compare('10.0', '9.999'), 0)
    assert.isBelow(Services.vc.compare('10.0', '10.*'), 0)
    assert.isAbove(Services.vc.compare('10.0', '9.*'), 0)
  })
})
