import { config } from '../../package.json'
import { prefHelpers } from '../../src/modules/mdbcUX'

import { countMenuRegistrations, getNewHook, getTestPlugin, globalMenuNames, menuIDs } from './helpers/plugin'

const toolkitDefaultPluginID = 'zotero-plugin-toolkit@windingwind.com'

interface ReaderListener {
  type: string
  pluginID?: string
}

function isReaderListener(value: unknown): value is ReaderListener {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof Reflect.get(value, 'type') === 'string' &&
    ['string', 'undefined'].includes(typeof Reflect.get(value, 'pluginID'))
  )
}

function readerListeners(): ReaderListener[] {
  const listeners: unknown = Reflect.get(Zotero.Reader, '_registeredListeners')
  if (!Array.isArray(listeners)) throw new TypeError('Zotero.Reader._registeredListeners is not an array')
  return listeners.filter(isReaderListener)
}

describe('startup', function () {
  it('initializes the plugin in the test environment', function () {
    const plugin = getTestPlugin()
    assert.isTrue(plugin.data.initialized)
    assert.strictEqual(plugin.data.env, 'test')
  })

  it('repairs an invalid persisted debug mode', function () {
    const debugMode = Zotero.Prefs.get(`${config.prefsPrefix}.debugmode`, true)
    assert.strictEqual(debugMode, 'minimal')
  })

  it('accepts slash and hash in a tag name', function () {
    assert.isTrue(prefHelpers.checkTagStr('linked/#note'))
  })

  describe('toolkit lifecycle', function () {
    it('does not patch Zotero item field accessors', function () {
      // zotero-plugin-toolkit's PatchHelper installs a native function named `wrapper`.
      for (const name of ['getField', 'setField', 'isFieldOfBase'] as const) {
        // isFieldOfBase is not an Item method in Zotero 10; the toolkit's patch would create it.
        const accessor: unknown = Reflect.get(Zotero.Item.prototype, name)
        const accessorName = typeof accessor === 'function' ? accessor.name : undefined
        assert.notStrictEqual(accessorName, 'wrapper', `Zotero.Item.prototype.${name} is patched`)
      }
    })

    it('registers its Reader listener under its own plugin ID, once', function () {
      const toolbarListeners = readerListeners().filter((listener) => listener.type === 'renderToolbar')
      assert.lengthOf(
        toolbarListeners.filter((listener) => listener.pluginID === config.addonID),
        1,
      )
      assert.lengthOf(
        toolbarListeners.filter((listener) => listener.pluginID === toolkitDefaultPluginID),
        0,
      )
    })

    it('keeps one toolkit and registers no global menus when a main window loads', async function () {
      const plugin = getTestPlugin()
      const toolkit = plugin.data.ztoolkit

      const counts = await countMenuRegistrations(() => plugin.hooks.onMainWindowLoad(Zotero.getMainWindow()))

      assert.isTrue(plugin.data.ztoolkit === toolkit, 'onMainWindowLoad replaced the toolkit')
      for (const name of globalMenuNames) {
        assert.strictEqual(counts.get(menuIDs[name]) ?? 0, 0, `${name} was registered again`)
      }
    })

    it('keeps keyboard shortcuts working after a main window unloads', function () {
      const plugin = getTestPlugin()
      const win = Zotero.getMainWindow()
      const received: string[] = []
      const callback = (_event: KeyboardEvent, options: { keyboard?: { equals: (shortcut: string) => boolean } }) => {
        if (options.keyboard?.equals('alt,shift,F12')) received.push('alt,shift,F12')
      }

      plugin.data.ztoolkit.Keyboard.register(callback)
      try {
        plugin.hooks.onMainWindowUnload(win)
        const init = { key: 'F12', altKey: true, shiftKey: true, bubbles: true }
        win.dispatchEvent(new KeyboardEvent('keydown', init))
        win.dispatchEvent(new KeyboardEvent('keyup', init))
        assert.deepEqual(received, ['alt,shift,F12'])
      } finally {
        plugin.data.ztoolkit.Keyboard.unregister(callback)
      }
    })
  })

  describe('global menus', function () {
    it('registers the tools and item-context menus at startup', function () {
      const plugin = getTestPlugin()
      const unregisterGlobalUI = getNewHook(plugin, 'unregisterGlobalUI')
      const registerGlobalUI = getNewHook(plugin, 'registerGlobalUI')
      const ensureTroubleshootMenu = getNewHook(plugin, 'ensureTroubleshootMenu')

      let restored: string[] | undefined
      try {
        const results = unregisterGlobalUI()
        for (const name of globalMenuNames) {
          assert.isTrue(results[name], `${name} was not registered`)
        }
      } finally {
        restored = registerGlobalUI()
        ensureTroubleshootMenu()
      }
      assert.lengthOf(restored, globalMenuNames.length)
    })

    it('registers nothing once the plugin has shut down', async function () {
      const plugin = getTestPlugin()
      const unregisterGlobalUI = getNewHook(plugin, 'unregisterGlobalUI')
      const registerGlobalUI = getNewHook(plugin, 'registerGlobalUI')
      const ensureTroubleshootMenu = getNewHook(plugin, 'ensureTroubleshootMenu')

      unregisterGlobalUI()
      plugin.data.alive = false
      try {
        let keys: string[] = []
        let troubleshoot: string | false = false
        const counts = await countMenuRegistrations(() => {
          keys = registerGlobalUI()
          troubleshoot = ensureTroubleshootMenu()
        })
        assert.deepEqual(keys, [])
        assert.isFalse(troubleshoot)
        assert.strictEqual(counts.size, 0)
      } finally {
        plugin.data.alive = true
        registerGlobalUI()
        ensureTroubleshootMenu()
      }
    })
  })
})
