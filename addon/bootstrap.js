/* eslint-disable no-undef */

/**
 * Adapted from Zotero's Make It Red example and Zotero 7 developer documentation:
 * https://github.com/zotero/make-it-red
 * https://www.zotero.org/support/dev/zotero_7_for_developers
 */

var chromeHandle

function install(data, reason) {}

async function startup({ id, version, resourceURI, rootURI }, reason) {
  await Zotero.initializationPromise

  // Zotero 7 introduced rootURI; earlier versions provide resourceURI.
  if (!rootURI) {
    rootURI = resourceURI.spec
  }

  var aomStartup = Components.classes['@mozilla.org/addons/addon-manager-startup;1'].getService(
    Components.interfaces.amIAddonManagerStartup,
  )
  var manifestURI = Services.io.newURI(rootURI + 'manifest.json')
  chromeHandle = aomStartup.registerChrome(manifestURI, [['content', '__addonRef__', rootURI + 'content/']])

  // `_globalThis` is the plugin sandbox's global root. Its properties are
  // available throughout plugin code; see `src/index.ts`.
  const ctx = {
    rootURI,
  }
  ctx._globalThis = ctx

  Services.scriptloader.loadSubScript(`${rootURI}/content/scripts/__addonRef__.js`, ctx)
  await Zotero.__addonInstance__.hooks.onStartup()
}

async function onMainWindowLoad({ window }, reason) {
  await Zotero.__addonInstance__?.hooks.onMainWindowLoad(window)
}

async function onMainWindowUnload({ window }, reason) {
  await Zotero.__addonInstance__?.hooks.onMainWindowUnload(window)
}

function shutdown({ id, version, resourceURI, rootURI }, reason) {
  if (reason === APP_SHUTDOWN) {
    return
  }

  if (typeof Zotero === 'undefined') {
    Zotero = Components.classes['@zotero.org/Zotero;1'].getService(Components.interfaces.nsISupports).wrappedJSObject
  }
  Zotero.__addonInstance__?.hooks.onShutdown()

  Cc['@mozilla.org/intl/stringbundle;1'].getService(Components.interfaces.nsIStringBundleService).flushBundles()

  Cu.unload(`${rootURI}/content/scripts/__addonRef__.js`)

  if (chromeHandle) {
    chromeHandle.destruct()
    chromeHandle = null
  }
}

function uninstall(data, reason) {}
