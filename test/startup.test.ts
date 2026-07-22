import { config } from '../package.json'
import { prefHelpers } from '../src/modules/mdbcUX'

import { getTestPlugin } from './helpers/plugin'

const menuIDs = [
  `${config.addonRef}-tools-menu-sync`,
  `${config.addonRef}-tools-menu-troubleshoot`,
  `${config.addonID}-itemmenu-open`,
  `${config.addonID}-itemmenu-reveal`,
  `${config.addonID}-itemmenu-open-submenu`,
  `${config.addonID}-itemmenu-reveal-submenu`,
]
const registeredMenuIDs = menuIDs.map((menuID) => CSS.escape(`${config.addonID}-${menuID}`))

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

  it('registers the tools and item-context menus when a main window loads', async function () {
    const plugin = getTestPlugin()
    const mainWindow = Zotero.getMainWindow()

    await plugin.hooks.onMainWindowLoad(mainWindow)
    const registrations = registeredMenuIDs.map((menuID) => Zotero.MenuManager.unregisterMenu(menuID))

    try {
      assert.deepEqual(
        registrations,
        menuIDs.map(() => true),
      )
    } finally {
      await plugin.hooks.onMainWindowLoad(mainWindow)
    }
  })

  it('accepts slash and hash in a tag name', function () {
    assert.isTrue(prefHelpers.checkTagStr('linked/#note'))
  })
})
