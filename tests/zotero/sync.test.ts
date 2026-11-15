import { config } from '../../package.json'
import { ScanMarkdownFiles } from '../../src/modules/mdbcScan'

import {
  countMenuRegistrations,
  getNewHook,
  getTestPlugin,
  menuIDs,
  reportDialogWindow,
  waitFor,
} from './helpers/plugin'

import type { Entry } from '../../src/mdbcTypes'

const fixtureCitationKey = 'mdbc-test-fixture'
const fixtureFilename = `@${fixtureCitationKey}.md`
const fixtureTag = 'ObsCite'

interface ScanInternals {
  sliceObjCustomRegex: (entries: Entry[], keyMap: Map<string, number[]>) => Entry[]
}

function makeEntry(zotkeys: string[]): Entry {
  return {
    citekey: '',
    citekey_metadata: '',
    citekey_title: '',
    name: 'fixture',
    path: fixtureFilename,
    zotids: [],
    zotkeys,
  }
}

describe('Markdown sync', function () {
  let item: Zotero.Item | undefined

  before(async function () {
    item = new Zotero.Item('journalArticle')
    item.libraryID = Zotero.Libraries.userLibraryID
    item.setField('title', 'MarkDB-Connect integration fixture')
    item.setField('citationKey', fixtureCitationKey)
    await item.saveTx()
  })

  after(async function () {
    if (item?.id) {
      await item.eraseTx()
    }
  })

  it('matches the fixture vault and updates the Zotero tag', async function () {
    assert.exists(item)
    const plugin = getTestPlugin()
    await plugin.hooks.syncMarkDB()

    const dataStore = plugin.hooks.DataStore()
    const entries = dataStore.data[item.id.toString()]

    assert.isTrue(dataStore.cleanrun)
    assert.deepEqual(dataStore.zotIds, [item.id])
    assert.lengthOf(entries ?? [], 1)
    assert.strictEqual(entries?.[0]?.name, `@${fixtureCitationKey}`)
    assert.isTrue(entries?.[0]?.path.endsWith(fixtureFilename))
    assert.isTrue(item.hasTag(fixtureTag))
  })

  it('accumulates and deduplicates every matched Zotero key', function () {
    const entry = makeEntry(['FIRSTKEY', 'SECONDKEY', 'FIRSTKEY'])
    const scanInternals = ScanMarkdownFiles as unknown as ScanInternals

    const result = scanInternals.sliceObjCustomRegex(
      [entry],
      new Map([
        ['FIRSTKEY', [11, 12]],
        ['SECONDKEY', [12, 13]],
      ]),
    )

    assert.deepEqual(result[0]?.zotids, [11, 12, 13])
  })

  it('registers the troubleshooting menu once a later scan fails or matches nothing', async function () {
    assert.exists(item)
    const plugin = getTestPlugin()
    const unregisterGlobalUI = getNewHook(plugin, 'unregisterGlobalUI')
    const registerGlobalUI = getNewHook(plugin, 'registerGlobalUI')
    const ensureTroubleshootMenu = getNewHook(plugin, 'ensureTroubleshootMenu')
    const win = Zotero.getMainWindow()

    const sourcedirPref = `${config.prefsPrefix}.sourcedir`
    const fixtureSourcedir = Zotero.Prefs.get(sourcedirPref, true)
    if (typeof fixtureSourcedir !== 'string') throw new TypeError(`${sourcedirPref} is not set to the fixture vault`)
    const emptyDir = PathUtils.join(Zotero.getTempDirectory().path, `mdbc-empty-vault-${String(Date.now())}`)
    const missingDir = `${emptyDir}-missing`
    await IOUtils.makeDirectory(emptyDir)

    const troubleshootCount = async (body: () => unknown) =>
      (await countMenuRegistrations(body)).get(menuIDs.troubleshoot) ?? 0
    const resetMenus = () => {
      unregisterGlobalUI()
      registerGlobalUI()
    }
    const useSourcedir = (path: string): void => {
      Zotero.Prefs.set(sourcedirPref, path, true)
    }

    try {
      // Clean scan with a match: not eligible.
      resetMenus()
      assert.strictEqual(await troubleshootCount(() => plugin.hooks.syncMarkDB()), 0)
      assert.isTrue(plugin.hooks.DataStore().cleanrun)
      assert.deepEqual(plugin.hooks.DataStore().zotIds, [item.id])

      // A later manual sync that matches nothing registers it once; further scans do not repeat it.
      useSourcedir(emptyDir)
      assert.strictEqual(await troubleshootCount(() => plugin.hooks.syncMarkDB()), 1)
      assert.strictEqual(
        await troubleshootCount(async () => {
          await plugin.hooks.syncMarkDB()
          await plugin.hooks.onMainWindowLoad(win)
        }),
        0,
      )

      // The same transition through a window load.
      useSourcedir(fixtureSourcedir)
      await plugin.hooks.syncMarkDB()
      resetMenus()
      assert.strictEqual(await troubleshootCount(() => ensureTroubleshootMenu()), 0)
      useSourcedir(emptyDir)
      assert.strictEqual(await troubleshootCount(() => plugin.hooks.onMainWindowLoad(win)), 1)

      // A sync that fails its configuration check counts as failed and keeps the previous mappings.
      useSourcedir(fixtureSourcedir)
      await plugin.hooks.syncMarkDB()
      resetMenus()
      useSourcedir(missingDir)
      assert.strictEqual(await troubleshootCount(() => plugin.hooks.syncMarkDB()), 1)
      assert.isFalse(plugin.hooks.DataStore().cleanrun)
      assert.deepEqual(plugin.hooks.DataStore().zotIds, [item.id])
    } finally {
      useSourcedir(fixtureSourcedir)
      await IOUtils.remove(emptyDir, { recursive: true })
      resetMenus()
      ensureTroubleshootMenu()
      await plugin.hooks.syncMarkDB()
    }
  })

  it('opens and closes the troubleshooting report dialog', async function () {
    const plugin = getTestPlugin()
    const sourcedirPref = `${config.prefsPrefix}.sourcedir`
    const fixtureSourcedir = Zotero.Prefs.get(sourcedirPref, true)
    if (typeof fixtureSourcedir !== 'string') throw new TypeError(`${sourcedirPref} is not set to the fixture vault`)
    const emptyDir = PathUtils.join(Zotero.getTempDirectory().path, `mdbc-report-vault-${String(Date.now())}`)
    await IOUtils.makeDirectory(emptyDir)

    try {
      // A scan that matches nothing makes the report eligible to open.
      Zotero.Prefs.set(sourcedirPref, emptyDir, true)
      plugin.hooks.syncMarkDBReport()

      const win = await waitFor(() => reportDialogWindow(plugin), 'the report dialog')
      const heading = await waitFor(
        () => (win.document.readyState === 'complete' ? (win.document.querySelector('h1') ?? false) : false),
        'the report heading',
      )
      assert.strictEqual(heading.textContent, config.addonName)

      win.close()
      await waitFor(() => reportDialogWindow(plugin) === undefined, 'the report dialog to close')
    } finally {
      reportDialogWindow(plugin)?.close()
      Zotero.Prefs.set(sourcedirPref, fixtureSourcedir, true)
      await IOUtils.remove(emptyDir, { recursive: true })
      await plugin.hooks.syncMarkDB()
    }
  })
})
