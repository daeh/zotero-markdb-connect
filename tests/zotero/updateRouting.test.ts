import addonManifest from '../../addon/manifest.json'
import { config, version as packageVersion } from '../../package.json'
import updateBetaManifest from '../../update-beta.json'
import updateManifest from '../../update.json'

/**
 * Tests which release each Zotero version is offered.
 *
 * Version comparison uses the real `nsIVersionComparator` via `Services.vc`.
 * That comparison is the subtle part: it is why a `9.999` minimum excludes
 * `9.0.6` but admits `10.0`.
 *
 * `parseJSONManifest` and the selection loop from
 * `modules/addons/AddonUpdateChecker.sys.mjs` are modeled, not executed: about
 * 20 lines below mirror them. `AddonUpdateChecker.getNewestCompatibleUpdate()`
 * could be driven directly (it is exported and takes `aAppVersion` as a
 * parameter), but it calls `Blocklist.getAddonBlocklistState()` per candidate,
 * and a release gate should not depend on blocklist data being fetchable.
 *
 * Both behaviors are taken from Zotero 10.0 (Firefox 140 ESR).
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
function selectUpdate(
  entries: readonly UpdateEntry[],
  appVersion: string,
  installedVersion: string,
): UpdateEntry | null {
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
  { zotero: '10.0', installed: '0.0.1', expected: '0.2.5' },
  { zotero: '9.0.6', installed: '0.0.1', expected: '0.2.2' },
  { zotero: '8.0', installed: '0.0.1', expected: '0.1.8' },
  { zotero: '7.0.32', installed: '0.0.1', expected: '0.1.8' },
] as const

/**
 * The release feed (`…/releases/download/release/update[-beta].json`), polled by
 * every install built from the bridge on. It starts as a copy of the frozen root
 * manifests, and each finished release prepends one entry: stable
 * releases on both channels, prereleases on the beta channel only.
 *
 * The scenarios below use synthetic versions for releases that do not exist
 * yet. They pin down how the two feeds hand installs over to each other.
 */

const currentRange = addonManifest.applications.zotero

function entry(version: string, strict_min_version: string, strict_max_version: string): UpdateEntry {
  return {
    version,
    update_link: `https://github.com/daeh/zotero-markdb-connect/releases/download/v${version}/markdb-connect.xpi`,
    applications: { zotero: { strict_min_version, strict_max_version } },
  }
}

const ZOTERO_10 = ['9.999', '10.*'] as const
const ZOTERO_11 = ['10.999', '11.*'] as const

/** The entry the build being tested would prepend: `package.json` version, `addon/manifest.json` range. */
const currentEntry = entry(packageVersion, currentRange.strict_min_version, currentRange.strict_max_version)

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

  it("never offers a release above a version line's ceiling", function () {
    // The complement of the table: each line must not reach the next line's release.
    const ceilings = [
      { zotero: '9.0.6', mustNotReach: '0.2.5' },
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
    // The routing scheme depends on this property, so check it against the real comparator.
    assert.isBelow(Services.vc.compare('9.0.6', '9.999'), 0)
    assert.isAbove(Services.vc.compare('10.0', '9.999'), 0)
    assert.isBelow(Services.vc.compare('10.0', '10.*'), 0)
    assert.isAbove(Services.vc.compare('10.0', '9.*'), 0)
  })

  describe('release feed', function () {
    it('builds the current entry from the manifest range', function () {
      assert.strictEqual(currentRange.strict_min_version, '9.999')
      assert.strictEqual(currentRange.strict_max_version, '10.*')
    })

    const feeds = [
      { channel: 'stable', entries: [currentEntry, ...releaseEntries] },
      { channel: 'beta', entries: [currentEntry, ...betaEntries] },
    ] as const

    for (const { channel, entries } of feeds) {
      const routing = [
        { zotero: '10.0', expected: packageVersion },
        { zotero: '9.0.6', expected: '0.2.2' },
        { zotero: '8.0', expected: '0.1.8' },
        { zotero: '7.0.32', expected: '0.1.8' },
      ]
      for (const { zotero, expected } of routing) {
        it(`offers ${expected} to Zotero ${zotero} on the ${channel} channel`, function () {
          const selected = selectUpdate(entries, zotero, '0.0.1')
          assert.isNotNull(selected, `Zotero ${zotero} must be offered an update`)
          assert.strictEqual(selected.version, expected)
        })
      }

      it(`keeps each older Zotero line below its ceiling on the ${channel} channel`, function () {
        assert.isFalse(isCompatible(currentEntry, '9.0.6'), 'Zotero 9 must not be offered the current release')
        const zotero9Release = entries.find((candidate) => candidate.version === '0.2.2')
        assert.ok(zotero9Release, '0.2.2 is present')
        assert.isFalse(isCompatible(zotero9Release, '8.0'), 'Zotero 8 must not be offered 0.2.2')
        assert.isFalse(isCompatible(zotero9Release, '7.0.32'), 'Zotero 7 must not be offered 0.2.2')
      })
    }

    it('hands an installed v0.2.4 over in two hops: frozen feed, then release feed', function () {
      // Hop 1: v0.2.4 polls the frozen feed, which gains a bridge sharing its head's range.
      const frozenHead = releaseEntries[0]
      assert.ok(frozenHead?.applications.zotero, 'the frozen feed has a Zotero head entry')
      const { strict_min_version, strict_max_version } = frozenHead.applications.zotero
      const bridge = entry('0.2.5', strict_min_version, strict_max_version)
      const frozenWithBridge = [bridge, ...releaseEntries]
      assert.strictEqual(selectUpdate(frozenWithBridge, '10.0', '0.2.4')?.version, '0.2.5')

      // Hop 2: the bridge polls the release feed, which a later release extends.
      const releaseFeed = [entry('0.2.6', ...ZOTERO_10), bridge, ...releaseEntries]
      assert.strictEqual(selectUpdate(releaseFeed, '10.0', '0.2.5')?.version, '0.2.6')
    })

    it("reaches a new Zotero major only through that major's bridge", function () {
      const zotero10Bridge = entry('0.2.5', ...ZOTERO_10)
      const zotero11Bridge = entry('0.3.0', ...ZOTERO_11)

      // An install that missed the Zotero 10 bridge, then upgraded to Zotero 11.
      const withoutZotero11Bridge = [zotero10Bridge, ...releaseEntries]
      assert.isNull(selectUpdate(withoutZotero11Bridge, '11.0', '0.2.4'))

      const withZotero11Bridge = [zotero11Bridge, zotero10Bridge, ...releaseEntries]
      assert.strictEqual(selectUpdate(withZotero11Bridge, '11.0', '0.2.4')?.version, '0.3.0')
      assert.strictEqual(selectUpdate(withZotero11Bridge, '10.0', '0.2.4')?.version, '0.2.5')
    })

    it('narrows an overlapping release to the new major in the frozen feed', function () {
      // 0.3.0 supports Zotero 10 and 11, but its frozen-feed bridge entry advertises only Zotero 11,
      // so Zotero 10 installs still cross via the Zotero 10 bridge.
      const frozen = [entry('0.3.0', ...ZOTERO_11), entry('0.2.5', ...ZOTERO_10), ...releaseEntries]
      assert.strictEqual(selectUpdate(frozen, '10.0', '0.2.4')?.version, '0.2.5')
      assert.strictEqual(selectUpdate(frozen, '11.0', '0.2.4')?.version, '0.3.0')

      // The release feed carries 0.3.0's real range, so bridged Zotero 10 installs reach it there.
      const releaseFeed = [entry('0.3.0', '9.999', '11.*'), entry('0.2.5', ...ZOTERO_10), ...releaseEntries]
      assert.strictEqual(selectUpdate(releaseFeed, '10.0', '0.2.5')?.version, '0.3.0')
    })

    it('keeps offering the last Zotero 10 release after releases move to Zotero 11', function () {
      const releaseFeed = [
        entry('0.3.1', ...ZOTERO_11),
        entry('0.3.0', ...ZOTERO_11),
        entry('0.2.6', ...ZOTERO_10),
        entry('0.2.5', ...ZOTERO_10),
        ...releaseEntries,
      ]
      assert.strictEqual(selectUpdate(releaseFeed, '10.0', '0.2.5')?.version, '0.2.6')
      assert.isNull(selectUpdate(releaseFeed, '10.0', '0.2.6'))
      assert.strictEqual(selectUpdate(releaseFeed, '11.0', '0.2.6')?.version, '0.3.1')
    })

    it('offers a stable Zotero 10 hotfix to beta-channel installs while a Zotero 11 prerelease leads', function () {
      const betaFeed = [
        entry('0.2.7', ...ZOTERO_10),
        entry('0.3.0-beta.1', ...ZOTERO_11),
        entry('0.2.6', ...ZOTERO_10),
        ...betaEntries,
      ]
      assert.strictEqual(selectUpdate(betaFeed, '10.0', '0.2.6')?.version, '0.2.7')
      assert.strictEqual(selectUpdate(betaFeed, '11.0', '0.2.6')?.version, '0.3.0-beta.1')

      const stableFeed = [entry('0.2.7', ...ZOTERO_10), entry('0.2.6', ...ZOTERO_10), ...releaseEntries]
      assert.strictEqual(selectUpdate(stableFeed, '10.0', '0.2.6')?.version, '0.2.7')
      assert.isNull(selectUpdate(stableFeed, '11.0', '0.2.6'))
    })
  })
})
