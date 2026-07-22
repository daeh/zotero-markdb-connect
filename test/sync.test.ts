import { ScanMarkdownFiles } from '../src/modules/mdbcScan'

import { getTestPlugin } from './helpers/plugin'

import type { Entry } from '../src/mdbcTypes'

const fixtureCitationKey = 'mdbc-test-fixture'
const fixtureFilename = `@${fixtureCitationKey}.md`
const fixtureTag = 'ObsCite'

interface ScanInternals {
  sliceObjCustomRegex: (entries: Entry[], keyMap: Record<string, number[]>) => Entry[]
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

    const result = scanInternals.sliceObjCustomRegex([entry], {
      FIRSTKEY: [11, 12],
      SECONDKEY: [12, 13],
    })

    assert.deepEqual(result[0]?.zotids, [11, 12, 13])
  })
})
